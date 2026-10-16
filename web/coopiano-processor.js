// The polyphonic instrument in an AudioWorklet: N voices of dsp/coopiano.dsp
// and the body (its `effect`), each a faust-rs wasm DSP. This is what Faust's
// polyphonic architectures do, written out for this instrument:
//
// - the voices' five outputs (four bridge regions and the own-key correction)
//   are summed and feed the body, which is computed once;
// - a control set on the page goes to every voice and to the body (the voice
//   and the body both read the pedal and the voicing controls);
// - a key struck again restrikes its own voice, on the strings still
//   vibrating, as on a piano;
// - a released voice stops being computed after half a second below 1e-6 N
//   on its bridge force, the culling of tools/render.cpp;
// - with no free voice, the quietest released one (else the oldest held one)
//   is faded out over one block, cleared and given the new note;
// - with no voice sounding, the body stops being computed once its output has
//   stayed below 1e-6 (-120 dBFS) for a second, and resumes from its state
//   with the next note.

import { FaustWasmDsp } from "./faust-wasm-dsp.js";

const QUIET_FORCE = 1e-6;
const QUIET_SECONDS = 0.5;
const BODY_QUIET = 1e-6;
const BODY_QUIET_SECONDS = 1;
const STATS_SECONDS = 0.25;
const now = globalThis.performance ? () => globalThis.performance.now() : () => Date.now();

class Voice {
  constructor(dsp) {
    this.dsp = dsp;
    this.key = -1;
    this.held = false;
    this.active = false;
    this.quiet = 0;
    this.started = 0;
    this.level = 0;
    this.next = null; // a note waiting for this voice: { key, velocity }
    this.fading = false; // fading out before being cleared for `next`
    this.retrigger = false; // gate back to 1 at the next block
    this.gateOn = false; // gate set to 1 since the last block: not yet seen
    this.releaseNext = false; // a release that must wait for the strike
  }
}

class CoopianoProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.blockSize = 128;
    this.voiceCompiled = o.voice;
    this.bodyCompiled = o.bodies;
    this.values = new Map(Object.entries(o.controls || {}));
    this.voices = [];
    this.bodies = {};
    this.counter = 0;
    this.mix = Array.from({ length: 5 }, () => new Float64Array(this.blockSize));
    this.setPolyphony(o.polyphony);
    // Both bodies now, so that switching costs nothing in the audio thread.
    for (const name of Object.keys(this.bodyCompiled)) this.bodies[name] = this.makeDsp(this.bodyCompiled[name]);
    this.setBody(o.body);
    this.stats = { busy: 0, frames: 0, peakL: 0, peakR: 0, clips: 0 };
    this.bodyQuiet = 0;
    this.port.onmessage = (event) => this.onMessage(event.data);
    this.port.postMessage({ type: "ready" });
  }

  makeDsp(compiled) {
    const dsp = new FaustWasmDsp(compiled, sampleRate, this.blockSize);
    for (const [key, value] of this.values) dsp.set(key, value);
    return dsp;
  }

  setPolyphony(count) {
    while (this.voices.length < count) this.voices.push(new Voice(this.makeDsp(this.voiceCompiled)));
    if (this.voices.length > count) this.voices.length = count;
  }

  // A body taken back starts from silence, not from the tail it had when it
  // was left.
  setBody(name) {
    const body = this.bodies[name];
    if (!body || body === this.body) return;
    if (this.body) body.exports.instanceClear(0);
    this.body = body;
  }

  onMessage(m) {
    switch (m.type) {
      case "noteOn": this.noteOn(m.key, m.velocity); break;
      case "noteOff": this.noteOff(m.key); break;
      case "control":
        this.values.set(m.key, m.value);
        for (const v of this.voices) v.dsp.set(m.key, m.value);
        for (const b of Object.values(this.bodies)) b.set(m.key, m.value);
        break;
      case "polyphony": this.setPolyphony(m.count); break;
      case "body": this.setBody(m.name); break;
      case "panic":
        for (const v of this.voices) {
          v.dsp.exports.instanceClear(0);
          v.dsp.set("gate", 0);
          Object.assign(v, { key: -1, held: false, active: false, next: null, fading: false, retrigger: false, gateOn: false, releaseNext: false });
        }
        for (const b of Object.values(this.bodies)) b.exports.instanceClear(0);
        break;
      default: break;
    }
  }

  start(voice, key, velocity) {
    voice.dsp.set("freq", 440 * 2 ** ((key - 69) / 12));
    voice.dsp.set("gain", Math.min(1, Math.max(0.02, velocity)));
    voice.dsp.set("gate", 1);
    Object.assign(voice, { key, held: true, active: true, quiet: 0, started: this.counter++, gateOn: true });
  }

  noteOn(key, velocity) {
    // The key's own voice, if it still sounds or waits.
    let voice = this.voices.find((v) => (v.next ? v.next.key === key : v.active && v.key === key));
    if (voice && voice.next) {
      voice.next.velocity = velocity;
      return;
    }
    if (voice) {
      voice.dsp.set("gain", Math.min(1, Math.max(0.02, velocity)));
      if (voice.held) {
        voice.dsp.set("gate", 0); // a rising edge needs one block at 0
        voice.retrigger = true;
      } else {
        voice.dsp.set("gate", 1);
        voice.gateOn = true;
      }
      Object.assign(voice, { held: true, quiet: 0, started: this.counter++, releaseNext: false });
      return;
    }
    voice = this.voices.find((v) => !v.active && !v.next);
    if (voice) {
      this.start(voice, key, velocity);
      return;
    }
    // Steal: the quietest released voice, else the oldest held one.
    const free = this.voices.filter((v) => !v.next);
    if (free.length === 0) return;
    const released = free.filter((v) => !v.held);
    voice = released.length > 0
      ? released.reduce((a, b) => (b.level < a.level ? b : a))
      : free.reduce((a, b) => (b.started < a.started ? b : a));
    voice.next = { key, velocity };
    voice.fading = true;
  }

  // A gate set to 0 in the same block as it was set to 1 would cancel the
  // strike: such a release waits for the block that strikes.
  noteOff(key) {
    for (const v of this.voices) {
      if (v.next && v.next.key === key) {
        v.next.release = true;
      } else if (v.key === key && v.held && !v.next) {
        if (v.retrigger || v.gateOn) {
          v.releaseNext = true;
        } else {
          v.held = false;
          v.dsp.set("gate", 0);
        }
      }
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    const t0 = now();
    for (const m of this.mix) m.fill(0);
    for (const v of this.voices) {
      if (v.next && !v.fading) {
        const { key, velocity, release } = v.next;
        v.next = null;
        this.start(v, key, velocity);
        v.releaseNext = Boolean(release);
      } else if (v.retrigger) {
        v.retrigger = false;
        v.dsp.set("gate", 1);
      }
      if (!v.active) continue;
      v.dsp.compute(n);
      let peak = 0;
      for (let c = 0; c < 5; c += 1) {
        const y = v.dsp.output(c);
        const m = this.mix[c];
        if (v.fading) {
          for (let i = 0; i < n; i += 1) m[i] += y[i] * (1 - i / n);
        } else {
          for (let i = 0; i < n; i += 1) m[i] += y[i];
        }
        if (c < 4) for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(y[i]));
      }
      v.level = peak;
      v.gateOn = false;
      if (v.releaseNext && !v.retrigger) {
        v.releaseNext = false;
        v.held = false;
        v.dsp.set("gate", 0);
      }
      if (v.fading) {
        v.dsp.exports.instanceClear(0);
        v.dsp.set("gate", 0);
        v.fading = false;
        v.active = false;
      } else if (!v.held && peak < QUIET_FORCE) {
        v.quiet += n;
        if (v.quiet > QUIET_SECONDS * sampleRate) v.active = false;
      } else {
        v.quiet = 0;
      }
    }
    const s = this.stats;
    const sounding = this.voices.some((v) => v.active);
    if (sounding) this.bodyQuiet = 0;
    if (this.bodyQuiet < BODY_QUIET_SECONDS * sampleRate) {
      const body = this.body;
      for (let c = 0; c < 5; c += 1) body.input(c).set(this.mix[c]);
      body.compute(n);
      const l = body.output(0);
      const r = body.output(1);
      let peak = 0;
      for (let i = 0; i < n; i += 1) {
        out[0][i] = l[i];
        if (out[1]) out[1][i] = r[i];
        const al = Math.abs(l[i]);
        const ar = Math.abs(r[i]);
        if (al > s.peakL) s.peakL = al;
        if (ar > s.peakR) s.peakR = ar;
        if (al > peak) peak = al;
        if (ar > peak) peak = ar;
        if (al >= 0.999 || ar >= 0.999) s.clips += 1;
      }
      if (!sounding && peak < BODY_QUIET) this.bodyQuiet += n;
      else this.bodyQuiet = 0;
    }
    s.busy += now() - t0;
    s.frames += n;
    if (s.frames >= STATS_SECONDS * sampleRate) {
      this.port.postMessage({
        type: "stats",
        load: s.busy / (1000 * s.frames / sampleRate),
        active: this.voices.filter((v) => v.active).length,
        bodyAsleep: this.bodyQuiet >= BODY_QUIET_SECONDS * sampleRate,
        keys: this.voices.filter((v) => v.active && v.held).map((v) => v.key),
        peakL: s.peakL,
        peakR: s.peakR,
        clips: s.clips,
      });
      this.stats = { busy: 0, frames: 0, peakL: 0, peakR: 0, clips: 0 };
    }
    return true;
  }
}

registerProcessor("coopiano", CoopianoProcessor);

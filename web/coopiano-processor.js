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

// Messages from the page (port.postMessage):
//   { type: "noteOn", key, velocity }    MIDI key, velocity in [0, 1]
//   { type: "noteOff", key }
//   { type: "control", key, value }      a control key ("reverb/mix") to every DSP
//   { type: "polyphony", count }         the number of voices
//   { type: "body", name }               "light" or "full"
//   { type: "panic" }                    silence and reset every DSP
// Messages to the page:
//   { type: "ready" }                    sent once the DSPs are instantiated
//   { type: "stats", load, active, bodyAsleep, keys, peakL, peakR, clips }
//                                        every STATS_SECONDS, see process()
import { FaustWasmDsp } from "./faust-wasm-dsp.js";

// A released voice whose bridge force stays below QUIET_FORCE (N) for
// QUIET_SECONDS stops being computed.
const QUIET_FORCE = 1e-6;
const QUIET_SECONDS = 0.5;
// With no voice sounding, the body sleeps once its output has stayed below
// BODY_QUIET for BODY_QUIET_SECONDS.
const BODY_QUIET = 1e-6;
const BODY_QUIET_SECONDS = 1;
// Period of the statistics sent to the page.
const STATS_SECONDS = 0.25;
// A millisecond clock: `performance` is not defined in every AudioWorklet scope.
const now = globalThis.performance ? () => globalThis.performance.now() : () => Date.now();

/**
 * The state of one voice besides its DSP. A voice is `active` while it is
 * computed (struck, then sounding until culled); `held` while its key is down.
 * A note given to a busy voice waits in `next` while the voice fades out.
 */
class Voice {
  constructor(dsp) {
    this.dsp = dsp;
    // MIDI key of the note, -1 for a voice never used.
    this.key = -1;
    // Key down: the gate is (or is about to be) 1.
    this.held = false;
    // Computed by process(): from the strike to the culling.
    this.active = false;
    // Samples spent below QUIET_FORCE since the release.
    this.quiet = 0;
    // Strike order (this.counter), to steal the oldest held voice.
    this.started = 0;
    // Peak bridge force of the last block, to steal the quietest released voice.
    this.level = 0;
    this.next = null; // a note waiting for this voice: { key, velocity }
    this.fading = false; // fading out before being cleared for `next`
    this.retrigger = false; // gate back to 1 at the next block
    this.gateOn = false; // gate set to 1 since the last block: not yet seen
    this.releaseNext = false; // a release that must wait for the strike
  }
}

/**
 * The AudioWorklet processor "coopiano": the voices, the two bodies, and the
 * message protocol above.
 */
class CoopianoProcessor extends AudioWorkletProcessor {
  /**
   * @param {Object} options - `options.processorOptions` holds `voice` and
   *   `bodies` ({ light, full }): the compiled modules and their JSON; `body`, the
   *   body to start with; `polyphony`, the number of voices; `controls`, the
   *   current value of every control key.
   */
  constructor(options) {
    super();
    const o = options.processorOptions;
    // The render quantum of the Web Audio API.
    this.blockSize = 128;
    this.voiceCompiled = o.voice;
    this.bodyCompiled = o.bodies;
    // The current value of every control, given to each new DSP.
    this.values = new Map(Object.entries(o.controls || {}));
    this.voices = [];
    this.bodies = {};
    // Strike counter (Voice.started).
    this.counter = 0;
    // The sum of the voices' five outputs: the body's input.
    this.mix = Array.from({ length: 5 }, () => new Float64Array(this.blockSize));
    this.setPolyphony(o.polyphony);
    // Both bodies now, so that switching costs nothing in the audio thread.
    for (const name of Object.keys(this.bodyCompiled)) this.bodies[name] = this.makeDsp(this.bodyCompiled[name]);
    this.setBody(o.body);
    // Time spent in process() (ms) over `frames` samples, output peaks and the
    // number of samples near full scale, since the last stats message.
    this.stats = { busy: 0, frames: 0, peakL: 0, peakR: 0, clips: 0 };
    // Samples the body has stayed quiet with no voice sounding.
    this.bodyQuiet = 0;
    this.port.onmessage = (event) => this.onMessage(event.data);
    this.port.postMessage({ type: "ready" });
  }

  /**
   * A new DSP instance with the current control values.
   * @param {{module: WebAssembly.Module, json: Object}} compiled
   * @returns {FaustWasmDsp}
   */
  makeDsp(compiled) {
    const dsp = new FaustWasmDsp(compiled, sampleRate, this.blockSize);
    for (const [key, value] of this.values) dsp.set(key, value);
    return dsp;
  }

  /**
   * Sets the number of voices: new ones are created with the current controls; the
   * voices beyond `count` are dropped, sounding or not.
   * @param {number} count
   */
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

  /**
   * Handles a message of the page (see the protocol at the top of the file).
   * @param {Object} m
   */
  onMessage(m) {
    switch (m.type) {
      case "noteOn": this.noteOn(m.key, m.velocity); break;
      case "noteOff": this.noteOff(m.key); break;
      // Every voice and both bodies: a DSP without the control ignores it.
      case "control":
        this.values.set(m.key, m.value);
        for (const v of this.voices) v.dsp.set(m.key, m.value);
        for (const b of Object.values(this.bodies)) b.set(m.key, m.value);
        break;
      case "polyphony": this.setPolyphony(m.count); break;
      case "body": this.setBody(m.name); break;
      // Clear every DSP's state and free every voice.
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

  /**
   * Strikes `key` on `voice`: pitch, velocity and gate set now, taken into account
   * at the voice's next `compute`. The voice's `freq2m` turns the equal-tempered
   * frequency back into the key number.
   * @param {Voice} voice
   * @param {number} key - MIDI key
   * @param {number} velocity - in [0, 1], clamped to [0.02, 1] as coopiano does
   */
  start(voice, key, velocity) {
    voice.dsp.set("freq", 440 * 2 ** ((key - 69) / 12));
    voice.dsp.set("gain", Math.min(1, Math.max(0.02, velocity)));
    voice.dsp.set("gate", 1);
    Object.assign(voice, { key, held: true, active: true, quiet: 0, started: this.counter++, gateOn: true });
  }

  /**
   * A key pressed. In order: the key's own voice (a waiting note only takes the new
   * velocity; a voice still sounding is struck again, its strings still vibrating);
   * else a free voice; else a voice stolen (the quietest released one, else the
   * oldest held one), which fades out over one block before taking the note.
   * @param {number} key - MIDI key
   * @param {number} velocity - in [0, 1]
   */
  noteOn(key, velocity) {
    // The key's own voice, if it still sounds or waits.
    let voice = this.voices.find((v) => (v.next ? v.next.key === key : v.active && v.key === key));
    if (voice && voice.next) {
      voice.next.velocity = velocity;
      return;
    }
    if (voice) {
      voice.dsp.set("gain", Math.min(1, Math.max(0.02, velocity)));
      // Held: lower the gate for one block so that the voice sees a rising edge.
      // Released: the gate is 0 already, raise it.
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

  /**
   * Renders one block: starts the waiting notes and the restrikes, computes the
   * active voices into the mix, applies their releases and their culling, then
   * computes the body unless it sleeps, and sends the statistics.
   * @param {Array} inputs - unused (the node has no input)
   * @param {Array<Array<Float32Array>>} outputs - one stereo output
   * @returns {boolean} true: the processor stays alive
   */
  process(inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    const t0 = now();
    for (const m of this.mix) m.fill(0);
    for (const v of this.voices) {
      // A stolen voice that has faded out takes its waiting note, and the release
      // that arrived meanwhile; a restruck voice gets its gate back.
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
      // Mix the five outputs (a fading voice with a linear ramp down over the block)
      // and take the peak of the four bridge forces (not the correction channel).
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
      // The gate set to 1 has now been seen: a release can be applied.
      v.gateOn = false;
      if (v.releaseNext && !v.retrigger) {
        v.releaseNext = false;
        v.held = false;
        v.dsp.set("gate", 0);
      }
      // A faded voice is cleared, ready for its waiting note; a released voice is
      // culled after QUIET_SECONDS below QUIET_FORCE.
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
    // The body: computed while a voice sounds, and until its output has stayed
    // quiet for BODY_QUIET_SECONDS; the output buffers stay zero while it sleeps.
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
    // Load = time spent / duration of the audio rendered.
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

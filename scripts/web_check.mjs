// Checks the web build (build/web/*.wasm, made by `make web`) against faustprobe:
// the voice wasm against the native voice for one strike, then both bodies fed
// with the wasm voice's output, and prints what each costs per second of audio
// in this JavaScript engine once compiled by its optimizing tier (an estimate of
// the AudioWorklet load). The wasm must match faustprobe (in double) to -100 dB of
// the peak when compiled with -double, to -50 dB with -single (the default of
// `make web`: about -64 dB for the voice, -71 dB for the bodies).
//
//   node scripts/web_check.mjs        (FAUSTPROBE as in the Makefile)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { FaustWasmDsp } from "../web/faust-wasm-dsp.js";

const FS = 44100;
const BLOCK = 128;
const FAUSTPROBE = process.env.FAUSTPROBE || "../faust-rs/target/release/faustprobe";
const WEB = process.env.WEB_DSP || "web/dsp";

async function load(name) {
  const json = JSON.parse(fs.readFileSync(path.join(WEB, name + ".json"), "utf8"));
  const module = await WebAssembly.compile(fs.readFileSync(path.join(WEB, name + ".wasm")));
  return { json, module };
}

// Renders `frames` samples; `before(frame)` may set parameters at block starts.
function render(dsp, input, frames, before = () => {}) {
  const out = Array.from({ length: dsp.outputs }, () => new Float64Array(frames));
  let ms = 0;
  for (let t = 0; t < frames; t += BLOCK) {
    const n = Math.min(BLOCK, frames - t);
    before(t);
    for (let c = 0; c < dsp.inputs; c += 1) dsp.input(c).set(input[c].subarray(t, t + n));
    const t0 = performance.now();
    dsp.compute(n);
    ms += performance.now() - t0;
    for (let c = 0; c < dsp.outputs; c += 1) out[c].set(dsp.output(c).subarray(0, n), t);
  }
  return { out, ms };
}

function readNpy(file) {
  const buf = fs.readFileSync(file);
  const headerLen = buf.readUInt16LE(8);
  const header = buf.toString("latin1", 10, 10 + headerLen);
  const shape = header.match(/\(([^)]*)\)/)[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  if (!header.includes("<f8")) throw new Error(`${file}: expected float64, got ${header}`);
  const data = new Float64Array(buf.buffer.slice(buf.byteOffset + 10 + headerLen, buf.byteOffset + buf.length));
  const [frames, channels = 1] = shape;
  return Array.from({ length: channels }, (_, c) => Float64Array.from({ length: frames }, (_, i) => data[i * channels + c]));
}

function writeWav64(file, channels) {
  const frames = channels[0].length;
  const nch = channels.length;
  const data = Buffer.alloc(frames * nch * 8);
  for (let i = 0; i < frames; i += 1) for (let c = 0; c < nch; c += 1) data.writeDoubleLE(channels[c][i], (i * nch + c) * 8);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(nch, 22);
  h.writeUInt32LE(FS, 24); h.writeUInt32LE(FS * nch * 8, 28); h.writeUInt16LE(nch * 8, 32); h.writeUInt16LE(64, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

function probe(args) {
  const r = spawnSync(FAUSTPROBE, ["--double", "-I", "dsp", "--quiet", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

// Share of a core one second of audio costs, after two seconds that let the
// engine's optimizing compiler take over from its baseline one.
function cost(dsp, before = () => {}) {
  for (let c = 0; c < dsp.inputs; c += 1) dsp.input(c).fill(1e-3);
  const blocks = Math.round(FS / BLOCK);
  let ms = 0;
  for (let b = 0; b < 3 * blocks; b += 1) {
    before(b);
    const t0 = performance.now();
    dsp.compute(BLOCK);
    if (b >= 2 * blocks) ms += performance.now() - t0;
  }
  return (100 * ms / 1000).toFixed(1);
}

// Largest difference relative to the reference's peak, in dB.
function relError(a, b) {
  let peak = 0, err = 0;
  for (let c = 0; c < a.length; c += 1) {
    for (let i = 0; i < a[c].length; i += 1) {
      peak = Math.max(peak, Math.abs(b[c][i]));
      err = Math.max(err, Math.abs(a[c][i] - b[c][i]));
    }
  }
  return 20 * Math.log10(Math.max(err, 1e-300) / peak);
}

const double = /(^|\s)-double(\s|$)/.test(JSON.parse(fs.readFileSync(path.join(WEB, "voice.json"), "utf8")).compile_options || "");
const limit = double ? -100 : -50;
console.log(`modules in ${double ? "double" : "single"} precision: wasm vs faustprobe must be under ${limit} dB of the peak`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coopiano-web-"));
let worst = -Infinity;
try {
  const frames = FS; // one second, released at a block boundary near 0.5 s
  const release = Math.round(FS / 2 / BLOCK) * BLOCK;
  const voice = new FaustWasmDsp(await load("voice"), FS, BLOCK);
  voice.set("freq", 261.6255653);
  voice.set("gain", 0.5);
  const v = render(voice, [], frames, (t) => voice.set("gate", t < release ? 1 : 0));
  probe(["-n", String(frames), "--in", "zero", "--set", "freq=261.6255653", "--set", "/coopiano/gain=0.5",
    "--at", "0", "gate=1", "--at", String(release), "gate=0", "--out", path.join(tmp, "voice.npy"), "dsp/coopiano.dsp"]);
  const e = relError(v.out, readNpy(path.join(tmp, "voice.npy")));
  worst = Math.max(worst, e);
  const held = new FaustWasmDsp(await load("voice"), FS, BLOCK);
  held.set("freq", 261.6255653);
  held.set("gate", 1);
  console.log(`voice      C4 vel 0.5: wasm vs faustprobe ${e.toFixed(1)} dB of the peak; ${cost(held)} % of a core while sounding`);

  writeWav64(path.join(tmp, "force.wav"), v.out);
  for (const [name, dsp] of [["body", "dsp/coopiano.dsp"], ["body_light", "dsp/coopiano_light.dsp"]]) {
    const body = new FaustWasmDsp(await load(name), FS, BLOCK);
    const b = render(body, v.out, frames);
    probe(["-pn", "effect", "-n", String(frames), "--in", `file:${path.join(tmp, "force.wav")}`,
      "--out", path.join(tmp, name + ".npy"), dsp]);
    const eb = relError(b.out, readNpy(path.join(tmp, name + ".npy")));
    worst = Math.max(worst, eb);
    const up = cost(new FaustWasmDsp(await load(name), FS, BLOCK));
    const pedalled = new FaustWasmDsp(await load(name), FS, BLOCK);
    pedalled.set("action/pedal", 1);
    console.log(`${name.padEnd(10)} pedal up : wasm vs faustprobe ${eb.toFixed(1)} dB of the peak; ${up} % of a core (pedal down: ${cost(pedalled)} %)`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (worst > limit) {
  console.log(`FAIL: wasm differs from faustprobe by ${worst.toFixed(1)} dB`);
  process.exit(1);
}

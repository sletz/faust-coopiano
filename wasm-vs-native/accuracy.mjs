// Largest difference between two module sets on web_check's renders: the voice
// (C4, velocity 0.5, released at 0.5 s), then each body fed with that voice.
import fs from "node:fs";
import path from "node:path";
import { FaustWasmDsp } from "../web/faust-wasm-dsp.js";
const [dirA, dirB] = process.argv.slice(2);
const FS = 44100, BLOCK = 128, frames = FS, release = Math.round(FS / 2 / BLOCK) * BLOCK;
async function load(dir, name) {
  return { json: JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8")), module: await WebAssembly.compile(fs.readFileSync(path.join(dir, name + ".wasm"))) };
}
function render(dsp, input, before = () => {}) {
  const out = Array.from({ length: dsp.outputs }, () => new Float64Array(frames));
  for (let t = 0; t < frames; t += BLOCK) {
    const n = Math.min(BLOCK, frames - t);
    before(t);
    for (let c = 0; c < dsp.inputs; c += 1) dsp.input(c).set(input[c].subarray(t, t + n));
    dsp.compute(n);
    for (let c = 0; c < dsp.outputs; c += 1) out[c].set(dsp.output(c).subarray(0, n), t);
  }
  return out;
}
function relDb(a, b) {
  let peak = 0, err = 0;
  for (let c = 0; c < a.length; c += 1) for (let i = 0; i < a[c].length; i += 1) { peak = Math.max(peak, Math.abs(b[c][i])); err = Math.max(err, Math.abs(a[c][i] - b[c][i])); }
  return 20 * Math.log10(Math.max(err, 1e-300) / peak);
}
const voices = [];
for (const dir of [dirA, dirB]) {
  const v = new FaustWasmDsp(await load(dir, "voice"), FS, BLOCK);
  v.set("freq", 261.6255653); v.set("gain", 0.5);
  voices.push(render(v, [], (t) => v.set("gate", t < release ? 1 : 0)));
}
console.log(`voice: ${relDb(voices[1], voices[0]).toFixed(1)} dB of the peak`);
for (const name of ["body", "body_light"]) {
  const outs = [];
  for (const dir of [dirA, dirB]) outs.push(render(new FaustWasmDsp(await load(dir, name), FS, BLOCK), voices[0]));
  console.log(`${name}: ${relDb(outs[1], outs[0]).toFixed(1)} dB of the peak (same input)`);
}

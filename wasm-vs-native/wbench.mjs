// Same workload as scripts/web_check.mjs (and build/study/nbench.cpp): 128-frame
// blocks at 44.1 kHz; the voice holds C4; a body gets 1e-3 on every input,
// pedal up or down. Two seconds of warm-up, then SECONDS measured.
//   node wasm-vs-native/wbench.mjs MODE SECONDS [DIR] [--count] [--pow-exp-log]
// --count wraps Math's functions and prints their calls per sample instead.
import fs from "node:fs";
import path from "node:path";
import { FaustWasmDsp } from "../web/faust-wasm-dsp.js";

const args = process.argv.slice(2);
const count = args.includes("--count");
// --pow-exp-log: Math.pow replaced by exp(y log x) (bases > 0), to see what pow itself costs.
if (args.includes("--pow-exp-log")) { const e = Math.exp, l = Math.log; Math.pow = (x, y) => e(y * l(x)); }
const [mode, seconds, dir = "web/dsp"] = args.filter((a) => !a.startsWith("--"));
const FS = 44100, BLOCK = 128;
const name = mode === "voice" ? "voice" : mode.startsWith("body") ? "body" : "body_light";
const calls = {};
if (count) {
  for (const f of ["sin", "cos", "exp", "log", "pow", "tanh", "tan", "atan", "log10", "atan2"]) {
    const g = Math[f];
    calls[f] = 0;
    Math[f] = function (...a) { calls[f] += 1; return g.apply(null, a); };
  }
}
const json = JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8"));
const module = await WebAssembly.compile(fs.readFileSync(path.join(dir, name + ".wasm")));
const dsp = new FaustWasmDsp({ json, module }, FS, BLOCK);
if (mode === "voice") { dsp.set("freq", 261.6255653); dsp.set("gate", 1); }
if (mode.endsWith("_down")) dsp.set("action/pedal", 1);
for (let c = 0; c < dsp.inputs; c += 1) dsp.input(c).fill(1e-3);
const warm = Math.round(2 * FS / BLOCK), meas = Math.round(Number(seconds) * FS / BLOCK);
for (let b = 0; b < warm; b += 1) dsp.compute(BLOCK);
for (const f in calls) calls[f] = 0;
const t0 = performance.now();
for (let b = 0; b < meas; b += 1) dsp.compute(BLOCK);
const ms = performance.now() - t0;
if (count) {
  const n = meas * BLOCK;
  console.log(mode, Object.entries(calls).filter(([, v]) => v).map(([f, v]) => `${f} ${(v / n).toFixed(2)}`).join(" ") || "no math calls");
} else {
  console.log(mode, (100 * ms / (meas * BLOCK / FS * 1000)).toFixed(2));
}

// ns per imported math call from wasm, net of the loop (see calls.wat).
import fs from "node:fs";
const bytes = fs.readFileSync(new URL("./calls.wasm", import.meta.url));
const N = 10_000_000;
function time(fn, x) { fn(N / 10, x); let best = Infinity; for (let r = 0; r < 5; r += 1) { const t0 = performance.now(); fn(N, x); best = Math.min(best, performance.now() - t0); } return best * 1e6 / N; }
for (const [name, f1, f2, x] of [["exp", Math.exp, Math.pow, 0.3], ["sin", Math.sin, Math.pow, 0.3], ["tanh", Math.tanh, Math.pow, 0.3], ["pow", Math.exp, Math.pow, 1.3]]) {
  const { exports: e } = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: { f1, f2 } });
  const base = time(e.loop0, x);
  const call = name === "pow" ? time(e.loop2, x) : time(e.loop1, x);
  console.log(`wasm ${name}: ${(call - base).toFixed(2)} ns per call`);
}

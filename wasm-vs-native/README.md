# Why coopiano's wasm is slower than native

A study of 17 October 2026 that measures, cause by cause, the cost gap between
the wasm modules of the web version and the native C++. The compiler was not
changed for this study. French version: [README.fr.md](README.fr.md).

| Component | Version |
|---|---|
| faust-rs | `main-dev` at `c6d9aece` |
| `coopiano.lib` | 0.2.4 (`e14d953`) |
| C++ | Apple clang 21.0.0 |
| node | 22.12.0 (V8 12.4) |
| Chrome | 155.0.8059.85, and Canary 158.0.8110.0 |
| Machine | Apple M5, macOS 26.7.1 |

## Summary

1. **The gap in Chrome.** Against native C++ with the same semantics (strict
   IEEE, no FMA, no vectorization), the wasm costs 2.4 times as much for the
   voice, 1.5 times for the imaged body, and 1.45 to 1.6 times for the light
   body.
2. **It is not the C++ compiler's liberties.** `-ffast-math`, FMA and
   auto-vectorization do not explain the gap: native code without any of them
   is not slower. The imaged body is even faster without vectorization: 26.6 %
   of a core instead of 36.8 %.
3. **The wasm executes about twice as many instructions** per sample: 2.4 times
   for the voice, 1.8 times for the body, 2.1 times for the light body. It
   executes them at a similar rate per cycle (IPC 3 to 5.5). The extra
   instructions come from the code V8 generates for a giant `compute` function.
   - **Register spills.** V8's code makes 2.8 times as many stack accesses as
     clang's, in a 37 KB frame. Beyond 256 bytes from the frame pointer, each
     access costs one more instruction to build its address.
   - **Floating-point constants.** V8 builds each one in five instructions.
   - **State reloads.** V8 reloads the DSP state about twice as often as clang.
4. **The math functions imported from JavaScript** weigh on the voice, and
   hardly on the bodies.
   - `Math.pow` called from wasm costs 64 ns, against 3.8 ns for the libm.
   - The voice makes 7 such calls per sample, in the hammer contact.
   - Replacing `Math.pow` with `exp(y·log x)` takes the voice from 6.76 % to
     6.02 % under node.
5. **`fastmath.lib` does not pay off here.** With `fa.fpow`, `fa.fexp` and
   `fa.fsin` at the places computed every sample, the voice gets slower
   everywhere: 10 to 12 % instead of 7 to 7.7 % in Chrome, 4.5 % instead of
   2.9 % natively. That is code added to an already giant function.
6. **V8 versions.** Chrome 155 and Canary 158 give the same costs on the main
   thread. Node 22 is much slower on the light body: 21 % against 13 %.
7. **Splitting the loop could not be measured.** `-vec` does not finish on the
   light body: 900 s, 18.9 GB resident, 155 GB of peak memory footprint.

## Method

The workload is the one of `scripts/web_check.mjs`:

- 128-sample blocks at 44.1 kHz;
- the voice holds a C4 (`freq`, `gate` = 1);
- a body gets 1e-3 on every input, pedal up or down.

One second is measured after two seconds of warm-up. Each figure is the best
of five runs, with the variants alternated in every round. The same DSPs are
compiled by faust-rs, to C++ and to wasm, from the same sources:
`dsp/coopiano.dsp` for the voice, and `-pn effect` of `dsp/coopiano.dsp` and of
`dsp/coopiano_light.dsp` for the bodies.

Files in this directory:

| File | Role |
|---|---|
| `nbench.cpp` | native bench (the prelude of `tools/render.cpp`); includes `voice.cpp`, `body.cpp` and `light.cpp` |
| `wbench.mjs` | wasm bench under node, same workload. `--count` counts the math calls per sample. `--pow-exp-log` replaces `Math.pow` with `exp(y·log x)` |
| `webbench.html` | the same measurement in Chrome, on the main thread, for the module sets of `build/hist/<name>/` |
| `calls.wat`, `calls.mjs`, `calls.c` | cost of one math call from wasm and natively |
| `accuracy.mjs` | largest difference between two module sets, on `web_check`'s renders |

To reproduce:

```bash
FR=../faust-rs/target/release/faust-rs; mkdir -p build/study
$FR -double --timeout 0 -cn coopiano_voice -I dsp dsp/coopiano.dsp -o build/study/voice.cpp
$FR -double --timeout 0 -cn coopiano_body -I dsp -pn effect dsp/coopiano.dsp -o build/study/body.cpp
$FR -double --timeout 0 -cn coopiano_light -I dsp -pn effect dsp/coopiano_light.dsp -o build/study/light.cpp
c++ -std=c++17 -O3 -march=native -ffp-contract=off -fno-vectorize -fno-slp-vectorize -I build/study wasm-vs-native/nbench.cpp -o build/study/nbench
build/study/nbench light_up 1
node wasm-vs-native/wbench.mjs light_up 1 web/dsp
```

`nbench` and `wbench.mjs` accept the modes `voice`, `body_up`, `body_down`,
`light_up` and `light_down`.

In Chrome, `webbench.html` reads each module set from `build/hist/<name>/`.
For example, for the modules of one commit:

```bash
c=e14d953; mkdir -p build/hist/$c
for f in voice body body_light; do for e in wasm json; do git show $c:web/dsp/$f.$e > build/hist/$c/$f.$e; done; done
```

It also needs a server (`python3 scripts/web_serve.py 8765`), then
`http://localhost:8765/wasm-vs-native/webbench.html?sets=e14d953&rounds=4`.
Headless Chrome needs `--enable-features=WebAssemblyUnlimitedSyncCompilation`:
otherwise the main thread refuses to instantiate a module over 8 MB
synchronously.

## 1. Native code without its liberties

Cost in % of a core, best of five:

| Build | voice | body up | body down | light up | light down |
|---|---|---|---|---|---|
| `-O3 -ffast-math -march=native` (coopiano's) | 2.85 | 36.79 | 47.03 | 9.28 | 17.11 |
| same, `-ffp-contract=off` (no FMA) | 2.96 | 31.04 | 43.23 | 8.96 | 21.05 |
| `-O3 -march=native` (strict IEEE, FMA allowed) | 2.78 | 35.37 | 45.40 | 7.64 | 14.11 |
| same, `-ffp-contract=off` | 2.97 | 31.33 | 42.66 | 8.91 | 18.80 |
| `-ffast-math`, no vectorization | 2.80 | 25.60 | 35.56 | 8.06 | 14.91 |
| **strict, no FMA, no vectorization** (closest to wasm) | 2.98 | 26.60 | 37.76 | 8.92 | 18.66 |
| wasm, node 22 | 7.04 | 45.17 | 66.15 | 21.91 | 39.52 |
| wasm, Chrome 155, main thread | 7.0–7.2 | 39.9–41.1 | 55.9–58.0 | 12.8–13.1 | 30.0–30.9 |
| wasm, Canary 158, main thread | 7.1–7.7 | 40.1–40.6 | 56.1–57.1 | 13.0–13.3 | 30.1–30.3 |

- **`-ffast-math` gains nothing.** The strict build is as fast, and even faster
  on the light body (7.64 % against 9.28 %).
- **FMA cuts both ways.** Removing it gains on the bodies with the pedal up
  (31.0 % against 36.8 %) and loses on the light body with the pedal down
  (21.1 % against 17.1 %).
- **Auto-vectorization costs on the imaged body**: 36.8 % with it, 25.6 %
  without.

So the wasm is not slower because it lacks scalar FMA, reassociation or
auto-vectorization.

**Note for coopiano.** On this machine, `-fno-vectorize -fno-slp-vectorize`
makes the native render of the imaged body 30 % cheaper. The `NATIVE` options
of the `Makefile` deserve a second look.

## 2. Instructions and cycles per sample

The counters of `/usr/bin/time -l` are taken between a one-second and a
five-second measurement; warm-up and compilation cancel out in the difference.
Best of two.

| DSP | native closest to wasm | native `-ffast-math` | wasm node 22 |
|---|---|---|---|
| voice | 14,164 instr., 2,829 cycles (IPC 5.0) | 13,921 / 2,695 (5.2) | 34,655 / 6,241 (5.6) |
| body up | 69,383 / 25,167 (2.8) | 97,625 / 34,859 (2.8) | 124,841 / 41,950 (3.0) |
| light up | 31,749 / 8,421 (3.8) | 29,586 / 8,881 (3.3) | 66,152 / 20,267 (3.3) |

The wasm executes 1.8 to 2.4 times as many instructions, and does not execute
them more slowly. What counts is the amount of code.

## 3. What V8's code contains

Machine code of the light body's `compute`, whole, guards included: V8 through
`node --print-wasm-code`, clang through `objdump` on the strict build without
FMA or vectorization.

| Category | V8 TurboFan | clang |
|---|---|---|
| instructions | 321,878 | 144,454 |
| moves and constants (`movz`, `movk`, `movn`, `fmov`) | 118,915 | 19,059 |
| loads, stack + memory | 49,962 + 46,397 | 17,974 + 24,129 |
| stores, stack + memory | 25,568 + 17,458 | 9,334 + 16,754 |
| floating-point arithmetic | 52,060 | 46,791 |

- **The arithmetic is the same.** The extra instructions are elsewhere.
- **Spills.** The stack gets 75,530 accesses in V8's code against 27,308 in
  clang's, in a 37 KB frame (`sub sp, sp, #0x9060`).
- **Address immediates.** 69 % of V8's `movz`, `movk` and `movn` build the
  offset of a load or a store, typically `movn x16, #0x35f; ldr d7, [fp, x16]`:
  a spill slot more than 256 bytes from the frame pointer.
- **Floating-point constants.** 18 % of these immediates build a constant: four
  `movz`/`movk` and one `fmov` per double. clang loads the same constant in a
  single instruction.
- **DSP state.** V8 reloads linear memory about twice as much. The stores to
  the state, on the other hand, are equivalent (17,458 against 16,754).

Over one sample, the light body's wasm makes 7,967 loads and 3,157 stores for
12,760 floating-point operations outside the guards, according to `wasm-dis`.
The voice makes 3,133, 912 and 5,180. The light body's per-sample loop holds
6,450 C++ statements: V8's register allocator cannot hold it, and clang's does
much better.

## 4. The math functions

Calls per sample, counted at run time (`wbench.mjs --count`):

| DSP | calls |
|---|---|
| voice | `exp` 7.25; `pow` 7.16; `sin` 1.13; `cos` 0.13; `log` 0.05; `tanh` 0.01 |
| body, light body | `tanh` 2.00 (the output limiter; `select2` computes both of its branches); `pow` 0.06; `exp` 0.01 |

In the voice, the 7 `pow` come from the hammer's felt solver (`felt_solve`,
and the force `F`). The action noises (the `exp(-t/τ)` envelopes and the
knock's `sin(π·x)`) supply the `exp` and the `sin`.

Cost of one call, with independent arguments, net of the loop (`calls.*`):

| Function | wasm → `Math.*` (node) | libm, `-O3` strict | libm, `-O3 -ffast-math` |
|---|---|---|---|
| `exp` | 2.6 ns | 0.9 ns | 1.3 ns |
| `sin` | 3.6 ns | 1.0 ns | 1.4 ns |
| `tanh` | 10.8 ns | 1.9 ns | 2.4 ns |
| `pow` | **63.9 ns** | 3.8 ns | 0.03 ns (clang rewrites `pow(a, 2.5)` into products and a square root) |

- **Estimate for the voice.** The calls cost about 450 ns more per sample, 430
  of them for `pow`: 2 % of a core. That is half of its 3.8-point gap (6.76 %
  under node against 2.98 % natively).
- **Direct measurement on the voice.** With `Math.pow` replaced by
  `exp(y·log x)` (two cheaper calls, same Faust code), the voice goes from
  6.76 % to 6.02 %. So `pow` costs at least 0.7 point in place.
- **The bodies.** The two `tanh` cost 0.08 % of a core: negligible.

**The `fastmath.lib` variant.** Only the calls made every sample are replaced
by their Faust versions:

- in the hammer, the 7 `pow` by `fa.fpow`, whose base is always positive;
- in the noises, 7 `exp` by `fa.fexp` and 1 `sin` by `fa.fsin`;
- in the limiter, `tanh` by `fa.ftanh`.

The voice differs by only −288 dB of the peak, and the bodies are
bit-identical. Its cost:

| Voice | 0.2.4 | with `fa.*` |
|---|---|---|
| wasm, Chrome 155 | 7.0–7.2 | 10.0–10.2 |
| wasm, Canary 158 | 7.1–7.7 | 10.2–11.9 |
| wasm, node 22 | 6.75 | 8.68 |
| native strict, no FMA or vectorization | 2.90 | 4.47 |
| native `-ffast-math` | 2.75 | 3.48 |

The bodies do not move: light 21.1 → 20.5 % and imaged 43.5 → 43.7 % under node.

`fa.fpow` goes through `flog2`, a ladder of comparisons, and through `fexp2`, a
table and a polynomial. Copied seven times into a function already beyond what
the register allocator can hold, this code costs more than the calls it
replaces. `fastmath.lib` remains useful in a small loop, not here.

## 5. Splitting the loop

If spills are the main cause, a shorter loop should cost less. That is what
faust-rs's vector mode does: several loops over the block, each with fewer live
values. But `-vec -vs 32` on the light body does not finish. At the 900 s
time limit, it occupies 18.9 GB resident and 155 GB of peak footprint, with the
machine swapping to disk. Point 12 of the report (`-vec` in O(L⁴)) therefore
applies to the bodies too, and the hypothesis remains to be measured.

## Leads for faust-rs, by expected gain

1. **A smaller per-sample loop for V8.** This is the largest possible gain:
   most of the extra instructions come from spills and stack addressing. Three
   ways:
   - a `-vec` that finishes (point 12 first);
   - a loop fission specific to wasm;
   - sub-functions called from the loop.

   Gain not measured; the bound is a factor close to 2 on the bodies'
   instructions.
2. **Stop calling `Math.pow` from wasm.** That is 0.7 to 2 points on the voice,
   10 to 30 % of its cost. Two ways:
   - a `pow` compiled into the module (a wasm libm, with libm accuracy);
   - failing that, a JavaScript `pow` faster than V8's, provided its accuracy
     stays that of the libm.
3. **Floating-point constants.** V8 builds each one in five instructions, 18 %
   of its immediates on the light body. Loading them from memory would cost one
   instruction, plus its address. To be measured.
4. **Expect no gain from wasm FMA (relaxed SIMD) or from SIMD on these DSPs.**
   Natively, neither FMA nor vectorization speeds them up.
5. **Measure in Chrome, not only under node.** `make web-check` runs under
   node 22, whose V8 is older: it overstates the light body by 1.6 times
   compared with Chrome.

## Unrelated to the wasm/native gap

Chrome Canary 158.0.8110.0 saturates the AudioWorklet thread (99 to 100 % of a
core for a few notes), where Chrome 155, and Canary launched with
`--js-flags=--no-liftoff`, stay around 76 to 79 %. On the main thread, both
versions compute at the same cost. It is a Canary regression.

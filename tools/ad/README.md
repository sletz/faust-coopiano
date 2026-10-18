# Feasibility: calibrating the voicing with faust-rs `fad`

Date: 2026-10-18, faust-rs `main-dev` at `8b6d7930`, faustprobe release build,
Apple M5. The question: can faust-rs forward-mode autodiff (`fad`) and
`faustprobe --train` fit voicing controls of the Faust voice to a reference
note, and is it worth it compared with a grid search or finite differences?

Test case: E2 (key 40), velocity 1, key held 1 s, 1.5 s rendered, the C++
seed-1 draws; the bridge force of `cp.voice_drawn` (what
`dsp/coopiano_note.dsp` renders). Three controls: `stiffness_scale`,
`felt_width_scale`, `decay_scale`.

## Files

| file | what |
|---|---|
| `ad.lib` | the note (key down from frame 0 for `hold` s), the seeds and the loss |
| `voice_fad.dsp` | bridge force and its three tangents (no loss) |
| `params_fad.dsp` | the note parameters (`_voice_params_on`) and their tangents: the bisection that cleared them of the NaN |
| `fd_check.py` | those tangents against central finite differences of `dsp/coopiano_note.dsp` |
| `note_timed.dsp` | the note alone, to render a target |
| `train_fad.dsp` | input target, outputs per-sample loss and its three tangents, for `faustprobe --train` |
| `loss.dsp` | the loss alone, for `faustprobe --sweep ... --reduce dc` |

Loss: per sample, the sum over seven octave bands (60 Hz to 7.7 kHz) of the
squared difference of the log 10 ms energy envelopes of model and target.

## Findings

1. **The model needed one change to be differentiable.** The tangents were
   NaN from the first frame, with no note playing: `_slot_mags` and
   `_pair_gains` took `sqrt` of a mode's squared amplitude, which is exactly 0
   at rest and at the first sample of a strike, and the tangent of `sqrt` at 0
   is `inf * 0`. The NaN was then held by the phantoms' `ondemand` domain and
   reached every output. The study first redefined the two helpers through a
   library modification; `coopiano.lib` now takes `_safe_sqrt(x) =
   sqrt(max(x, 1e-300))` there itself, and the renders are bit-identical
   (`faustprobe --ref` at zero tolerance: three notes and the five-channel voice
   output; `make check`, `make doctests`).
2. **The tangents are right.** Against central differences (relative step
   1e-4), the relative error is 4e-9 to 2e-8 in every window (0-5 ms of the
   attack, 5-50 ms, 50-300 ms, 0.3-1 s, the release): finite differences'
   own accuracy. The non-smooth hammer contact (`a > 0`) did not show at this
   step. The loss gradients pass `faustprobe --fd-check` at 4e-10.
3. **A descent recovers known values.** Target: the model at
   (1.3, 1.0, 1.4); start: the defaults (0.9, 1.4, 1.1). Adam, `--lr 0.02`,
   one reset pass over the note per step: (1.308, 1.007, 1.401) after 150
   steps, loss 0.41 -> 2.4e-6 (block 20 already at (1.23, 1.07, 1.42)).
4. **It is the expensive way.** Compile: 38 s for the three-seed program, 18 s
   for the plain voice. Compute: 153 ms for 3 s of audio plain, 987 ms with one
   seed, 2.76 s with three; each seed costs about 6 plain renders, where a
   central difference costs 2. The 150 steps took 4.6 min. The grid of the
   same loss, 7 x 7 x 7 points in one faustprobe call (`--sweep`, one compile),
   took 44 s, compile included (0.04 s a point), and its best point (1.4, 1.0,
   1.4) is the grid cell next to the answer; a second, finer grid would pin it
   in another 45 s.
5. **The loss barely sees the stiffness.** On the grid, (1.2, 1.0, 1.4) and
   (1.4, 1.0, 1.4) are within 25 % of each other; the width and the decay are
   sharp. A fit against a real reference would need a loss that weighs the
   attack (spectral tilt of the first 50 ms) to pin the felt.
6. `rad`, whose cost does not grow with the number of controls, is not an
   option: the voice computes its parameters in `ondemand` domains, and faust-rs
   rejects `rad` across a clock-domain boundary.

## Recommendation

No-go for `fad` as the calibration engine of coopiano, for now: with a few
controls a grid (one compile, 0.04 s a point) or finite differences (two
plain renders per control and per step) are cheaper, and as accurate on this
model. `fad` would pay off with many controls only if its cost per seed came
down to about that of a plain render: the 6x measured here is worth a look in
faust-rs (the per-seed work of the parameters' `ondemand` domains is the first
suspect). Kept from the study: the `sqrt` fix (finding 1, now in `coopiano.lib`),
and the loss and grid set-up for a calibration against Pianoteq or a recording.

## Reproducing

From the repository root, with `FAUSTPROBE` or `../faust-rs/target/release/faustprobe`:

```bash
python3 tools/ad/fd_check.py 40 1.0 1.0 1.5 1e-4
```

```bash
P=../faust-rs/target/release/faustprobe
D="--set draw0=-0.732247 --set draw1=-0.727186 --set draw2=-0.097570"
$P --double -I dsp -I tools/ad -n 66150 --in zero --quiet $D --set stiffness_scale=1.3 --set felt_width_scale=1.0 --set decay_scale=1.4 --out build/ad/target.npy tools/ad/note_timed.dsp
python3 -c "import numpy as np; np.load('build/ad/target.npy')[:, 0].astype('<f8').tofile('build/ad/target.f64')"
$P --double -I dsp -I tools/ad --in file:build/ad/target.f64 --block 66150 -n 66150 --reset-per-block $D --train stiffness_scale,felt_width_scale,decay_scale --optimizer adam --lr 0.02 --blocks 150 --every 10 tools/ad/train_fad.dsp
$P --double -I dsp -I tools/ad --in file:build/ad/target.f64 -n 66150 --quiet $D --sweep stiffness_scale=0.6,0.8,1.0,1.2,1.4,1.6,1.8 --sweep felt_width_scale=0.6,0.8,1.0,1.2,1.4,1.6,1.8 --sweep decay_scale=0.8,1.0,1.2,1.4,1.6,1.8,2.0 --reduce dc tools/ad/loss.dsp
```

# faust-coopiano

[Version française](README.fr.md)

A Faust model of [coopiano](../../coopiano), the physically modelled piano of
`piano.hpp` / `instrument.hpp` (C++17, MIT): hammer, unison strings with two
polarizations, longitudinal phantom partials, action noises, dampers and sustain
pedal, sympathetic string register, a modal soundboard with bridge-region
imaging, and the room reverb of `reverb.hpp`. Written for
[faust-rs](../faust-rs) and checked with its `faustprobe` against the C++ model
itself.

## Layout

| Path | What |
|---|---|
| `dsp/coopiano.lib` | the model (prefix `cp`), documented in the faustlibraries format: every public function has a `#### Usage` and a `#### Test` (`make doctests`) |
| `dsp/coopiano_tables.lib` | generated: tables drawn or solved by the C++ model |
| `dsp/coopiano.dsp` | the polyphonic instrument (`freq`/`gain`/`gate`, `effect = cp.body`) |
| `dsp/coopiano_light.dsp` | the same with the soundboard without imaging |
| `dsp/coopiano_note.dsp`, `coopiano_hammer.dsp`, `coopiano_voice_out.dsp`, `coopiano_body*.dsp` | the pieces the tests compare |
| `ref/dump.cpp` | includes coopiano's headers unchanged and writes the reference data |
| `scripts/` | table generation (soundboard fit) and the comparisons |
| `tools/render.cpp` | native offline renderer of a score (`scores/demo.txt`) |

## Use

```bash
make ref        # build ref/dump.cpp against ../../coopiano, extract build/ref (~20 s)
make tables     # dsp/coopiano_tables.lib (soundboard fit, ~1 min)
make check      # every program compiles under faustprobe
make test       # contact, notes and engine comparisons (exit 1 beyond tolerance)
make keyboard   # the voice against the C++ on every key A0-C8 (~5 min)
make render     # native render of scores/demo.txt to build/demo.wav (LIGHT=1: light body)
make results    # every comparison and the cost measure into results/*.txt (~30 min)
make paper      # figures and the article, paper/faust-coopiano.pdf
```

`COOPIANO` and `FAUST_RS` point to the two checkouts (defaults `../../coopiano`
and `../faust-rs`, release `faust-rs` and `faustprobe` built). With faust-rs
`main-dev` of 2026-10-16, compiling the voice takes about 8 s and the body about
5 s (25 s and 45 s the day before; see *faust-rs* below). `JOBS` (default 4) sets
how many renders `make contact`, `notes` and `keyboard` run side by side.

## How the model streams what the C++ prepares

`piano.hpp` prepares each strike offline (a 32x oversampled contact solve, then
a bank of decaying phasors). The Faust voice is a streaming equivalent:

- **Strings.** Each mode is a complex one-pole resonator whose real part is the
  displacement (`polarization_state`'s convention), driven by the hammer force
  with a first-order hold. The vertical (prompt) and horizontal (slow)
  polarizations are two resonators sharing the force in the C++ proportions:
  splitting the drive equals splitting the state at separation. A voice has
  `NS = 96` mode slots shared by its unison strings (96 partials for a one-string
  bass key, 32 per string for a trichord). Every rate, frequency (with the
  bridge admittance's reactive pull), loss, two-stage decay and bridge voicing
  curve of `build_string`/`collect_phasors` is computed from the note and the
  voicing controls of `default.ini`.
- **Hammer.** Solved implicitly at the audio rate: the felt law
  `F = K d^p (1 + 0.12 d')`, with the compression *and* its rate taken at the
  current sample, meets the strings' direct response to the current force; a
  scalar equation solved by five Newton steps from a bracketing start
  (`scripts/contact_sim.py` checks the scheme against `run_contact` in numpy).
- **Phantom partials.** A phantom is the product of two mode states: the product
  of two decaying phasors is the decaying phasor at the sum frequency, which is
  how `add_phantoms` builds them, so streaming them needs no extra state. They
  run in a faust-rs `ondemand` domain, only for keys below G#3.
- **Parameters.** Everything that depends on the note and the voicing is
  computed in `ondemand` domains clocked by a change of either, the note
  entering as a held audio-rate signal: per-block recomputation of the 96 slots
  and 288 phantom coefficients cost more than the strings themselves.
- **Action noises** follow `prep_note_into`'s filters and envelopes; their level
  (`tone_peak_amp`, known only after the contact solve) comes from a table of
  the C++ solve over keys and velocities.
- **Body.** The sympathetic bank is `SympatheticResonance` (88 keys, partials
  below 7 kHz), the played key's own share withheld by a per-voice correction
  (`own_drive`); damped keys run in `ondemand` domains that sleep while the
  dampers stay seated. The soundboard is a bank of the C++ board's 732 modes
  whose complex amplitudes are fitted, by least squares with a closed-form Gram
  matrix, to Engine's responses for each bridge region (head and shared tail);
  a mode is driven by `sum_r A_r x_r`. The room is `StereoReverb` line by line.

## Results (build/ref against this model, faust-rs, Apple M5)

| Check | Result |
|---|---|
| Hammer contact, 8 keys x 4 velocities (`make contact`) | peak force within 1 % and contact time within 1-4 % (one sample), except C8 at velocity 1: -14 % peak, an 11-sample contact |
| Bridge force, 12 notes A0-C8 (`make notes`) | level within 0.1 dB from 50 ms on, 0.3 dB over the first 50 ms; third-octave spectra within 0.6 dB rms |
| Bridge force, all 88 keys at velocity 0.5 (`make keyboard`, `results/keyboard.txt`) | level within 0.4 dB over the first 50 ms and 0.1 dB from 50 ms to 1 s; 1-2 s within 0.7 dB (the top octave's tails, 50-65 dB down); early spectra within 0.9 dB rms; late spectra within 1 dB rms except D7-E7 (up to 5.7 dB, a weak partial of a tail 58 dB down) |
| Release | decay follows the C++ to 0.4 dB down to -82 dB |
| Sympathetic bank on the C++ force | identical to 1e-12 (-248 dB) |
| Soundboard fit | -25.5 dB (shared response), -22.8 to -25.7 dB (regions); frequency response within 0.1 dB median, under 0.7 dB for 90 % of frequencies |
| Whole instrument vs `Engine`, C4, dry and with reverb (`make engine`) | level within 0.1 dB per channel while the note sounds, L/R correlation identical (0.355 and 0.311), reverb tail within 0.1 dB |
| Cost, native (clang -O3, `results/cost.txt`) | 2.9 % of a core per sounding voice; body 36 % (pedal up) to 45 % (pedal down); light body 10 % to 22 % |

## Known differences

- **Partials per string**: 32 for trichords, so a C3 loses the C++ content above
  4.5 kHz (at most -44 dB of the energy, at the attack); `NS = 144` gives 48 per
  string for 1.5x the voice cost.
- **Hammer at 44.1 kHz** instead of 32x: exact to 1 % except the shortest treble
  contacts (C8 fortissimo).
- **Phantoms**: partner distance up to 2 (`piano.hpp`: 3, the next term is
  15 dB down); the per-pair amplitude bound (`bound_phantom`) and the -80 dB
  threshold are not applied.
- **Random draws**: the per-strike unison readout spread is drawn at each strike
  (the tests set the C++ seed's draws); action noises are other realizations of
  the same filtered noise; the second polarization's tiny detune uses a hash.
- **Noise levels** come from the default voicing's contact solve: other hammer
  voicings scale the strings exactly but the action noises only approximately.
- **Sympathetic register**: opened by the pedal and by the damper-free treble; a
  silently held key's own strings are not opened (a voice cannot see the others).
- **Soundboard**: imaging fixed at the C++ defaults (spread 0.7, position depth
  0.5) and board voicing fixed at `default.ini` (re-run `make tables` after
  changing them in `ref/dump.cpp`); the late tail after a release (more than
  60 dB below the note) is fitted less well.
- **Host duties** (voice stealing and level culling, `fade_tail`) belong to the
  polyphonic architecture; `tools/render.cpp` stops a released voice after half
  a second below 1e-6 N.

## faust-rs

This model met several faust-rs limits, worked around here and reported in
[`faust-rs-issues/RAPPORT.md`](faust-rs-issues/RAPPORT.md) (French: a minimal
reproducer, the cause in the faust-rs code and a possible fix for each). Most
were fixed in faust-rs `main-dev` on 2026-10-16; the report's first section gives
the commits and the measures. Fixed:

- function application is memoized in the evaluator (C++ `gApplyMemo`): a call in a
  lambda body is no longer re-evaluated at each application, and the voice's
  compilation went from 41 s and 17 GB to 7 s and 2.8 GB. The voice keeps its
  dataflow style, written to avoid this;
- long sums, isomorphic recursion groups, the recursive type fixpoint and the clock
  fixpoint no longer cost the number of recursion groups times the graph: the body
  compiles in 5 s instead of 45 s, and the voice and the body as one program in 13 s
  instead of 363 s. `gsum` still saves 0.5 s on the body and is kept;
- `x*x` (normalized to `pow(x, 2)`) is a product on every backend, no longer a
  library call; the phantoms' square-free formula is kept;
- `faustprobe --nvoices` runs the instrument with its body as `effect` (`make check`);
- the diagnostics now name the reserved words (`rad`, `fad`, which stay reserved),
  explain `-max(...)` and `-L.g(...)`, and locate an arity error at the faulty
  composition.

Still open: `-vec` on the voice does not finish (vector planning in O(L^4) over
31,825 loops), and block-rate work leaves an `ondemand` domain unless its input
is held at the audio rate, hence `on_change`.

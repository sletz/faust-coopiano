# faust-coopiano

[Version française](README.fr.md) · **Play it in the browser: https://sletz.github.io/faust-coopiano/**

A Faust model of [coopiano](https://github.com/peterc/coopiano), the physically modelled piano of
`piano.hpp` / `instrument.hpp` (C++17, MIT): hammer, unison strings with two
polarizations, longitudinal phantom partials, action noises, dampers and sustain
pedal, sympathetic string register, a modal soundboard with bridge-region
imaging, and the room reverb of `reverb.hpp`. Written for
[faust-rs](https://github.com/grame-cncm/faust-rs) and checked with its `faustprobe` against the C++ model
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
| `web/` | the web version: page, keyboard, MIDI input, AudioWorklet host of the faust-rs wasm (`make web`, `make web-serve`) |
| `pianoteq/` | coopiano (C++ and Faust) against Pianoteq 9 on the same scores: report (English and French), measurements and figures (`make pianoteq`) |

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
make web        # the web version in web/dsp; make web-serve, then http://localhost:8000/web/
```

`COOPIANO` and `FAUST_RS` point to the two checkouts (defaults `../../coopiano`
and `../faust-rs`, release `faust-rs` and `faustprobe` built). With faust-rs
`main-dev` of 2026-10-16, compiling the voice takes about 8 s and the body about
5 s (25 s and 45 s the day before; see *faust-rs* below). `coopiano.lib` 0.2.3
needs faust-rs `main-dev` from `ccca27eb` (2026-10-17) on: an older one rejects
`dsp/coopiano_hammer.dsp` (point 16 of the report). `JOBS` (default 4) sets
how many renders `make contact`, `notes` and `keyboard` run side by side.

## Web version

`web/` is the instrument in the browser: a keyboard on the page, a Web MIDI input,
and every control with its explanation, one tab per type of control, in English
and French.

```bash
make web        # web/dsp: the voice and both bodies compiled to wasm by faust-rs (~20 s)
make web-serve  # serves the repository; open http://localhost:8000/web/
make web-check  # the wasm against faustprobe, and what it costs (node)
make web-pages  # publish web/ and web/dsp on the gh-pages branch (GitHub Pages)
```

The published version is at https://sletz.github.io/faust-coopiano/.

- **Engine.** The voice and the two bodies are `dsp/coopiano.dsp` and
  `dsp/coopiano_light.dsp`, compiled by `faust-rs -lang wasm -double` (the voice is
  `process`, a body is `effect`, through `-pn effect`). They run in an AudioWorklet
  (`web/coopiano-processor.js`) at 44.1 kHz, which the browser resamples to the
  device. The worklet does what Faust's polyphonic architectures do:
  - it sums the voices' five outputs into the body, computed once;
  - it sends every control to every voice and to the body;
  - a key struck again restrikes its own voice, on the strings still vibrating;
  - it stops computing a released voice after half a second below 1e-6 N;
  - with no free voice, it steals the quietest released one, with a one-block
    fade;
  - with no voice sounding, it stops computing the body once its output has
    stayed below -120 dBFS for a second, so an idle page costs nothing.

  `make web-check` finds the wasm output equal to faustprobe's: -296 dB of the
  peak for the voice, -270 dB for the bodies.
- **Playing.**
  - Mouse or touch on the keys. The velocity comes from the click position (lower
    on the key is louder) or from a slider.
  - The computer keyboard, by key position whatever the layout: two rows from the
    octave shown, ← and → to shift it, the space bar for the pedal.
  - MIDI: all inputs or one, all channels or one. Note on and off with velocity,
    CC64 for the pedal (half-pedalling included), CC120 and CC123 for all notes
    off.

  Another application can play it through a virtual MIDI port: the IAC Driver on
  macOS, loopMIDI on Windows. Web MIDI needs Chrome, Edge, Firefox or Opera, and a
  page served from localhost or HTTPS, which `make web-serve` provides.
- **Controls.** The 32 controls of the voice and the body, in the tabs of
  `default.ini` (hammer, strings, tone, sympathetic resonance, room, action and
  output). Each shows its range, its default and an explanation; a double-click
  resets one. The pedal also follows the space bar and CC64.
- **Presets.** A first tab offers eight kinds of piano, each explained:
  concert grand (the defaults), bright modern grand, mellow jazz grand, upright,
  honky-tonk, felt piano, grand in a concert hall, old worn piano. A preset
  starts from the defaults and sets some controls (never the pedal); the other
  tabs then show what it set, and a control changed afterwards marks it as
  modified. The soundboard's modes stay those fitted to the C++ grand.
- **Cost.** Built with faust-rs `main-dev` at `51642a20`, the wasm runs 1.4 to 3
  times slower than the native build (`make web-check`, node on an Apple M5,
  second of steady state):
  | DSP | pedal up | pedal down | native, pedal up | Emscripten, pedal up |
  |---|---|---|---|---|
  | voice (one note held) | 6.0 % | | 3.1 % | 5.7 % |
  | light body | 30 % | 62 to 65 % | 10 % | 20 % |
  | imaged body | 50 % | 92 to 96 % | 36 % | 49 % |
  The previous faust-rs (`354e2080`) gave 7.8 %, 41 % and 95 %: putting the
  constant struct addresses in the memarg offset of the loads and stores brought
  the voice and the imaged body level with the same C++ compiled by Emscripten
  (`em++ -O3`); the light body is still 1.5 times slower (report, point 14). The
  page starts with the light body and 8 voices, and shows the load of the audio
  thread.

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
- **Body.** The sympathetic register, the soundboard fitted per bridge region
  and the room run once on the summed voices; see the next section.

## The body (`cp.body`)

`cp.body` is the `effect` of `dsp/coopiano.dsp`. The polyphonic architecture
sums the voices' outputs channel by channel and runs the body once on that sum,
as `instrument.hpp` sums its voices before `render_force`, `convolve_span` and
`finish_block`. Summing first is exact because everything before the limiter is
linear.

```
voices 1..16 ──(summed by the polyphonic architecture)──► x0 x1 x2 x3 c
                                                            │
   w = (gain · res_bank(x0 + x1 + x2 + x3) + c) / 4         sympathetic register
                                                            │
   x0 + w, x1 + w, x2 + w, x3 + w ──► soundboard ──► L, R   732 modes, imaged
                                                            │
   on each channel: dc_block ─► room ─► × output_gain ─► limit
```

### What enters: five channels per voice

A voice computes `F`, the force its strings exert on the bridge (in newtons),
and outputs five channels (`_regions_out`):

- **`x0` to `x3`, the force split over four bridge regions.** Key `m` sits at
  `(m - 21) / 87` along the bridge, and `region_gain` crossfades linearly
  between the two regions around that position (centres at 0.125, 0.375, 0.625
  and 0.875). A0 goes entirely to region 0, C8 to region 3, the middle of the
  keyboard half to region 1 and half to region 2. The four gains sum to 1, so
  `x0 + x1 + x2 + x3` is the voices' total force. The regions carry the stereo
  image: the board answers a force differently depending on where it enters
  the bridge. The rule is `key_region_` of `instrument.hpp`.
- **`c`, the correction of the played key:**
  `c = (own_drive - 1) · gain · res_own(m)(F)`, where `res_own(m)` is a copy of
  key `m`'s sympathetic resonators (16 partials), driven by the voice's own
  force with the openness its key has in the bank. With `own_drive = 0` (the
  default), it removes the voice's share from its own key's resonators, as the
  C++ bank does with its per-key `own_force_` rows. The bank is linear, so
  `gain · res_bank(sum of F) + sum of c` is exactly "each voice excites every
  key's strings but its own". Only the voice knows `m`, which is why it outputs
  five channels and not four.

### 1. Sympathetic register (`res_bank`)

`SympatheticResonance` transcribed: 88 keys, 1002 resonators, up to 16 partials
per key (fewer in the treble), driven by the total force and excited only below
7 kHz.

- **One partial.** Partial `p` of key `m`:
  - its frequency is `p f0 sqrt(1 + B p²)`;
  - it is a complex one-pole, a damped rotation;
  - its radius is blended by the dampers' openness `o` between open (the key's
    T60, capped at `maximum_decay_seconds`) and closed (T60
    `damper_decay_seconds`);
  - its drive, `2 (1 - r) / (p (1 + (f / 3500)²))`, is multiplied by `o`, where
    `r` is the open radius. A seated damper therefore lets the string decay but
    gives it no new energy.
- **Openness.** It follows `1 - damper_contact(pedal)` at a rate of
  `1 / transition_seconds`. The dampers are seated below a pedal position of
  0.25 and fully lifted above 0.65. Keys 90 to 108 (F#6 to C8, `f0` ≥ 1400 Hz)
  have no damper and are always open. With the pedal up, only they resonate.
  A key held silently does not open (see *Known differences*).
- **Clock domains.** The 69 keys with dampers (A0 to F6) each run in an
  `ondemand` domain. A domain is awake while the dampers are lifted and for six
  closed T60 (about 1.1 s) after they seat. Asleep, nothing is computed and the
  output is 0, which is most of the cost difference between pedal up and pedal
  down. A key's parameters are recomputed only on change (`on_change`): at the
  first sample, when a decay control or the voicing changes, and when the
  domain wakes.
- **Output.** The 88 outputs are summed by `gsum(88, 8)`: groups of 8 behind an
  opaque barrier, a compile-time measure with no effect on the result. The sum
  is scaled by `gain` (0.18) and added to the corrections `c`, which gives `w`.
  `w` is spread evenly over the four regions, as `render_force` spreads
  whatever the regions do not account for: the sympathetic wet signal has no
  place on the bridge.

### 2. Soundboard (`soundboard`)

The C++ convolves, with partitioned FFTs (`convolve_span`), each region's force
with that region's response over the first 0.2 s (the imaged head), and the
summed force with a shared tail. The model replaces that convolution by a modal
bank:

- **Poles.** It uses the C++ board's 732 poles, from 48 Hz to 16.5 kHz:
  `λ = exp(-σT) exp(i 2π f T)`.
- **Amplitudes.** Each mode has eight complex amplitudes `A[c][r]`, one per
  channel (L, R) and region. They are fitted by least squares to Engine's
  response to an impulse in each region, head and shared tail
  (`scripts/gen_tables.py`, -22.8 to -25.7 dB).
- **Resonators.** Each mode and channel is a complex one-pole driven by the
  complex combination of the region forces:
  `s[n] = λ s[n-1] + sum over r of A[c][r] x_r[n]`, output `Im(s)`. That makes
  1464 resonators.
- **Stereo image.** It comes from the left and right amplitudes differing from
  one region to the next. The imaging is fixed at the C++ defaults (spread 0.7,
  position depth 0.5).
- **Parameters.** They are read from the tables once, at the first sample
  (`_board_chunks(_first, ...)`, 12 `ondemand` domains of 61 modes). The
  `route` places each mode's 18 parameters next to the four forces.
- **Sums.** The two channels are summed by `gsum2(732, 32)`.

`body_light` (`dsp/coopiano_light.dsp`) changes only this stage.
`soundboard_mono` sums the regions first and gives each mode a single
resonator `u`, read with two complex amplitudes: `L = Im(a_L u)` and
`R = Im(a_R u)`. It loses the per-region imaging and costs about a third as
much.

### 3. Output, on each channel

1. **`dc_block`**: a one-pole high-pass at 20 Hz (`DcBlocker`).
2. **`room`**: `StereoReverb` of `reverb.hpp`, line by line.
   - The wet path is high-passed at 150 Hz and predelayed (`predelay_ms`).
   - Six early taps, from 7 to 31 ms, cross between the channels.
   - Each side has two diffusion all-passes.
   - Eight delay lines (1493 to 2423 samples at 44.1 kHz) share an
     unnormalised Walsh-Hadamard feedback. Each is damped by a one-pole
     low-pass at `damping_hz`, and its gain is set for `decay_seconds`.
   - The output is `dry + mix · (0.45 · early + 0.70 · late / sqrt(8))`: the
     dry signal passes unchanged.
3. **`× output_gain`** (0.0011): from newtons to audio level.
4. **`limit`** (`limit_output`): unchanged up to 0.8, with a tanh knee toward 1
   above. It is the only nonlinear stage, after every sum.

### The body's controls

| Group | Control | Default | Effect |
|---|---|---|---|
| resonance | `gain` | 0.18 | level of the sympathetic register |
| | `own_drive` | 0 | 1: the played key also drives its own resonators |
| | `maximum_decay_seconds` | 12 | cap on the open T60 |
| | `damper_decay_seconds` | 0.18 | T60 with the dampers seated (×6: how long a domain stays awake) |
| | `transition_seconds` | 0.04 | how fast the dampers lift and seat |
| reverb | `mix`, `decay_seconds`, `predelay_ms`, `damping_hz` | 0.3, 1.1, 12, 5500 | the room |
| action | `pedal` | 0 | sustain pedal |
| | `output_gain` | 0.0011 | output level |

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
| Cost, native (clang -O3, `results/cost.txt`) | 3.1 % of a core per sounding voice; body 36 % (pedal up) to 40 % (pedal down); light body 10 % to 15 % |

## Against Pianoteq

[`pianoteq/README.md`](pianoteq/README.md) measures the C++ coopiano against
Pianoteq 9 (trial, "NY Steinway D Classical" without reverb) on the same MIDI files:
the two agree on the shape of inharmonicity and stretch tuning, mid-register decays and
the stereo image; coopiano's treble at velocity 20 is 25-38 dB quieter (relative to each one's C4), its brightness stops growing
above velocity 64 (the hammer's contact time stops shortening), its sympathetic halo with
the pedal is 17-25 dB weaker and its dampers are faster. Pianoteq renders 2-5 times faster.
The Faust port, measured the same way, follows the C++ (median differences 0.5 dB in level,
0.3 % in brightness, under 3 % in decay) except the end of a damping with the pedal up
(the C++ soundboard's equalizer ring, see Known differences).

## Known differences

- **Partials per string**: 32 for trichords, so a C3 loses the C++ content above
  4.5 kHz (at most -44 dB of the energy, at the attack); `NS = 144` gives 48 per
  string for 1.5x the voice cost.
- **Hammer at 44.1 kHz** instead of 32x: exact to 1 % except the shortest treble
  contacts (C8 fortissimo).
- **Phantoms**: partner distance up to 2 (`piano.hpp`: 3, the next term is
  15 dB down); the -80 dB pair threshold is not applied. The per-pair bound
  (`bound_phantom`) is applied once per strike, from the parents' amplitudes at
  the end of the contact, where the C++ takes them at the hand-over; without it,
  A0 and C1 fortissimo were 2-3 dB louder at the bridge and up to 6 dB louder
  through the body.
- **Random draws**: the per-strike unison readout spread is drawn at each strike
  (the tests set the C++ seed's draws); action noises are other realizations of
  the same filtered noise; the second polarization's tiny detune uses a hash.
- **Noise levels** come from the default voicing's contact solve: other hammer
  voicings scale the strings exactly but the action noises only approximately.
- **Sympathetic register**: opened by the pedal and by the damper-free treble; a
  silently held key's own strings, which the C++ opens, are not opened (a voice
  cannot see the others, and the body sees only their sum).
- **Soundboard**: imaging fixed at the C++ defaults (spread 0.7, position depth
  0.5) and board voicing fixed at `default.ini` (re-run `make tables` after
  changing them in `ref/dump.cpp`). After a release, the C++ board rings on,
  mostly between 300 Hz and 1 kHz: its equalizer (`flatten_ir`), designed on a
  0.34 Hz FFT grid, lifts three quarters of the board's narrow nulls above
  450 Hz by up to 20 dB, and those narrow peaks ring for about 2 s until the
  response is cut at 1.4 s. The modal fit, on the C++ modes (T60 at most
  0.45 s), cannot carry that ring, and 64 resonators fitted to it gain only
  1-2 dB: the board's response is at -48, -56, -72 dB (C++) against -65, -92,
  -158 dB (Faust) over 0.3-0.5, 0.5-0.75 and 1-1.4 s, relative to its first
  50 ms. After a C4 staccato with the pedal up the instrument is 15-25 dB under
  the C++ from 0.35 s after the release; the room reverb masks it for about a
  second after the release.
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
is held at the audio rate, hence `on_change`. Found with the web version: the
wasm backend's code was 1.3 to 1.8 times slower than Emscripten's on the same
C++, a gap `main-dev` `51642a20` closed except for the light body (point 14), and a sum of a constant, a control and a signal is grouped
otherwise than in C++ (point 15): the slow part is no longer hoisted and the
rounding differs. The latter kept the damped keys of the sympathetic register
awake after the first pedal; `coopiano.lib` 0.2.1 works around it with a
threshold.

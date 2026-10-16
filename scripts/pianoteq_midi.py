"""Write the MIDI files of the coopiano / Pianoteq comparison (build/pianoteq).

Both instruments render the same files: coopiano (the C++ original, reverb
off) and Pianoteq (dry preset: reverb, delay and limiter off), so their
differences come from the instruments, not from the scores.

  chromatic.mid  every key, velocity 80: finds the keys a trial Pianoteq mutes
  notes.mid      KEYS x VELOCITIES, each note held HOLD s then released,
                 STEP s apart: levels, partials, decays, releases
  decay/decay_KEY.mid  one note per file, velocity 90, held 15 s: decays, release
  keys.mid       the test keys once: coopiano prints their model parameters
  pedal.mid      the same staccato notes with and without the sustain pedal:
                 the sympathetic resonance
  demo.mid       coopiano's own demo (coopiano.cpp, `coopiano demo`)
  prelude.mid    J.S. Bach, Prelude in C major BWV 846, bars 1-11, for listening

The note list of notes.mid is written to notes.txt (onset key velocity hold),
which scripts/pianoteq_analyze.py reads back."""
import os
import struct

OUT = "build/pianoteq"
DIVISION = 480            # ticks per quarter note
US_PER_QN = 500000        # 120 bpm: one tick is 1/960 s
TICK = US_PER_QN * 1e-6 / DIVISION

KEYS = [21, 24, 33, 36, 45, 48, 57, 60, 69, 72, 81, 84, 93, 96, 105, 108]
VELOCITIES = [20, 40, 64, 90, 115, 127]
HOLD = 5.0                # seconds the key is held
STEP = 7.0                # seconds between onsets: 2 s of release
DECAY_HOLD = 15.0         # decay/decay_KEY.mid: seconds held


def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return bytes(out)


def write_midi(path, events):
    """events: (seconds, bytes) MIDI channel messages, any order."""
    events = sorted(events, key=lambda e: (e[0], e[1][0] & 0xF0 == 0x90))  # offs before ons
    track = bytearray(b"\x00\xFF\x51\x03" + US_PER_QN.to_bytes(3, "big"))
    tick = 0
    for t, msg in events:
        at = round(t / TICK)
        track += vlq(at - tick) + msg
        tick = at
    track += b"\x00\xFF\x2F\x00"
    with open(path, "wb") as f:
        f.write(b"MThd" + struct.pack(">IHHH", 6, 0, 1, DIVISION))
        f.write(b"MTrk" + struct.pack(">I", len(track)) + track)


def note(t, key, vel, hold):
    return [(t, bytes([0x90, key, vel])), (t + hold, bytes([0x80, key, 0]))]


def pedal(t, down):
    return [(t, bytes([0xB0, 64, 127 if down else 0]))]


os.makedirs(OUT, exist_ok=True)

# Every key once: a muted key shows up as a silent slot.
ev = []
for i, key in enumerate(range(21, 109)):
    ev += note(1.0 + 0.6 * i, key, 80, 0.4)
write_midi(f"{OUT}/chromatic.mid", ev)

# Single notes: key by key, velocities rising.
ev, rows, t = [], [], 1.0
for key in KEYS:
    for vel in VELOCITIES:
        ev += note(t, key, vel, HOLD)
        rows.append((t, key, vel, HOLD))
        t += STEP
write_midi(f"{OUT}/notes.mid", ev)
with open(f"{OUT}/notes.txt", "w") as f:
    f.write("# onset key velocity hold (seconds, MIDI)\n")
    for r in rows:
        f.write("%.3f %d %d %.3f\n" % r)

# Decays: one file per key, velocity 90 held DECAY_HOLD s then released, so
# that coopiano's per-file normalization gives each tail the whole 16 bits.
# Pianoteq's export stops 0.7 s after the last event: a pedal-up (the pedal
# is up already) 4 s after the release keeps the release in the file.
os.makedirs(f"{OUT}/decay", exist_ok=True)
for key in KEYS:
    write_midi(f"{OUT}/decay/decay_{key}.mid", note(0.5, key, 90, DECAY_HOLD) + pedal(DECAY_HOLD + 4.5, False))

# The test keys once (at most 24 notes): coopiano then prints each key's
# model parameters (B, T60 of the fundamental), against which the analysis
# checks its own estimates.
ev = []
for i, key in enumerate(KEYS):
    ev += note(1.0 + i, key, 64, 0.3)
write_midi(f"{OUT}/keys.mid", ev)

# Sympathetic resonance: a 0.15 s staccato note, pedal up then pedal down;
# the pedal is pressed 0.5 s before the note and lifted 6 s after it.
ev, rows, t = [], [], 1.0
for key in [36, 48, 60, 72, 84]:
    for down in (False, True):
        if down:
            ev += pedal(t - 0.5, True) + pedal(t + 6.0, False)
        ev += note(t, key, 90, 0.15)
        rows.append((t, key, 90, 0.15, int(down)))
        t += 8.0
write_midi(f"{OUT}/pedal.mid", ev)
with open(f"{OUT}/pedal.txt", "w") as f:
    f.write("# onset key velocity hold pedal (seconds, MIDI, 1 = down)\n")
    for r in rows:
        f.write("%.3f %d %d %.3f %d\n" % r)

# coopiano's demo (coopiano.cpp, run_cli "demo"): time, note, velocity, hold.
DEMO = [(0.00, 36, 0.62, 7.5), (0.00, 43, 0.50, 7.5), (0.45, 48, 0.52, 7.0),
        (0.90, 52, 0.50, 6.6), (1.35, 55, 0.55, 6.2), (1.80, 59, 0.52, 5.7),
        (2.25, 62, 0.55, 5.3), (2.70, 64, 0.58, 4.9), (3.40, 72, 0.65, 4.2),
        (3.40, 64, 0.45, 4.2), (3.40, 67, 0.48, 4.2), (3.40, 71, 0.50, 4.2),
        (5.60, 84, 0.40, 2.5), (7.60, 33, 0.92, 5.0), (7.60, 45, 0.78, 5.0),
        (9.80, 40, 0.55, 3.0)]
ev = []
for t, key, v, hold in DEMO:
    ev += note(0.5 + t, key, max(1, round(127 * v)), hold)
write_midi(f"{OUT}/demo.mid", ev)

# Bach, BWV 846, bars 1-11: per half bar, n1 held, n2 held from the second
# sixteenth, then n3 n4 n5 n3 n4 n5. Quarter = 66.
BARS = [(60, 64, 67, 72, 76), (60, 62, 69, 74, 77), (59, 62, 67, 74, 77),
        (60, 64, 67, 72, 76), (60, 64, 69, 76, 81), (60, 62, 66, 69, 74),
        (59, 62, 67, 74, 79), (59, 60, 64, 67, 72), (57, 60, 64, 67, 72),
        (50, 57, 62, 66, 72), (55, 59, 62, 67, 71)]
SIX = 60 / 66 / 4
ev, t = [], 0.5
for bar in BARS:
    for half in range(2):
        n1, n2, n3, n4, n5 = bar
        ev += note(t, n1, 58, 8 * SIX)
        ev += note(t + SIX, n2, 52, 7 * SIX)
        for i, k in enumerate((n3, n4, n5, n3, n4, n5)):
            ev += note(t + (2 + i) * SIX, k, 56 if i % 3 == 0 else 50, SIX * 1.05)
        t += 8 * SIX
write_midi(f"{OUT}/prelude.mid", ev)
print("wrote", ", ".join(sorted(f for f in os.listdir(OUT) if f.endswith(".mid"))))

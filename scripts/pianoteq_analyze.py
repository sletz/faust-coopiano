"""Measure coopiano against Pianoteq on the renders of scripts/pianoteq_render.sh.

Reads build/pianoteq (the renders, notes.txt, pedal.txt, coopiano_keys.txt,
timing.txt) and writes pianoteq/results.txt and pianoteq/fig_*.png.

Every measurement is made the same way on both instruments, on the power of
the two channels summed (|L|^2 + |R|^2), so that the spacing of Pianoteq's
microphones does not carve comb filters into a mono sum. Levels are relative
to each instrument's own C4 at velocity 90: coopiano's WAV is normalized per
file and Pianoteq's level depends on its preset, so only relative levels mean
something.

notes.mid (5 s holds, six velocities):
  level        RMS over the first 0.3 s after the onset
  partials     frequencies of partials 1..40 (below 18 kHz) on a 3 s window
               from 0.05 s, refined by fitting f_n = n f0 sqrt(1 + B n^2):
               gives f0 (in cents from equal temperament, A4 = 440 Hz) and B
  amplitudes   partial levels on the first 0.3 s, relative to the strongest
  brightness   spectral centroid of the first 0.2 s, over the key's f0
  balance      L - R level over the first 2 s (where the key sits in the image)
  release      time for the level to fall 40 dB after the key is released,
               within the 1.95 s before the next note
decay/decay_KEY.mid (velocity 90 held 15 s, one note per file):
  decay        T60 of the broadband level on 0.1-1 s (early) and 3-14.5 s
               (late), of partials 1-4 on 0.3-14.5 s; only the frames less
               than 60 dB under the note's peak are fitted
pedal.mid (staccato velocity 90, pedal up then down):
  tail         level 1-4 s after the onset relative to the first 0.3 s
  halo         energy, 0.5-3.5 s after the onset, at the fundamentals of the
               keys whose partials are not the note's, relative to the whole
               tail: the strings the pedal frees
demo.mid, prelude.mid:
  stereo       L/R correlation and the level lost by summing to mono
  listening    build/pianoteq/listen/*_matched.wav: the dry renders and the
               renders with each instrument's room, all at the same RMS
               (-20 dBFS over the piece), so that loudness does not decide"""
import os
import re
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.io import wavfile

D = "build/pianoteq"
OUT = "pianoteq"
# (render suffix, label, colour, line style): the C++ coopiano, its Faust port
# (tools/render.cpp) and Pianoteq.
INSTR = [("coopiano", "coopiano (C++)", "C0", "-"), ("faust", "coopiano (Faust)", "C2", "--"),
         ("pianoteq", "Pianoteq", "C3", "-")]
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
plt.rcParams.update({"font.size": 8, "axes.linewidth": 0.6, "lines.linewidth": 0.9,
                     "figure.dpi": 200, "savefig.bbox": "tight"})
os.makedirs(OUT, exist_ok=True)
REPORT = []


def say(line=""):
    print(line)
    REPORT.append(line)


def name(key):
    return NAMES[key % 12] + str(key // 12 - 1)


def et(key):
    return 440.0 * 2 ** ((key - 69) / 12)


def db(p):
    return 10 * np.log10(np.maximum(p, 1e-30))


def fmt(v, width=5):
    if v is None or np.isnan(v):
        return "–".rjust(width)
    if np.isinf(v) or v > 999:
        return ">999".rjust(width)
    return ("%" + str(width) + ".1f") % v


def load(stem):
    sr, x = wavfile.read(f"{D}/{stem}.wav")
    if x.dtype == np.int16:
        x = x / 32768.0
    elif x.dtype == np.int32:
        x = x / 2.0 ** 31
    return sr, np.asarray(x, dtype=np.float64)


def table(path):
    return [tuple(float(v) for v in l.split()) for l in open(path) if l.strip() and l[0] != "#"]


def power(x):
    return (x ** 2).sum(axis=1)


def envelope(x, sr, a, b, win):
    """Level (dB, channel power summed) in frames of `win` seconds over [a, b)."""
    n = int(win * sr)
    p = power(x[a:b])
    p = p[: (p.size // n) * n].reshape(-1, n).mean(axis=1)
    return (np.arange(p.size) + 0.5) * win, db(p)


def onset(x, sr, t):
    """First sample within 30 dB of the peak of the 150 ms after the scheduled time."""
    a, b = max(int((t - 0.005) * sr), 0), int((t + 0.15) * sr)
    p = power(x[a:b])
    return (a + int(np.argmax(p > p.max() * 1e-3))) / sr


def spectrum(x, sr, a, b, nfft):
    w = np.hanning(b - a)[:, None]
    return (np.abs(np.fft.rfft(x[a:b] * w, nfft, axis=0)) ** 2).sum(axis=1)


def fit_inharmonicity(found):
    """f0 and B from (n, f_n): (f_n / n)^2 = f0^2 + f0^2 B n^2, least squares."""
    n = np.array([h[0] for h in found], float)
    y = (np.array([h[1] for h in found]) / n) ** 2
    A = np.vstack([np.ones_like(n), n ** 2]).T
    (c0, c1), *_ = np.linalg.lstsq(A, y, rcond=None)
    return np.sqrt(c0), max(c1 / c0, 0.0)


def partials(x, sr, on, key, nmax=40, fmax=18000.0):
    """Partial frequencies on 0.05-3.05 s, tracked upwards from the fundamental."""
    nfft = 2 ** 20
    P = spectrum(x, sr, int((on + 0.05) * sr), int((on + 3.05) * sr), nfft)
    df = sr / nfft
    f0, B, found = et(key), 0.0, []
    for n in range(1, nmax + 1):
        pred = n * f0 * np.sqrt(1 + B * n * n)
        if pred > fmax:
            break
        half = (0.06 if len(found) < 3 else 0.025) * f0
        lo, hi = int((pred - half) / df), int((pred + half) / df) + 1
        i = lo + int(np.argmax(P[lo:hi]))
        # A partial stands 20 dB above the median of the half-spacing around it.
        flo, fhi = int((pred - 0.5 * f0) / df), int((pred + 0.5 * f0) / df)
        if db(P[i]) - db(np.median(P[max(flo, 1):fhi])) < 20:
            continue
        a, b, c = db(P[i - 1:i + 2])
        shift = 0.5 * (a - c) / (a - 2 * b + c) if a - 2 * b + c != 0 else 0.0
        found.append((n, (i + shift) * df))
        if len(found) >= 2:  # two partials already give B: the treble needs it
            f0, B = fit_inharmonicity(found)
    if len(found) < 3:
        return None
    f0, B = fit_inharmonicity(found)
    return {"f0": f0, "B": B, "cents": 1200 * np.log2(f0 / et(key)), "found": found, "n": len(found)}


def partial_freq(fit, n):
    return n * fit["f0"] * np.sqrt(1 + fit["B"] * n * n)


def amplitudes(x, sr, on, fit, nmax=20):
    nfft = 2 ** 17
    P = spectrum(x, sr, int((on + 0.01) * sr), int((on + 0.31) * sr), nfft)
    df = sr / nfft
    out = []
    for n in range(1, nmax + 1):
        f = partial_freq(fit, n)
        if f > sr / 2 - 1000:
            break
        w = max(3.0, 0.01 * f)
        out.append(db(P[int((f - w) / df): int((f + w) / df) + 1].max()))
    out = np.array(out)
    return out - out.max()


def t60(t, l, a, b, floor):
    """T60 of a line fitted to the frames of [a, b] above `floor` (dB)."""
    m = (t >= a) & (t <= b) & (l > floor)
    if m.sum() < 5 or t[m][-1] - t[m][0] < 0.3 * (b - a):
        return np.nan
    s = np.polyfit(t[m], l[m], 1)[0]
    return -60.0 / s if s < 0 else np.inf


def centroid(x, sr, on):
    nfft = 2 ** 14
    P = spectrum(x, sr, int(on * sr), int((on + 0.2) * sr), nfft)
    f = np.fft.rfftfreq(nfft, 1 / sr)
    m = (f > 20) & (f < 16000)
    return float((f[m] * P[m]).sum() / P[m].sum())


def analyze_note(x, sr, t, key, vel, hold):
    on = onset(x, sr, t)
    a = int(on * sr)
    r = {"key": int(key), "vel": int(vel), "on": on}
    r["level"] = float(db(power(x[a:a + int(0.3 * sr)]).mean()))
    r["centroid"] = centroid(x, sr, on)
    L, R = x[a:a + 2 * sr, 0], x[a:a + 2 * sr, 1]
    r["balance"] = float(db(np.dot(L, L)) - db(np.dot(R, R)))
    # Release: from the level of the last 50 ms held to 40 dB under it.
    rel = int((t + hold) * sr)
    before = db(power(x[rel - int(0.05 * sr):rel]).mean())
    tr, lr = envelope(x, sr, rel, rel + int(1.95 * sr), 0.005)
    below = np.nonzero(lr < before - 40)[0]
    r["release"] = tr[below[0]] if below.size else np.inf
    fit = partials(x, sr, on, key)
    r["fit"] = fit
    if fit:
        r["amps"] = amplitudes(x, sr, on, fit)
    return r


def analyze_decay(stem, key, fit, hold):
    sr, x = load(f"decay/decay_{key}_{stem}")
    on = onset(x, sr, 0.5)
    a, rel = int(on * sr), int((0.5 + hold) * sr)
    te, le = envelope(x, sr, a, rel, 0.02)
    floor = le.max() - 60
    r = {"early": t60(te, le, 0.1, 1.0, floor), "late": t60(te, le, 3.0, hold - 0.5, floor)}
    # Partials 1-4: an 8192-point STFT, the bins around each partial.
    nfft, hop = 8192, 2048
    seg = x[a:rel]
    w = np.hanning(nfft)[:, None]
    starts = np.arange(0, seg.shape[0] - nfft, hop)
    S = np.array([(np.abs(np.fft.rfft(seg[i:i + nfft] * w, axis=0)) ** 2).sum(axis=1) for i in starts])
    ts = (starts + nfft / 2) / sr
    df = sr / nfft
    r["partials"] = []
    for n in range(1, 5):
        f = partial_freq(fit, n) if fit else n * et(key)
        if f > 16000:
            r["partials"].append(np.nan)
            continue
        l = db(S[:, int(f / df) - 1:int(f / df) + 3].max(axis=1))
        r["partials"].append(t60(ts, l, 0.3, hold - 0.5, max(l.max() - 60, floor)))
    return r


def halo(x, sr, t, key, fit):
    """Energy at the fundamentals of the keys that are not partials of `key`."""
    nfft = 2 ** 18
    P = spectrum(x, sr, int((t + 0.5) * sr), int((t + 3.5) * sr), nfft)
    df = sr / nfft
    own = [partial_freq(fit, n) for n in range(1, 80)] if fit else [et(key) * n for n in range(1, 80)]
    e = 0.0
    for k in range(21, 109):
        f = et(k)
        if min(abs(f / o - 1) for o in own) < 0.015:
            continue
        w = 0.003 * f + 1.0
        e += P[int((f - w) / df): int((f + w) / df) + 1].sum()
    return float(db(e) - db(P[int(20 / df):].sum()))


# ------------------------------------------------------------------ measures
notes = table(f"{D}/notes.txt")
pedals = table(f"{D}/pedal.txt")
KEYS = sorted({int(n[1]) for n in notes})
VELS = sorted({int(n[2]) for n in notes})
DECAY_HOLD = 15.0
data = {}
for stem, label, _, _ in INSTR:
    sr, x = load(f"notes_{stem}")
    res = [analyze_note(x, sr, *n) for n in notes]
    ref = next(r["level"] for r in res if r["key"] == 60 and r["vel"] == 90)
    for r in res:
        r["level"] -= ref
    fits = {r["key"]: r["fit"] for r in res if r["vel"] == 64}
    decays = {k: analyze_decay(stem, k, fits[k], DECAY_HOLD) for k in KEYS}
    sr, xp = load(f"pedal_{stem}")
    ped = []
    for t, key, vel, hold, down in pedals:
        on = onset(xp, sr, t)
        a = int(on * sr)
        attack = db(power(xp[a:a + int(0.3 * sr)]).mean())
        tail = db(power(xp[int((t + 1.0) * sr):int((t + 4.0) * sr)]).mean())
        ped.append({"key": int(key), "down": int(down), "tail": tail - attack,
                    "halo": halo(xp, sr, t, int(key), fits.get(int(key)))})
    music = {}
    for piece in ("prelude", "demo"):
        sr, xm = load(f"{piece}_{stem}")
        L, R = xm[:, 0], xm[:, 1]
        music[piece] = (float(np.dot(L, R) / np.sqrt(np.dot(L, L) * np.dot(R, R))),
                        float(db(np.dot(L + R, L + R)) - db(2 * (np.dot(L, L) + np.dot(R, R)))))
    data[stem] = {"notes": res, "decay": decays, "pedal": ped, "music": music}


def get(stem, key, vel):
    return next(r for r in data[stem]["notes"] if r["key"] == key and r["vel"] == vel)


# ------------------------------------------------------------------ report
say("coopiano (C++ original, reverb off) against Pianoteq 9 (trial, preset")
say("\"NY Steinway D Classical\" without reverb, delay and limiter): measurements of")
say("scripts/pianoteq_analyze.py on the renders of scripts/pianoteq_render.sh.")
say()

sr, xc = load("chromatic_pianoteq")
lv = []
for i in range(88):
    a = int((1.0 + 0.6 * i) * sr)
    lv.append(db(power(xc[a:a + int(0.4 * sr)]).mean()))
lv = np.array(lv) - np.median(lv)
say("Keys the Pianoteq trial mutes (chromatic.mid, > 20 dB under the median): "
    + " ".join(name(21 + i) for i in range(88) if lv[i] < -20))
say()

model = {}
for l in open(f"{D}/coopiano_keys.txt"):
    m = re.match(r"(\S+)\s+f0=\s*([\d.]+) Hz.*B=([\d.]+)\s+T60_1=([\d.]+)", l)
    if m:
        model[m.group(1)] = (float(m.group(2)), float(m.group(3)), float(m.group(4)))
say("1. Inharmonicity and tuning (velocity 64, partials up to 18 kHz)")
say("   key   B coopiano (model)     B Pianoteq  ratio P/c   f0 cents: coop. (model)  Pianoteq   partials c/P")
for k in KEYS:
    c, p = get("coopiano", k, 64)["fit"], get("pianoteq", k, 64)["fit"]
    mf, mb, _ = model.get(name(k), (np.nan, np.nan, np.nan))
    cb = "%10.2e" % c["B"] if c else "%10s" % "–"
    pb = "%10.2e" % p["B"] if p else "%10s" % "–"
    ratio = fmt(p["B"] / c["B"] if c and p and c["B"] > 0 else np.nan, 9)
    say("   %-4s %s (%8.2e) %s %s %13s (%6.1f) %9s %8s/%s" % (
        name(k), cb, mb, pb, ratio, fmt(c["cents"] if c else np.nan, 6),
        1200 * np.log2(mf / et(k)), fmt(p["cents"] if p else np.nan, 6),
        c["n"] if c else 0, p["n"] if p else 0))
say()

say("2. Dynamics: level (dB) relative to C4 velocity 90 (coopiano / Pianoteq)")
say("   key  " + "".join("  %13s" % ("v=%d" % v) for v in VELS) + "   range 20..127")
for k in KEYS:
    c = [get("coopiano", k, v)["level"] for v in VELS]
    p = [get("pianoteq", k, v)["level"] for v in VELS]
    say("   %-4s " % name(k) + "".join("  %6.1f %6.1f" % cp for cp in zip(c, p))
        + "   %5.1f %5.1f" % (c[-1] - c[0], p[-1] - p[0]))
say()

say("3. Brightness: spectral centroid of the first 0.2 s over f0 (coopiano / Pianoteq)")
say("   key  " + "".join("  %13s" % ("v=%d" % v) for v in VELS))
for k in KEYS:
    say("   %-4s " % name(k) + "".join("  %6.1f %6.1f" % (get("coopiano", k, v)["centroid"] / et(k),
                                                         get("pianoteq", k, v)["centroid"] / et(k)) for v in VELS))
say()

say("4. Decay (decay/, velocity 90 held 15 s): T60 in seconds of the broadband level,")
say("   early (0.1-1 s) and late (3-14.5 s), of partials 1-4 (0.3-14.5 s); release")
say("   (notes.mid, velocity 90 held 5 s): seconds for the level to fall 40 dB,")
say("   '>999' when it has not within 1.95 s (coopiano / Pianoteq).")
say("   '–': less than 60 dB of decay left to fit. coopiano's model T60 of partial 1 in ().")
say("   key    level early   level late    partial 1 (model)       partial 2     partial 3     partial 4     release -40 dB")
for k in KEYS:
    c, p = data["coopiano"]["decay"][k], data["pianoteq"]["decay"][k]
    mt = model.get(name(k), (0, 0, np.nan))[2]
    say("   %-4s  %s %s   %s %s   %s %s (%s)   %s %s   %s %s   %s %s   %s %s" % (
        name(k), fmt(c["early"]), fmt(p["early"]), fmt(c["late"]), fmt(p["late"]),
        fmt(c["partials"][0]), fmt(p["partials"][0]), fmt(mt),
        fmt(c["partials"][1]), fmt(p["partials"][1]), fmt(c["partials"][2]), fmt(p["partials"][2]),
        fmt(c["partials"][3]), fmt(p["partials"][3]),
        fmt(get("coopiano", k, 90)["release"], 6), fmt(get("pianoteq", k, 90)["release"], 6)))
say()

say("5. Stereo: L - R level of each key over its first 2 s (velocity 90), and on the")
say("   music the L/R correlation and the level lost when summing to mono")
say("   " + "  ".join("%s %s/%s" % (name(k), fmt(get("coopiano", k, 90)["balance"], 4),
                                    fmt(get("pianoteq", k, 90)["balance"], 4).strip()) for k in KEYS))
for piece in ("prelude", "demo"):
    (cc, cm), (pc, pm) = data["coopiano"]["music"][piece], data["pianoteq"]["music"][piece]
    say("   %-8s correlation %.2f / %.2f   mono sum %+.1f / %+.1f dB" % (piece, cc, pc, cm, pm))
say()

say("6. Sustain pedal (pedal.mid, staccato velocity 90, released after 0.15 s): tail")
say("   1-4 s relative to the attack, pedal up and down, and halo with the pedal down")
say("   (energy at the keys that are not partials of the note, relative to the tail)")
say("   key   tail up        tail down      halo down")
for k in sorted({p["key"] for p in data["coopiano"]["pedal"]}):
    q = {(s, d): next(v for v in data[s]["pedal"] if v["key"] == k and v["down"] == d)
         for s in ("coopiano", "pianoteq") for d in (0, 1)}
    say("   %-4s %6.1f %6.1f  %6.1f %6.1f  %6.1f %6.1f" % (
        name(k), q["coopiano", 0]["tail"], q["pianoteq", 0]["tail"], q["coopiano", 1]["tail"],
        q["pianoteq", 1]["tail"], q["coopiano", 1]["halo"], q["pianoteq", 1]["halo"]))
say()

say("7. Rendering time (offline, this machine; Pianoteq's includes its start-up)")
TIMES = {}
for l in open(f"{D}/timing.txt"):
    f = l.split()
    TIMES[f[0]] = dict(zip(f[1::2], map(float, f[2::2])))
    sr_, xx = load(f"{f[0]}_coopiano")
    dur = xx.shape[0] / sr_
    say("   %-10s %6.1f s of audio: " % (f[0], dur) + ", ".join(
        "%s %5.1f s (%5.1fx real time)" % (who, t, dur / t) for who, t in TIMES[f[0]].items()))
say()
say("8. The Faust port (tools/render.cpp: this repository's voice and body compiled to C++")
say("   by faust-rs) against the C++ coopiano, on the same scores: every measure above")
say("   taken on both, Faust minus C++ (ratios in %). Largest difference, where, and median.")


def compare(title, unit, pairs):
    pairs = [(w, d) for w, d in pairs if d is not None and np.isfinite(d)]
    if not pairs:
        return
    where, big = max(pairs, key=lambda p: abs(p[1]))
    med = float(np.median([abs(d) for _, d in pairs]))
    say("   %-34s %+8.2f %-5s (%s)%s median %.2f %s, %d values" % (
        title, big, unit, where, " " * max(1, 12 - len(where)), med, unit, len(pairs)))


def ratio(a, b):
    return 100 * (a / b - 1) if a and b and np.isfinite(a) and np.isfinite(b) and b > 0 else None


def fitted(stem, k):
    return get(stem, k, 64)["fit"]


compare("inharmonicity B", "%", [(name(k), ratio(fitted("faust", k)["B"], fitted("coopiano", k)["B"]))
                                 for k in KEYS if fitted("faust", k) and fitted("coopiano", k) and k < 108])
compare("tuning (fitted f0)", "cents", [(name(k), fitted("faust", k)["cents"] - fitted("coopiano", k)["cents"])
                                        for k in KEYS if fitted("faust", k) and fitted("coopiano", k) and k < 108])
compare("level (re C4 v=90)", "dB", [("%s v=%d" % (name(k), v), get("faust", k, v)["level"] - get("coopiano", k, v)["level"])
                                     for k in KEYS for v in VELS])
compare("brightness (centroid)", "%", [("%s v=%d" % (name(k), v), ratio(get("faust", k, v)["centroid"], get("coopiano", k, v)["centroid"]))
                                       for k in KEYS for v in VELS])
for field, title in (("early", "T60 level, early"), ("late", "T60 level, late")):
    compare(title, "%", [(name(k), ratio(data["faust"]["decay"][k][field], data["coopiano"]["decay"][k][field])) for k in KEYS])
for n in range(4):
    compare("T60 partial %d" % (n + 1), "%", [(name(k), ratio(data["faust"]["decay"][k]["partials"][n],
                                                              data["coopiano"]["decay"][k]["partials"][n])) for k in KEYS])
compare("release, -40 dB", "s", [(name(k), get("faust", k, 90)["release"] - get("coopiano", k, 90)["release"]) for k in KEYS])
compare("balance L-R", "dB", [(name(k), get("faust", k, 90)["balance"] - get("coopiano", k, 90)["balance"]) for k in KEYS])
for field, down, title in (("tail", 0, "pedal: tail, pedal up"), ("tail", 1, "pedal: tail, pedal down"), ("halo", 1, "pedal: halo, pedal down")):
    compare(title, "dB", [(name(q["key"]), q[field] - next(c[field] for c in data["coopiano"]["pedal"] if c["key"] == q["key"] and c["down"] == down))
                          for q in data["faust"]["pedal"] if q["down"] == down])
for piece in ("prelude", "demo"):
    (cc, cm), (fc, fm) = data["coopiano"]["music"][piece], data["faust"]["music"][piece]
    say("   %-34s correlation %.3f / %.3f (C++ / Faust), mono sum %+.2f / %+.2f dB" % (piece, cc, fc, cm, fm))
open(f"{OUT}/results.txt", "w").write("\n".join(REPORT) + "\n")

# ------------------------------------------------------------------ figures
keys = np.array(KEYS)
mk = [k for k in KEYS if name(k) in model]
fig, axes = plt.subplots(1, 2, figsize=(6.8, 2.2))
for stem, label, col, ls in INSTR:
    fits = [get(stem, k, 64)["fit"] for k in KEYS]
    axes[0].semilogy(keys, [f["B"] if f and f["B"] > 0 else np.nan for f in fits], "o", ls=ls, color=col, ms=3, label=label)
    axes[1].plot(keys, [f["cents"] if f else np.nan for f in fits], "o", ls=ls, color=col, ms=3, label=label)
axes[0].semilogy(mk, [model[name(k)][1] for k in mk], "k:", lw=0.8, label="coopiano model")
axes[1].plot(mk, [1200 * np.log2(model[name(k)][0] / et(k)) for k in mk], "k:", lw=0.8, label="coopiano model")
axes[0].set_title("Inharmonicity B (velocity 64)")
axes[1].set_title("Fitted f0, cents from equal temperament")
for ax in axes:
    ax.set_xlabel("MIDI key")
    ax.grid(alpha=0.3)
axes[0].legend(frameon=False)
fig.savefig(f"{OUT}/fig_inharmonicity.png")

fig, axes = plt.subplots(1, 4, figsize=(6.8, 2.0), sharey=True)
for ax, k in zip(axes, (36, 60, 84, 108)):
    for stem, label, col, ls in INSTR:
        ax.plot(VELS, [get(stem, k, v)["level"] for v in VELS], "o", ls=ls, color=col, ms=3, label=label)
    ax.set_title(name(k))
    ax.set_xlabel("MIDI velocity")
    ax.grid(alpha=0.3)
axes[0].set_ylabel("dB re C4 v=90")
axes[0].legend(frameon=False)
fig.savefig(f"{OUT}/fig_dynamics.png")

fig, axes = plt.subplots(1, 3, figsize=(6.8, 2.1))
for ax, k in zip(axes, (21, 36, 60)):
    for stem, label, col, ls in INSTR:
        ax.plot(VELS, [get(stem, k, v)["centroid"] / et(k) for v in VELS], "o", ls=ls, color=col, ms=3, label=label)
    ax.set_title(name(k))
    ax.set_xlabel("MIDI velocity")
    ax.grid(alpha=0.3)
axes[0].set_ylabel("centroid / f0")
axes[0].legend(frameon=False)
fig.savefig(f"{OUT}/fig_brightness.png")

fig, axes = plt.subplots(2, 3, figsize=(6.8, 3.6), sharey=True)
for j, k in enumerate((36, 60, 84)):
    for i, v in enumerate((40, 127)):
        ax = axes[i, j]
        w = 0.27
        for s, (stem, label, col, _) in enumerate(INSTR):
            a = get(stem, k, v).get("amps")
            if a is not None:
                ax.bar(np.arange(1, a.size + 1) + (s - 1) * w, a + 60, w, bottom=-60, color=col, label=label)
        ax.set_title("%s v=%d" % (name(k), v))
        ax.set_ylim(-60, 2)
        ax.grid(alpha=0.3, axis="y")
    axes[1, j].set_xlabel("partial")
axes[0, 0].set_ylabel("dB re strongest")
axes[1, 0].set_ylabel("dB re strongest")
axes[0, 2].legend(frameon=False, loc="upper right")
fig.subplots_adjust(hspace=0.45)
fig.savefig(f"{OUT}/fig_partials.png")

fig, axes = plt.subplots(1, 2, figsize=(6.8, 2.2))
for stem, label, col, ls in INSTR:
    dec = data[stem]["decay"]
    axes[0].semilogy(keys, [dec[k]["partials"][0] for k in KEYS], "o", ls=ls, color=col, ms=3, label=label + ", partial 1")
    if stem != "faust":
        axes[0].semilogy(keys, [dec[k]["late"] for k in KEYS], "s:", color=col, ms=2.5, label=label + ", level (late)")
    axes[1].semilogy(keys, [min(get(stem, k, 90)["release"], 2.0) for k in KEYS], "o", ls=ls, color=col, ms=3, label=label)
axes[0].semilogy(mk, [model[name(k)][2] for k in mk], "k:", lw=0.8, label="coopiano model, partial 1")
axes[0].set_title("T60 while held (s), velocity 90")
axes[1].set_title("Release: time to fall 40 dB (s, 2 = not within 1.95 s)")
for ax in axes:
    ax.set_xlabel("MIDI key")
    ax.grid(alpha=0.3, which="both")
axes[0].legend(frameon=False, fontsize=6)
axes[1].legend(frameon=False)
fig.savefig(f"{OUT}/fig_decay.png")

wav = {stem: load(f"notes_{stem}") for stem, _, _, _ in INSTR}
fig, axes = plt.subplots(3, 3, figsize=(6.8, 5.6))
for j, (k, fmax) in enumerate(((36, 4000), (60, 6000), (84, 10000))):
    for i, (stem, label, _, _) in enumerate(INSTR):
        sr, x = wav[stem]
        a = int(get(stem, k, 90)["on"] * sr)
        seg = x[a - int(0.05 * sr):a + int(4.0 * sr)]
        nfft, hop = 4096, 512
        w = np.hanning(nfft)[:, None]
        S = np.array([(np.abs(np.fft.rfft(seg[q:q + nfft] * w, axis=0)) ** 2).sum(axis=1)
                      for q in range(0, seg.shape[0] - nfft, hop)]).T
        S = db(S / S.max())
        fr = np.fft.rfftfreq(nfft, 1 / sr)
        ax = axes[i, j]
        ax.imshow(S[fr <= fmax], origin="lower", aspect="auto", cmap="magma", vmin=-80, vmax=0,
                  extent=[-0.05, -0.05 + S.shape[1] * hop / sr, 0, fmax / 1000])
        ax.set_title("%s %s v=90" % (label, name(k)))
        if i == 2:
            ax.set_xlabel("s")
        if j == 0:
            ax.set_ylabel("kHz")
fig.subplots_adjust(hspace=0.45)
fig.savefig(f"{OUT}/fig_spectrograms.png")
# ------------------------------------------------------------------ listening
os.makedirs(f"{D}/listen", exist_ok=True)
for piece in ("prelude", "demo"):
    for stem, _, _, _ in INSTR:
        for src, tag in ((f"{piece}_{stem}", "dry"), (f"listen/{piece}_{stem}_room", "room")):
            if not os.path.exists(f"{D}/{src}.wav"):
                continue
            sr, x = load(src)
            g = 10 ** (-20 / 20) / np.sqrt(np.mean(x ** 2))
            g = min(g, 0.99 / np.abs(x).max())
            wavfile.write(f"{D}/listen/{piece}_{tag}_{stem}_matched.wav", sr, (x * g).astype(np.float32))
print("wrote %s/results.txt, %s/fig_*.png and %s/listen/*_matched.wav" % (OUT, OUT, D))

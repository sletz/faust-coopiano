"""Figures of the article (results/fig_*.png), from build/ref and the renders
that `make results` leaves in build/ (build/contact_*.npy, build/notes/,
build/one_0.npy). The hammer schemes are the numpy replicas of
scripts/contact_sim.py."""
import os, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
sys.path.insert(0, os.path.dirname(__file__))

FS = 44100
os.makedirs("results", exist_ok=True)
plt.rcParams.update({"font.size": 8, "axes.linewidth": 0.6, "lines.linewidth": 0.9,
                     "figure.dpi": 200, "savefig.bbox": "tight"})


def db(x):
    return 10 * np.log10(np.maximum(x, 1e-30))


def envelope(y, win=0.01):
    n = int(win * FS)
    m = y[: (y.size // n) * n].reshape(-1, n)
    return np.arange(m.shape[0]) * win, db(np.mean(m ** 2, axis=1))


# ---- 1. Hammer force: piano.hpp's 32x contact against the audio-rate schemes
sys.argv = ["contact_sim", "84"]
src = open(os.path.join(os.path.dirname(__file__), "contact_sim.py")).read().split("for m in [int(a)")[0]
ns_ = {}
exec(src, ns_)
fig, axes = plt.subplots(1, 2, figsize=(6.8, 2.1))
for ax, (m, vel) in zip(axes, ((84, 1.0), (60, 1.0))):
    v = 6.0 * vel ** 1.8
    nstr = ns_["params"](m)["ns"]
    a = ns_["cpp"](m, v) / nstr
    b = ns_["faust"](m, v, True) / nstr
    path = "build/contact_%d_%.3f.npy" % (m, vel)
    L = np.count_nonzero(a) + 4
    t = np.arange(L) / FS * 1000
    ax.plot(t[: min(L, a.size)], a[:L], "k-", label="piano.hpp (32x, symplectic)")
    ax.plot(t[: min(L, b.size)], b[:L], "--", color="tab:red", label="audio rate, rate one sample late")
    if os.path.exists(path):
        F = np.load(path)[:L] / nstr
        ax.plot(t[: F.size], F, ":", color="tab:blue", lw=1.4, label="coopiano.lib (implicit rate)")
    ax.set_title("key %d, velocity %.0f" % (m, vel))
    ax.set_xlabel("time (ms)")
    ax.set_xlim(0, L / FS * 1000)
axes[0].set_ylabel("force per string (N)")
axes[1].legend(frameon=False, fontsize=6.5)
fig.savefig("results/fig_contact.png")
plt.close(fig)

# ---- 2. Bridge force envelopes
notes = [("note_21_0.50_4.00", "A0"), ("note_60_1.00_3.00", "C4 ff"), ("note_69_0.50_0.50", "A4, released at 0.5 s"), ("note_96_0.50_2.00", "C7")]
fig, axes = plt.subplots(1, 4, figsize=(6.8, 1.9), sharey=True)
for ax, (name, label) in zip(axes, notes):
    ref = np.fromfile("build/ref/%s.f64" % name)
    p = "build/notes/%s.npy" % name
    t, e = envelope(ref)
    ax.plot(t, e - e.max(), "k-", label="piano.hpp")
    if os.path.exists(p):
        y = np.load(p)
        t2, e2 = envelope(y)
        ax.plot(t2, e2 - e.max(), ":", color="tab:blue", lw=1.4, label="coopiano.lib")
    ax.set_title(label)
    ax.set_xlabel("time (s)")
    ax.set_ylim(-100, 3)
axes[0].set_ylabel("level (dB, 10 ms)")
axes[-1].legend(frameon=False, fontsize=6.5)
fig.savefig("results/fig_notes.png")
plt.close(fig)

# ---- 3. Soundboard: a region's frequency response, fitted per region or weighted from the shared fit
from fit_board import fit_many, synth
d = np.loadtxt("build/ref/board.txt")
base = np.fromfile("build/ref/board_ir.f64"); N = base.size // 2
reg = np.fromfile("build/ref/region_0.f64").reshape(-1, 2)[:, 0]
shared, region = fit_many(d, [base[:N], reg], 1e-6)
f, ph = d[:, 0], d[:, 6]
pos = (np.arange(4) + 0.5) / 4
shape = np.cos(2 * np.pi * (0.5 + f / 800.0)[:, None] * pos[None, :] + ph[:, None])
w = 1 + 0.5 * 0.25 * (shape - shape.mean(1, keepdims=True))
ang = np.pi / 4 * (1 + 0.7 * np.clip((f - 60) / 540, 0, 1)[:, None] * (2 * pos[None, :] - 1))
gl = np.sqrt(2) * np.cos(ang)
y_reg = synth(d, region, N)
y_w = synth(d, shared * w[:, 0] * gl[:, 0], N)
nf = 1 << 18
fr = np.fft.rfftfreq(nf, 1 / FS)
H = lambda y: 20 * np.log10(np.abs(np.fft.rfft(y, nf)) + 1e-12)
m = (fr > 200) & (fr < 700)
fig, ax = plt.subplots(figsize=(3.3, 2.0))
ax.plot(fr[m], H(reg)[m], "k-", label="Engine, region 0, left")
ax.plot(fr[m], H(y_reg)[m], ":", color="tab:blue", lw=1.4, label="fitted per region")
ax.plot(fr[m], H(y_w)[m], "-", color="tab:red", lw=0.6, alpha=0.8, label="shared fit, weighted per mode")
ax.set_xlabel("frequency (Hz)")
ax.set_ylabel("magnitude (dB)")
ax.legend(frameon=False, fontsize=6)
fig.savefig("results/fig_board.png")
plt.close(fig)

# ---- 4. Whole instrument against Engine (C4, dry)
if os.path.exists("build/one_0.npy"):
    ref = np.fromfile("build/ref/engine_60_dry.f64").reshape(-1, 2)
    y = np.load("build/one_0.npy")[: ref.shape[0]] / 0.0011
    fig, axes = plt.subplots(1, 2, figsize=(6.8, 1.9))
    for c, ax in enumerate(axes):
        t, e = envelope(ref[:, c])
        t2, e2 = envelope(y[:, c])
        ax.plot(t, e - e.max(), "k-", label="Engine")
        ax.plot(t2, e2 - e.max(), ":", color="tab:blue", lw=1.4, label="coopiano.lib")
        ax.set_title("C4, velocity 0.5, released at 1 s: %s channel" % "LR"[c])
        ax.set_xlabel("time (s)")
        ax.set_ylim(-100, 3)
    axes[0].set_ylabel("level (dB, 10 ms)")
    axes[1].legend(frameon=False, fontsize=6.5)
    fig.savefig("results/fig_engine.png")
    plt.close(fig)
print("figures written to results/")

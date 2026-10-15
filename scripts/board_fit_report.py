"""Quality of the soundboard fit (dsp/coopiano_tables.lib comes from the same
fit): time-domain error of the shared and the region responses, frequency
response error, and the error of the shortcut that weights the shared fit's
amplitudes per region instead of fitting each region."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from fit_board import fit_many, synth
FS = 44100
d = np.loadtxt("build/ref/board.txt")
base = np.fromfile("build/ref/board_ir.f64"); N = base.size // 2
regions = [np.fromfile("build/ref/region_%d.f64" % r).reshape(-1, 2) for r in range(4)]
targets = [base[:N], base[N:]] + [reg[:, c] for reg in regions for c in (0, 1)]
fits = fit_many(d, targets, 1e-6)
def err_db(y, t): return 10 * np.log10(np.sum((y - t) ** 2) / np.sum(t ** 2))
def fr_err(y, t):
    H = np.fft.rfft(y, 1 << 18); R = np.fft.rfft(t, 1 << 18); f = np.fft.rfftfreq(1 << 18, 1 / FS)
    m = (f > 50) & (f < 10000)
    e = np.abs(20 * np.log10(np.abs(H[m]) / np.abs(R[m])))
    return np.median(e), np.percentile(e, 90), np.percentile(e, 99)
print("modes %d, samples %d" % (d.shape[0], N))
names = ["shared L", "shared R"] + ["region %d %s" % (r, c) for r in range(4) for c in "LR"]
for name, A, t in zip(names, fits, targets):
    y = synth(d, A, t.size)
    med, p90, p99 = fr_err(y, t)
    print("%-11s time error %.1f dB | |H| error dB: median %.2f p90 %.2f p99 %.2f" % (name, err_db(y, t), med, p90, p99))
# the shortcut: the shared fit's amplitudes weighted per mode as make_soundboard_regions weights its modes
spread, depth, K = 0.7, 0.5, 4
pos = (np.arange(K) + 0.5) / K
f = d[:, 0]; ph = d[:, 6]
shape = np.cos(2 * np.pi * (0.5 + f / 800.0)[:, None] * pos[None, :] + ph[:, None])
w = 1 + depth * 0.25 * (shape - shape.mean(1, keepdims=True))
direc = np.clip((f - 60) / 540, 0, 1)
ang = np.pi / 4 * (1 + spread * direc[:, None] * (2 * pos[None, :] - 1))
for r in (0, 3):
    for c, g in ((0, np.sqrt(2) * np.cos(ang)), (1, np.sqrt(2) * np.sin(ang))):
        y = synth(d, fits[c] * w[:, r] * g[:, r], N)
        t = regions[r][:, c]
        med, p90, p99 = fr_err(y, t)
        print("weighted shared fit, region %d %s: time error %.1f dB | |H| error dB: median %.2f p90 %.2f p99 %.2f" % (r, "LR"[c], err_db(y, t), med, p90, p99))

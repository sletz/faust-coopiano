"""Independent check of the hammer discretisation on the C++ modes of one key
(build/ref/strings.txt): piano.hpp's run_contact (symplectic Euler, 32x) against
the scheme of coopiano.lib (first-order hold, implicit felt, one sample of lag
or none on the hysteresis rate)."""
import sys
import numpy as np
FS = 44100.0
keys = np.loadtxt("build/ref/keys.txt"); strs = np.loadtxt("build/ref/strings.txt")
def params(m):
    k = keys[keys[:, 0] == m][0]
    return dict(mh=k[10], K=k[11], p=k[12], ns=int(k[20]), T60=k[8])
def modes(m):
    s = strs[strs[:, 0] == m]
    return s[:, 1].astype(int), s[:, 3], s[:, 5], s[:, 6], s[:, 7]  # string, w, sig, g, sa
def cpp(m, v):
    P = params(m); st, w, sig, g, sa = modes(m)
    dt = 1 / (FS * 32); q = np.zeros_like(w); qd = np.zeros_like(w)
    yh, vh = 0.0, v; touched = sep = False; Fout = []
    for step in range(int(0.03 * FS * 32)):
        if sep and step % 32 == 0: break
        Ftot = 0; anyc = False; Fs = np.zeros_like(w)
        for s in range(P["ns"]):
            idx = st == s
            ys = np.sum(sa[idx] * q[idx]); d = yh - ys; F = 0
            if not sep and d > 0:
                anyc = True; yds = np.sum(sa[idx] * qd[idx])
                F = max(0.0, P["K"] * d ** P["p"] * (1 + 0.12 * (vh - yds)))
            Ftot += F; Fs[idx] = F
        qd += dt * (-w * w * q - 2 * sig * qd + g * Fs); q += dt * qd
        touched |= anyc
        if not sep and touched and not anyc and vh < 0: sep = True
        vh -= dt * Ftot / P["mh"]; yh += dt * vh
        if step % 32 == 0: Fout.append(Ftot)
    return np.array(Fout)
def faust(m, v, lag=True):
    P = params(m); st, w, sig, g, sa = modes(m); ns = P["ns"]; T = 1 / FS
    p = -sig + 1j * w; x = p * T
    phi1 = np.expm1(x) / x; phi2 = (phi1 - 1) / x
    b = -1j * g / ns / w  # equal force per string: F_total / ns on each
    G1 = b * T * phi2; G0 = b * T * (phi1 - phi2); lam = np.exp(x)
    ya = sa / ns; c = T * T / (6 * P["mh"]) + np.sum(ya * G1.real)
    z = np.zeros_like(w, complex); yh = 0.0; vh = v; u = 0.0; act = 1; tc = 0; Fo = []
    for n in range(int(0.03 * FS)):
        zf = lam * z + G0 * u
        ysf = np.sum(ya * zf.real); yd = np.sum(ya * (p * z).real)
        yfree = yh + T * vh - T * T * u / (3 * P["mh"]); a = yfree - ysf
        if lag:
            hyst = max(0, 1 + 0.12 * (vh - yd))
        else:  # rate at n, extrapolated from the free motion
            hyst = max(0, 1 + 0.12 * ((vh - T * u / (2 * P["mh"])) - np.sum(ya * (p * zf).real)))
        keff = P["K"] * ns * hyst * act
        F = 0.0
        if a > 0 and keff > 0:
            C = c * keff; d = min(a, (a / C) ** (1 / P["p"]))
            for _ in range(8):
                dp = d ** P["p"]; d = max(0.5 * d, d - (d + C * dp - a) / (1 + C * P["p"] * dp / d))
            F = keff * d ** P["p"]
        z = zf + G1 * F
        vh1 = vh - T * (u + F) / (2 * P["mh"]); yh = yfree - T * T * F / (6 * P["mh"]); vh = vh1
        tc = max(tc, F > 0); act = act * (1 - tc * (F == 0) * (vh < 0)); u = F; Fo.append(F)
    return np.array(Fo)
for m in [int(a) for a in sys.argv[1].split(",")]:
    k = keys[keys[:, 0] == m][0]
    for vel in [0.376, 1.0]:
        v = 6.0 * vel ** 1.8
        a, b, c = cpp(m, v), faust(m, v, True), faust(m, v, False)
        ns = params(m)["ns"]
        print("key %d vel %.3f  peak/string c++ %.3f  faust-lag %.3f (%+.1f%%)  faust-now %.3f (%+.1f%%)  contact samples %d %d %d" % (
            m, vel, a.max() / ns, b.max() / ns, 100 * (b.max() / a.max() - 1), c.max() / ns, 100 * (c.max() / a.max() - 1),
            np.count_nonzero(a), np.count_nonzero(b), np.count_nonzero(c)))

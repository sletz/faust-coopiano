import numpy as np, sys
d = np.loadtxt("build/ref/board.txt")
ir = np.fromfile("build/ref/board_ir.f64")
N = ir.size // 2; L, R = ir[:N], ir[N:]
FS = 44100.0
n = np.arange(N)
def synth(Acol):
    y = np.zeros(N)
    for f, s, ar, ai in zip(d[:,0], d[:,1], d[:,Acol], d[:,Acol+1]):
        lam = np.exp(-s/FS + 2j*np.pi*f/FS)
        y += np.imag((ar+1j*ai) * lam**n)
    return y
yL, yR = synth(2), synth(4)
for name, y, r in (("L", yL, L), ("R", yR, R)):
    err = np.sqrt(np.sum((y-r)**2)/np.sum(r**2))
    print(name, "rel err %.4f (%.1f dB)" % (err, 20*np.log10(err)), "energy ratio", np.sum(y**2)/np.sum(r**2))
    # spectral comparison in third octaves
    Y, Rr = np.abs(np.fft.rfft(y, 1<<18)), np.abs(np.fft.rfft(r, 1<<18))
    fr = np.fft.rfftfreq(1<<18, 1/FS)
    out = []
    for fc in [63,125,250,500,1000,2000,4000,8000,16000]:
        m = (fr > fc/2**(1/6)) & (fr < fc*2**(1/6))
        out.append("%d:%.2f" % (fc, 10*np.log10(np.sum(Y[m]**2)/np.sum(Rr[m]**2))))
    print("  band dB diff", " ".join(out))
    # error in early part
    k = int(0.005*FS)
    print("  first 5 ms rel err %.3f" % (np.sqrt(np.sum((y[:k]-r[:k])**2)/np.sum(r[:k]**2))))

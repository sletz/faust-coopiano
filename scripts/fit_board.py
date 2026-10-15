"""Least-squares fit of the soundboard's complex modal amplitudes.

The C++ board is a sum of decaying modes passed through a minimum-phase
equalizer that also removes three quarters of the narrow modal ripple, so the
equalizer is not smooth and a mode cannot simply take its gain. Keeping the
poles (frequency, decay) of the C++ modes, the amplitudes that best reproduce
make_soundboard_ir are found by linear least squares; the Gram matrix of
damped exponentials has a closed form, so no 68k x 1464 matrix is built.
"""
import numpy as np, sys

FS = 44100.0

def fit(modes, r, reg):
    return fit_many(modes, [r], reg)[0]

def fit_many(modes, targets, reg):
    """One Gram matrix, several targets of the same length."""
    f, s = modes[:, 0], modes[:, 1]
    r = targets[0]
    lam = np.exp(-s / FS + 2j * np.pi * f / FS)
    N = r.size
    def S(z):
        return (1 - z ** N) / (1 - z)
    X, Y = lam[:, None], lam[None, :]
    Sxy, Sxyb = S(X * Y), S(X * np.conj(Y))
    RR = 0.5 * np.real(Sxy + Sxyb)          # sum Re x^n Re y^n
    II = 0.5 * np.real(Sxyb - Sxy)          # sum Im x^n Im y^n
    RI = 0.5 * np.imag(Sxy + S(np.conj(X) * Y))  # sum Re x^n Im y^n
    K = len(f)
    G = np.zeros((2 * K, 2 * K))
    # basis: [Im(lam^n) (coefficient Ar), Re(lam^n) (coefficient Ai)]
    G[:K, :K] = II
    G[K:, K:] = RR
    G[K:, :K] = RI            # Re_k * Im_l
    G[:K, K:] = RI.T
    lam_reg = reg * np.trace(G) / (2 * K)
    cho = np.linalg.cholesky(G + lam_reg * np.eye(2 * K))
    out = []
    for r in targets:
        # right-hand side sum r[n] lam^n, chunked
        acc = np.zeros(K, complex)
        pw = np.ones(K, complex)
        C = 4096
        for start in range(0, N, C):
            seg = r[start:start + C]
            n = np.arange(seg.size)
            acc += np.einsum('kn,n->k', pw[:, None] * lam[:, None] ** n[None, :], seg)
            pw *= lam ** seg.size
        b = np.concatenate([np.imag(acc), np.real(acc)])
        x = np.linalg.solve(cho.T, np.linalg.solve(cho, b))
        out.append(x[:K] + 1j * x[K:])
    return out

def synth(modes, A, N):
    y = np.zeros(N)
    n = np.arange(N)
    for f, s, a in zip(modes[:, 0], modes[:, 1], A):
        y += np.imag(a * np.exp((-s / FS + 2j * np.pi * f / FS) * n))
    return y

if __name__ == "__main__":
    d = np.loadtxt("build/ref/board.txt")
    ir = np.fromfile("build/ref/board_ir.f64")
    N = ir.size // 2
    for reg in [float(a) for a in sys.argv[1:]] or [1e-6]:
        for name, r in (("L", ir[:N]), ("R", ir[N:])):
            A = fit(d, r, reg)
            y = synth(d, A, N)
            e = np.sqrt(np.sum((y - r) ** 2) / np.sum(r ** 2))
            print("reg %g %s rel err %.4f (%.1f dB) max|A| %.3g" % (reg, name, e, 20 * np.log10(e), np.max(np.abs(A))))

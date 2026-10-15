"""Compare the Faust instrument with coopiano's Engine (build/ref/engine_60_*.f64,
written by ref/dump.cpp): key 60, velocity 0.5, seed 1's draws, held 1 s.
The voice (dsp/coopiano_voice_out.dsp) is rendered to its five channels, which
then drive the body (dsp/coopiano_body.dsp), as the polyphonic architecture
compiles them; levels per channel in time windows and third-octave spectra."""
import os, subprocess, sys
import numpy as np
from scipy.io import wavfile
FAUSTPROBE = os.environ.get("FAUSTPROBE", os.path.join(os.path.dirname(__file__), "../../faust-rs/target/release/faustprobe"))
def probe(args):
    r = subprocess.run([FAUSTPROBE, "--double", "-I", "dsp", "--quiet"] + args, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)
draws = {int(r[0]): r[1:] for r in np.loadtxt("build/ref/draws.txt", ndmin=2)}[1]
n = 132096
probe(["-n", str(n), "--in", "zero", "--at", "0", "gate=1", "--at", "44032", "gate=0", "--set", "key=60", "--set", "velocity=0.5"]
      + sum((["--set", "draw%d=%.17g" % (i, draws[i])] for i in range(3)), [])
      + ["--out", "build/voice_out.npy", "dsp/coopiano_voice_out.dsp"])
wavfile.write("build/voice_out.wav", 44100, np.load("build/voice_out.npy"))
for mix, out in (("0", "build/one_0.npy"), ("0.3", "build/one_0.3.npy")):
    probe(["-n", str(n), "--in", "file:build/voice_out.wav", "--set", "mix=" + mix, "--out", out, "dsp/coopiano_body.dsp"])
FS = 44100
GAIN = 0.0011
def db(x): return 10 * np.log10(np.maximum(x, 1e-30))
def thirds(y, a, b):
    seg = y[int(a * FS):int(b * FS)] * np.hanning(int((b - a) * FS))
    S = np.abs(np.fft.rfft(seg, 1 << 18)) ** 2
    f = np.fft.rfftfreq(1 << 18, 1 / FS)
    c = 1000 * 2.0 ** (np.arange(-15, 13) / 3)
    return c, np.array([db(S[(f >= x / 2 ** (1 / 6)) & (f < x * 2 ** (1 / 6))].sum()) for x in c])
for name, ours in (("dry", "build/one_0.npy"), ("reverb", "build/one_0.3.npy")):
    ref = np.fromfile("build/ref/engine_60_%s.f64" % name).reshape(-1, 2)
    y = np.load(ours)[:ref.shape[0]] / GAIN
    n = min(len(y), len(ref)); ref, y = ref[:n], y[:n]
    print("== %s" % name)
    for ch in (0, 1):
        w = [(0, 0.05), (0.05, 0.3), (0.3, 1.0), (1.0, 1.3), (1.3, 2.0), (2.0, 2.99)]
        lv = [db(np.mean(y[int(a*FS):int(b*FS), ch]**2)) - db(np.mean(ref[int(a*FS):int(b*FS), ch]**2)) for a, b in w]
        c, a = thirds(y[:, ch], 0, 0.5); _, b = thirds(ref[:, ch], 0, 0.5)
        m = b > b.max() - 50
        print("  %s levels faust-C++ dB: %s | spectrum 0-0.5 s rms %.1f dB" % ("LR"[ch], " ".join("%+.1f" % x for x in lv), np.sqrt(np.mean((a - b)[m] ** 2))))
        print("    bands:", " ".join("%d:%+.1f" % (cc, d) for cc, d, mm in zip(c, a - b, m) if mm))
    print("  L/R correlation faust %.3f  C++ %.3f" % (np.corrcoef(y[:, 0], y[:, 1])[0, 1], np.corrcoef(ref[:, 0], ref[:, 1])[0, 1]))

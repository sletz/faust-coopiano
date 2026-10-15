"""Compare the Faust voice (dsp/coopiano_note.dsp) with render_bridge_force.

For every reference note written by ref/dump.cpp (build/ref/note_*.f64), the
same key, velocity and hold are rendered by faustprobe and compared on
measures that do not depend on the random draws of either model: level in
time windows, third-octave spectra early and late in the note, and the decay
of the level. Prints one table; exit 1 when a level differs by more than
--tol dB.
"""
import argparse, concurrent.futures, glob, os, re, subprocess, sys, tempfile
import numpy as np

FS = 44100
FAUSTPROBE = os.environ.get("FAUSTPROBE", os.path.join(os.path.dirname(__file__), "../../faust-rs/target/release/faustprobe"))

DRAWS = {int(r[0]): r[1:] for r in np.loadtxt("build/ref/draws.txt", ndmin=2)}

def render(midi, vel, hold, n, extra=(), seed=1):
    ns = 1 if midi < 31 else 2 if midi < 41 else 3
    extra = list(extra) + sum((["--set", "draw%d=%.6f" % (i, DRAWS[seed][i])] for i in range(ns)), [])
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "y.npy")
        cmd = [FAUSTPROBE, "--double", "-I", "dsp", "-n", str(n), "--in", "zero", "--quiet",
               "--at", "0", "gate=1", "--set", "key=%d" % midi, "--set", "velocity=%g" % vel,
               "--out", out, *extra]
        if int(hold * FS) < n:
            cmd += ["--at", str(int(hold * FS)), "gate=0"]
        r = subprocess.run(cmd + ["dsp/coopiano_note.dsp"], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
        return np.load(out)[:, 0]

def db(x):
    return 10 * np.log10(np.maximum(x, 1e-30))

def window_levels(y, edges, peak):
    # floor at -100 dB of the reference peak: piano.hpp culls its phasors at -90 dB
    return [db(max(np.mean(y[int(a * FS):int(b * FS)] ** 2), (1e-5 * peak) ** 2)) for a, b in edges]

def third_octaves(y, a, b):
    seg = y[int(a * FS):int(b * FS)]
    seg = seg * np.hanning(seg.size)
    S = np.abs(np.fft.rfft(seg, 1 << 18)) ** 2
    f = np.fft.rfftfreq(1 << 18, 1 / FS)
    centers = 1000 * 2.0 ** (np.arange(-15, 13) / 3)
    return centers, np.array([db(S[(f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))].sum()) for c in centers])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tol", type=float, default=3.0)
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=1)
    args = ap.parse_args()
    files = sorted(glob.glob("build/ref/note_*.f64"), key=lambda p: [float(x) for x in os.path.basename(p)[5:-4].split("_")])
    worst = 0
    edges = [(0, 0.05), (0.05, 0.3), (0.3, 1.0), (1.0, 2.0), (2.0, 3.0)]
    print("note  vel  hold | level dB faust-C++ in windows 0-50ms 50-300ms 0.3-1s 1-2s 2-3s | spectrum 0-0.3s / 1-2s: rms dB diff over bands")
    jobs = []
    for path in files:
        midi, vel, hold = [float(x) for x in os.path.basename(path)[5:-4].split("_")]
        if args.only and str(int(midi)) not in args.only.split(","):
            continue
        jobs.append((path, midi, vel, hold))
    # every render compiles the voice: run them side by side
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as ex:
        renders = list(ex.map(lambda j: render(int(j[1]), j[2], j[3], np.fromfile(j[0]).size), jobs))
    os.makedirs("build/notes", exist_ok=True)
    for (path, midi, vel, hold), y in zip(jobs, renders):
        np.save("build/notes/" + os.path.basename(path)[:-4] + ".npy", y)  # for scripts/figures.py
        ref = np.fromfile(path)
        dur = ref.size / FS
        e = [w for w in edges if w[1] <= dur + 1e-9]
        pk = np.abs(ref).max()
        lv = np.array(window_levels(y, e, pk)) - np.array(window_levels(ref, e, pk))
        c, sf0 = third_octaves(y, 0, 0.3)
        _, sr0 = third_octaves(ref, 0, 0.3)
        mask = sr0 > sr0.max() - 50
        s_early = np.sqrt(np.mean((sf0 - sr0)[mask] ** 2))
        s_late = float("nan")
        if dur >= 2 and hold >= 2:
            _, sf1 = third_octaves(y, 1, 2)
            _, sr1 = third_octaves(ref, 1, 2)
            mask1 = sr1 > sr1.max() - 50
            s_late = np.sqrt(np.mean((sf1 - sr1)[mask1] ** 2))
        worst = max(worst, np.max(np.abs(lv)))
        print("%3d  %.2f %.2f | %s | %5.1f / %5.1f" % (midi, vel, hold, " ".join("%+6.1f" % x for x in lv), s_early, s_late))
    print("worst window level difference %.1f dB (tolerance %.1f)" % (worst, args.tol))
    sys.exit(0 if worst <= args.tol else 1)

if __name__ == "__main__":
    main()

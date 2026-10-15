"""Hammer contact of the Faust voice against prep_note (build/ref/strike.txt):
duration of contact and peak force per string, over keys and velocities."""
import concurrent.futures, os, subprocess, sys, tempfile
import numpy as np
FS = 44100
FAUSTPROBE = os.environ.get("FAUSTPROBE", os.path.join(os.path.dirname(__file__), "../../faust-rs/target/release/faustprobe"))
ref = np.loadtxt("build/ref/strike.txt")
def ns(m): return 1 if m < 31 else 2 if m < 41 else 3
keys = [int(a) for a in sys.argv[1].split(",")] if len(sys.argv) > 1 else [21, 33, 45, 60, 72, 84, 96, 108]
vj = [0, 12, 18, 24]
def force(m, v):
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "f.npy")
        r = subprocess.run([FAUSTPROBE, "--double", "-I", "dsp", "-n", "2000", "--in", "zero", "--quiet",
                            "--at", "0", "gate=1", "--set", "key=%d" % m, "--set", "velocity=%.6f" % v,
                            "--out", out, "dsp/coopiano_hammer.dsp"], capture_output=True, text=True)
        if r.returncode: sys.exit(r.stderr)
        return np.load(out)[:, 0]
jobs = [(m, ref[(ref[:, 0] == m)][j]) for m in keys for j in vj]
# every render compiles the voice: run them side by side
with concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get("JOBS", "1"))) as ex:
    forces = list(ex.map(lambda jb: force(jb[0], jb[1][1]), jobs))
worst = 0.0
print("key   vel  | contact ms faust / c++     | peak N/string faust / c++")
for (m, row), F in zip(jobs, forces):
    v = row[1]
    nz = np.nonzero(F > 0)[0]
    ms = (nz[-1] + 1) / FS * 1000 if nz.size else 0
    dp = 100 * (F.max() / ns(m) / row[4] - 1)
    if not (m == 108 and v > 0.99):  # C8 fortissimo: an 11-sample contact, a known limit
        worst = max(worst, abs(dp))
    np.save("build/contact_%d_%.3f.npy" % (m, v), F)  # for scripts/figures.py
    print("%3d  %.3f |  %6.3f / %6.3f (%+5.1f%%) | %8.3f / %8.3f (%+5.1f%%)" % (
        m, v, ms, row[3], 100 * (ms / row[3] - 1), F.max() / ns(m), row[4], dp))
print("worst peak force difference %.1f %% (C8 fortissimo excluded; tolerance 3 %%)" % worst)
sys.exit(0 if worst <= 3.0 else 1)

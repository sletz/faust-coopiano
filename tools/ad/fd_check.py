"""fad tangents of tools/ad/voice_fad.dsp against central finite differences.

Renders one note (key, velocity, hold) with its tangents with respect to
stiffness_scale, felt_width_scale and decay_scale, then the same note with
each control moved by +-h (relative), and prints the relative error of the
tangent per time window. Run from the repository root.
"""
import os, subprocess, sys, tempfile
import numpy as np

FS = 44100
FAUSTPROBE = os.environ.get("FAUSTPROBE", "../faust-rs/target/release/faustprobe")
DRAWS = (-0.73224671197493452, -0.72718592726760556, -0.097570192310923676)
CONTROLS = [("stiffness_scale", 0.9), ("felt_width_scale", 1.4), ("decay_scale", 1.1)]
WINDOWS = [(0.0, 0.005), (0.005, 0.05), (0.05, 0.3), (0.3, 1.0), (1.0, 1.5)]


def render(dsp, key, vel, hold, n, sets=()):
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "y.npy")
        cmd = [FAUSTPROBE, "--double", "-I", "dsp", "-n", str(n), "--in", "zero", "--quiet",
               "--at", "0", "gate=1", "--set", "key=%d" % key, "--set", "velocity=%g" % vel,
               "--out", out]
        for i, r in enumerate(DRAWS):
            cmd += ["--set", "draw%d=%.6f" % (i, r)]
        for s in sets:
            cmd += ["--set", s]
        if int(hold * FS) < n:
            cmd += ["--at", str(int(hold * FS)), "gate=0"]
        r = subprocess.run(cmd + [dsp], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
        return np.load(out)


def main():
    key, vel, hold, dur = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
    rel_h = float(sys.argv[5]) if len(sys.argv) > 5 else 1e-4
    n = int(dur * FS)
    y = render("tools/ad/voice_fad.dsp", key, vel, hold, n)
    note = render("dsp/coopiano_note.dsp", key, vel, hold, n)[:, 0]
    print("primal: max |fad program - coopiano_note| = %.3g (peak %.3g)" % (np.max(np.abs(y[:, 0] - note)), np.max(np.abs(note))))
    for c, (name, p0) in enumerate(CONTROLS):
        h = rel_h * p0
        yp = render("dsp/coopiano_note.dsp", key, vel, hold, n, ["%s=%.12g" % (name, p0 + h)])[:, 0]
        ym = render("dsp/coopiano_note.dsp", key, vel, hold, n, ["%s=%.12g" % (name, p0 - h)])[:, 0]
        fd = (yp - ym) / (2 * h)
        t = y[:, 1 + c]
        cells = []
        for a, b in WINDOWS:
            s = slice(int(a * FS), int(b * FS))
            num = np.linalg.norm(t[s] - fd[s])
            den = max(np.linalg.norm(fd[s]), 1e-300)
            cells.append("%.1e" % (num / den))
        print("%-17s rel. error by window %s: %s   (|tangent| rms %.3g)" % (
            name, " ".join("%g-%g s" % w for w in WINDOWS), "  ".join(cells), np.sqrt(np.mean(t ** 2))))


if __name__ == "__main__":
    main()

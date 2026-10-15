"""fir-prepare-normalize time of N coefficients (functions of a note slider)
scaling N resonators: computed at block rate, in one ondemand domain clocked on
change (the note held as an audio-rate input), or in N/8 domains of 8."""
import os, re, subprocess, sys
FR = os.environ.get("FR", "../../faust-rs/target/release/faust-rs")
HEAD = r'''import("stdfaust.lib");
N = %d;
m = hslider("m", 60, 0, 127, 1);
chg = m != m';
c(x, k) = exp(-0.001 * x * (k + 1)) * cos(x * k * 0.01);
opaque(x) = max(x, -1.0e300);
gs = par(g, N / 32, (si.bus(32) :> _) : opaque) :> _;
bank = route(N + 1, 2 * N, par(i, N, (N + 1, 2 * i + 1), (i + 1, 2 * i + 2))) : par(k, N, (+ ~ *(0.99)) * _) : gs;
'''
VARIANTS = {
    "block rate": "process = (par(k, N, c(m, k)), _) : bank;\n",
    "one domain": "process = (((chg, ba.sAndH(chg, m)) : ondemand(\\(x).(par(k, N, c(x, k))))), _) : bank;\n",
    "domains of 8": "process = (par(g, N / 8, (chg, ba.sAndH(chg, m)) : ondemand(\\(x).(par(k, 8, c(x, 8 * g + k))))), _) : bank;\n",
}
def phase(path, name):
    r = subprocess.run([FR, "-time", "--timeout", "0", path, "-o", "/dev/null"], capture_output=True, text=True)
    m = re.search(r"end %s \(duration : ([0-9.]+)\)" % name, r.stdout + r.stderr)
    return float(m.group(1)) if m else (r.stdout + r.stderr)[-300:]
for n in [int(a) for a in sys.argv[1:]] or [64, 128, 256, 512]:
    out = []
    for name, proc in VARIANTS.items():
        p = "/tmp/r03_%s.dsp" % name.replace(" ", "_")
        open(p, "w").write(HEAD % n + proc)
        out.append("%s %s / %s" % (name, phase(p, "fir-prepare-normalize"), phase(p, "fir-clock-analysis")))
    print("N=%d  normalize / clock-analysis (s): %s" % (n, " | ".join(out)))

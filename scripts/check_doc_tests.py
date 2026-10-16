"""Compile every `#### Test` block of dsp/coopiano.lib with faustprobe -pn."""
import os, re, subprocess, sys, time
FP = os.environ.get("FAUSTPROBE", "../faust-rs/target/release/faustprobe")
src = open("dsp/coopiano.lib").read()
blocks = re.findall(r"// #### Test\n// ```\n((?:// .*\n)+?)// ```", src)
fails = 0
for b in blocks:
    code = "".join(l[3:] + "\n" for l in b.splitlines())
    name = re.search(r"^([A-Za-z_0-9]+_test)\s*=", code, re.M).group(1)
    path = "build/doctest_%s.dsp" % name
    open(path, "w").write(code + "process = %s;\n" % name)
    t0 = time.time()
    r = subprocess.run([FP, "--double", "-I", "dsp", "-n", "64", "--in", "zero", "--quiet", "-pn", name, path],
                       capture_output=True, text=True)
    ok = r.returncode == 0
    fails += not ok
    print("%-4s %-26s %5.1f s %s" % ("ok" if ok else "FAIL", name, time.time() - t0,
          "" if ok else r.stderr.strip().splitlines()[0][:150]), flush=True)
print("%d tests, %d failed" % (len(blocks), fails))
sys.exit(fails > 0)

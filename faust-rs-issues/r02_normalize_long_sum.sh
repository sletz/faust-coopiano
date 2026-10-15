#!/bin/sh
# fir-prepare-normalize time of N one-pole resonators summed by :> (one sum of N
# terms) or summed in groups of 32 behind an opaque max (N/32 sums of 32 terms).
FR=${FR:-../../faust-rs/target/release/faust-rs}
t() { $FR -time --timeout 0 $1 -o /dev/null 2>&1 | grep -E "end fir-prepare-normalize" | sed 's/.*: //; s/)//'; }
for N in 128 256 512 1024; do
  printf 'import("stdfaust.lib");\nN = %d;\nr(k) = + ~ *(0.5 + 0.4 * k / N);\nprocess = _ <: par(k, N, r(k)) :> _;\n' $N > /tmp/r02a.dsp
  printf 'import("stdfaust.lib");\nN = %d;\nr(k) = + ~ *(0.5 + 0.4 * k / N);\nopaque(x) = max(x, -1.0e300);\nprocess = _ <: par(k, N, r(k)) : par(g, N / 32, (si.bus(32) :> _) : opaque) :> _;\n' $N > /tmp/r02b.dsp
  echo "N=$N  normalize (s): one sum $(t /tmp/r02a.dsp)  grouped by 32 $(t /tmp/r02b.dsp)"
done

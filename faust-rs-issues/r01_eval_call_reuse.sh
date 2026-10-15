#!/bin/sh
# A chain of D functions where each level calls the level below twice with the
# same arguments: a DAG of D nodes, a tree of 2^D calls. With a call cache the
# evaluation is linear in D; without, exponential.
#   plain:      f_i(m) = f_{i-1}(m) + 0.5 * f_{i-1}(m)
#   with-local: f_i(m) = a + 0.5 * b with { a = f_{i-1}(m); b = f_{i-1}(m); }
#   compound:   f_i(m, k) = f_{i-1}(m, k + 1) + 0.5 * f_{i-1}(m, k + 1)   (k a constant)
#   lambda:     f_i(m) = f_{i-1}(m) : \(x).(x + 0.5 * f_{i-1}(m))
FR=${FR:-../../faust-rs/target/release/faust-rs}
gen() {  # $1 depth, $2 variant
  case $2 in
    plain)    echo 'f0(m) = m * 1.0001;'; i=1; while [ $i -le $1 ]; do echo "f$i(m) = f$((i-1))(m) + 0.5 * f$((i-1))(m);"; i=$((i+1)); done
              echo "process = f$1(hslider(\"m\", 1, 0, 2, 0.01));";;
    withlocal) echo 'f0(m) = m * 1.0001;'; i=1; while [ $i -le $1 ]; do echo "f$i(m) = a + 0.5 * b with { a = f$((i-1))(m); b = f$((i-1))(m); };"; i=$((i+1)); done
              echo "process = f$1(hslider(\"m\", 1, 0, 2, 0.01));";;
    compound) echo 'f0(m, k) = m * k;'; i=1; while [ $i -le $1 ]; do echo "f$i(m, k) = f$((i-1))(m, k + 1) + 0.5 * f$((i-1))(m, k + 1);"; i=$((i+1)); done
              echo "process = f$1(hslider(\"m\", 1, 0, 2, 0.01), 0);";;
    lambda)   echo 'f0(m) = m * 1.0001;'; i=1; while [ $i -le $1 ]; do echo "f$i(m) = f$((i-1))(m) : \\(x).(x + 0.5 * f$((i-1))(m));"; i=$((i+1)); done
              echo "process = f$1(hslider(\"m\", 1, 0, 2, 0.01));";;
  esac
}
t() { $FR -time --timeout 60 $1 -o /dev/null 2>&1 | grep -E "end evaluation|timeout" | sed 's/.*: //; s/)//'; }
for D in 8 10 12 14; do
  line="D=$D  evaluation (s):"
  for v in plain withlocal compound lambda; do gen $D $v > /tmp/r01_$v.dsp; line="$line  $v $(t /tmp/r01_$v.dsp)"; done
  echo "$line"
done

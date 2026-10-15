#!/bin/sh
# Peak memory of one compilation of the coopiano voice, its RSS over time, and
# three compilations at once (run from faust-coopiano/faust-rs-issues).
FR=${FR:-../../faust-rs/target/release/faust-rs}
FP=${FP:-../../faust-rs/target/release/faustprobe}
DSP=../dsp/coopiano_hammer.dsp
/usr/bin/time -l $FR -double --timeout 0 -I ../dsp $DSP -o /dev/null 2>&1 | grep -E "real|maximum resident"
($FR -double -time --timeout 0 -I ../dsp $DSP -o /dev/null > /tmp/r14_phases.txt 2>&1 &)
sleep 0.3; P=$(pgrep -n -f "faust-rs -double -time")
t=0; while kill -0 $P 2>/dev/null; do echo "t=${t}s rss=$(( $(ps -o rss= -p $P 2>/dev/null || echo 0) / 1024 )) MB"; sleep 3; t=$((t+3)); done
grep "end evaluation" /tmp/r14_phases.txt
for i in 1 2 3; do (/usr/bin/time -p $FP --double -I ../dsp -n 1 --in zero --quiet $DSP > /dev/null 2> /tmp/r14_conc_$i.txt) & done; wait
grep -h -E "^(real|user|sys)" /tmp/r14_conc_*.txt | paste - - -

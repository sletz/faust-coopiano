#!/bin/sh
# Native cost of the instrument: the full and the light body, the demo score with
# and without its pedal, the best of three runs (the machine's load varies).
set -e
grep -v pedal scores/demo.txt > build/demo_nopedal.txt
for v in full light; do
  make -s $( [ $v = light ] && echo LIGHT=1 ) build/$v/render > /dev/null
  for sc in scores/demo.txt build/demo_nopedal.txt; do
    best=""
    for i in 1 2 3; do
      line=$(build/$v/render $sc build/cost.wav 16 | grep "^cost:")
      body=$(echo "$line" | sed -E 's/.*body [0-9.]+ s \(([0-9.]+)%\).*/\1/')
      voice=$(echo "$line" | sed -E 's/.*; ([0-9.]+)% per sounding voice.*/\1/')
      if [ -z "$best" ] || [ $(echo "$body < $best" | bc) = 1 ]; then best=$body; bestv=$voice; fi
    done
    echo "$v $(basename $sc .txt): body $best % of a core, $bestv % per sounding voice"
  done
done

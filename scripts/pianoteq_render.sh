#!/bin/sh
# Render the comparison scores (scripts/pianoteq_midi.py) with coopiano and
# with Pianoteq, both dry, into build/pianoteq, and record how long each took.
#
#   coopiano: the C++ original (COOPIANO, default ../../coopiano), built here
#             as build/coopiano_cpp with its Makefile's flags and a 32-bit
#             float WAV writer (scripts/coopiano_float_wav.py); reverb off
#             (GP_NO_REVERB=1). Its WAV is peak-normalized per file.
#   Faust:    this repository's model, build/full/render (tools/render.cpp, the
#             voice and the body compiled to C++ by faust-rs: `make render`),
#             playing X.score, the same events as X.mid (velocity MIDI/127),
#             with `control 0 reverb/mix 0` for a dry body. Float WAV, not normalized.
#   Pianoteq: PIANOTEQ (default: Pianoteq 9 in /Applications), with the preset
#             PIANOTEQ_FXP: "NY Steinway D Classical" with its reverb, delay
#             and limiter switched off (scripts/pianoteq_preset.sh writes it).
#             32-bit float WAV, not normalized.
set -e
cd "$(dirname "$0")/.."
COOPIANO=${COOPIANO:-../../coopiano}
PIANOTEQ=${PIANOTEQ:-"/Applications/Pianoteq 9/Pianoteq 9.app/Contents/MacOS/Pianoteq 9"}
PIANOTEQ_FXP=${PIANOTEQ_FXP:-"$HOME/Library/Application Support/Modartt/Pianoteq/Presets/coopiano/coopiano compare dry.fxp"}
D=build/pianoteq

[ -f "$PIANOTEQ_FXP" ] || { echo "no preset $PIANOTEQ_FXP: run scripts/pianoteq_preset.sh" >&2; exit 1; }
# coopiano.cpp with a 32-bit float WAV writer (scripts/coopiano_float_wav.py).
python3 scripts/coopiano_float_wav.py "$COOPIANO" build/coopiano_float.cpp
c++ -O2 -std=c++17 -pthread -Wno-deprecated-declarations -I "$COOPIANO" build/coopiano_float.cpp -o build/coopiano_cpp \
    -framework CoreMIDI -framework AudioToolbox -framework CoreFoundation -framework CoreAudio
make -s build/full/render
python3 scripts/pianoteq_midi.py

GP_NO_REVERB=1 build/coopiano_cpp $D/keys.mid 1.0 $D/keys_coopiano.wav > $D/coopiano_keys.txt
for m in $D/decay/decay_*.mid; do
    "$PIANOTEQ" --headless --quiet --fxp "$PIANOTEQ_FXP" --midi $m --wav ${m%.mid}_pianoteq.wav \
        --rate 44100 --bit-depth 32 > /dev/null 2>&1
    GP_NO_REVERB=1 build/coopiano_cpp $m 1.0 ${m%.mid}_coopiano.wav > /dev/null
    build/full/render ${m%.mid}.score ${m%.mid}_faust.wav > /dev/null
done
: > $D/timing.txt
for s in chromatic notes pedal demo prelude; do
    t0=$(python3 -c 'import time; print(time.time())')
    "$PIANOTEQ" --headless --quiet --fxp "$PIANOTEQ_FXP" --midi $D/$s.mid --wav $D/${s}_pianoteq.wav \
        --rate 44100 --bit-depth 32 > /dev/null 2>&1
    t1=$(python3 -c 'import time; print(time.time())')
    GP_NO_REVERB=1 build/coopiano_cpp $D/$s.mid 1.0 $D/${s}_coopiano.wav > /dev/null
    t2=$(python3 -c 'import time; print(time.time())')
    build/full/render $D/$s.score $D/${s}_faust.wav > /dev/null
    t3=$(python3 -c 'import time; print(time.time())')
    echo "$s pianoteq $(python3 -c "print($t1 - $t0)") coopiano $(python3 -c "print($t2 - $t1)") faust $(python3 -c "print($t3 - $t2)")" | tee -a $D/timing.txt
done

# For listening: each instrument as it ships, with its own room (coopiano's
# reverb on, Pianoteq's preset untouched).
mkdir -p $D/listen
for s in demo prelude; do
    "$PIANOTEQ" --headless --quiet --preset "NY Steinway D Classical" --midi $D/$s.mid \
        --wav $D/listen/${s}_pianoteq_room.wav --rate 44100 --bit-depth 32 > /dev/null 2>&1
    build/coopiano_cpp $D/$s.mid 1.0 $D/listen/${s}_coopiano_room.wav > /dev/null
    grep -v '^control' $D/$s.score > $D/listen/$s.score
    build/full/render $D/listen/$s.score $D/listen/${s}_faust_room.wav > /dev/null
done

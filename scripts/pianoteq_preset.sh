#!/bin/sh
# Write the Pianoteq preset of the comparison: "NY Steinway D Classical" with
# its reverb, its delay (effect 1) and its output limiter switched off, saved
# as "coopiano compare dry" in the bank "coopiano". Its equalizers and its
# microphones are kept: they are part of the preset's sound. Uses Pianoteq's
# JSON-RPC server (--serve), which the trial version has too.
set -e
PIANOTEQ=${PIANOTEQ:-"/Applications/Pianoteq 9/Pianoteq 9.app/Contents/MacOS/Pianoteq 9"}
URL=http://127.0.0.1:8081/jsonrpc
rpc() { curl -s -m 20 -d "{\"method\":\"$1\",\"params\":${2:-[]},\"jsonrpc\":\"2.0\",\"id\":0}" $URL; echo; }

"$PIANOTEQ" --headless --no-audio-prefs --serve 127.0.0.1:8081 > /dev/null 2>&1 &
for i in $(seq 1 30); do rpc getInfo > /dev/null 2>&1 && break; sleep 1; done
rpc loadPreset '{"name":"NY Steinway D Classical"}'
rpc setParameters '{"list":[{"id":"reverb_switch","text":"Off"},{"id":"limiter_switch","text":"Off"},{"id":"effect_1_switch","text":"Off"}]}'
rpc savePreset '{"name":"coopiano compare dry","bank":"coopiano"}'
rpc quit

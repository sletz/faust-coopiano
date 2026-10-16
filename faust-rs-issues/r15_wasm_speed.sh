#!/bin/sh
# Point 14: cost of the faust-rs wasm of the voice and the bodies, in node.
# Builds web/dsp with faust-rs (-lang wasm -double), checks the output against
# faustprobe and prints the share of a core one second of audio costs.
set -e
cd "$(dirname "$0")/.."
make web-check

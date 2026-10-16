"""Copy coopiano.cpp with a WAV writer that writes 32-bit float.

coopiano's offline WAV is 16-bit, truncated without dither: a decaying tail
that reaches the last bits becomes a square-ish wave, with odd harmonics of
its fundamental (up to -34 dB on A6). The measurements against Pianoteq need
the instrument, not its writer, so scripts/pianoteq_render.sh builds this copy:
the same program, the same normalization to 0.89 of the peak, only the sample
format of write_wav_stereo changed (WAVE_FORMAT_IEEE_FLOAT).

usage: coopiano_float_wav.py COOPIANO_DIR OUT.cpp"""
import sys

src = open(sys.argv[1] + "/coopiano.cpp").read()
EDITS = [
    ("std::vector<int16_t> pcm(L.size() * 2);", "std::vector<float> pcm(L.size() * 2);"),
    ("pcm[2*i]   = (int16_t)(std::clamp(L[i] * scale, -1.0, 1.0) * 32767.0);", "pcm[2*i]   = (float)(L[i] * scale);"),
    ("pcm[2*i+1] = (int16_t)(std::clamp(R[i] * scale, -1.0, 1.0) * 32767.0);", "pcm[2*i+1] = (float)(R[i] * scale);"),
    ("uint32_t data_bytes = (uint32_t)(pcm.size() * 2);", "uint32_t data_bytes = (uint32_t)(pcm.size() * 4);"),
    ("br = piano::FS * 4;", "br = piano::FS * 8;"),
    ("uint16_t fmt = 1, ch = 2, ba = 4, bits = 16;", "uint16_t fmt = 3, ch = 2, ba = 8, bits = 32;"),
]
for old, new in EDITS:
    if src.count(old) != 1:
        sys.exit("coopiano.cpp: expected once: " + old)
    src = src.replace(old, new)
open(sys.argv[2], "w").write(src)

// Offline renderer of the Faust coopiano: N voices of dsp/coopiano.dsp and the
// body dsp/coopiano_body.dsp, both compiled to C++ by faust-rs (make render).
// Plays a score and writes a 32-bit float stereo WAV; prints the cost.
//
//   render SCORE OUT.wav [voices=16]
//
// SCORE lines: `note ONSET_S KEY VELOCITY DURATION_S` (velocity 0..1) or
// `pedal TIME_S POSITION` (0 up .. 1 down); `#` starts a comment.

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#define FAUSTFLOAT double

struct Meta {
    virtual ~Meta() {}
    virtual void declare(const char*, const char*) {}
};
struct UI {
    std::map<std::string, double*> zones;
    virtual ~UI() {}
    virtual void openTabBox(const char*) {}
    virtual void openHorizontalBox(const char*) {}
    virtual void openVerticalBox(const char*) {}
    virtual void closeBox() {}
    virtual void addButton(const char* l, double* z) { zones[l] = z; }
    virtual void addCheckButton(const char* l, double* z) { zones[l] = z; }
    virtual void addVerticalSlider(const char* l, double* z, double, double, double, double) { zones[l] = z; }
    virtual void addHorizontalSlider(const char* l, double* z, double, double, double, double) { zones[l] = z; }
    virtual void addNumEntry(const char* l, double* z, double, double, double, double) { zones[l] = z; }
    virtual void addHorizontalBargraph(const char*, double*, double, double) {}
    virtual void addVerticalBargraph(const char*, double*, double, double) {}
    virtual void addSoundfile(const char*, const char*, void**) {}
    virtual void declare(double*, const char*, const char*) {}
};
struct dsp {
    virtual ~dsp() {}
};

// Each generated file defines the same inline helpers: one namespace each
// (the standard headers they include are already in, so their guards hold).
#include <algorithm>
#include <cstddef>
#include <cstring>
#include <exception>
#include <new>
#include <math.h>
namespace gen_voice {
#include "coopiano_voice.cpp"
}
namespace gen_body {
#include "coopiano_body.cpp"
}
using gen_voice::coopiano_voice;
using gen_body::coopiano_body;

struct Event { int64_t frame; int kind; int key; double value; double duration; };  // kind 0 note, 1 pedal

static void write_wav(const std::string& path, const std::vector<float>& lr, int sr) {
    std::ofstream f(path, std::ios::binary);
    auto u32 = [&](uint32_t v) { f.write((const char*)&v, 4); };
    auto u16 = [&](uint16_t v) { f.write((const char*)&v, 2); };
    uint32_t bytes = (uint32_t)(lr.size() * 4);
    f.write("RIFF", 4); u32(36 + bytes); f.write("WAVE", 4);
    f.write("fmt ", 4); u32(16); u16(3); u16(2); u32(sr); u32(sr * 8); u16(8); u16(32);
    f.write("data", 4); u32(bytes);
    f.write((const char*)lr.data(), bytes);
}

int main(int argc, char** argv) {
    if (argc < 3) { std::fprintf(stderr, "usage: render SCORE OUT.wav [voices]\n"); return 1; }
    const int SR = 44100, B = 64;
    const int NV = argc > 3 ? std::atoi(argv[3]) : 16;
    std::vector<Event> events;
    std::ifstream score(argv[1]);
    std::string line;
    double end_s = 0;
    while (std::getline(score, line)) {
        line = line.substr(0, line.find('#'));
        std::istringstream in(line);
        std::string what;
        if (!(in >> what)) continue;
        if (what == "note") {
            double t, vel, dur; int key;
            in >> t >> key >> vel >> dur;
            events.push_back({(int64_t)std::llround(t * SR), 0, key, vel, dur});
            events.push_back({(int64_t)std::llround((t + dur) * SR), 2, key, 0, 0});
            end_s = std::max(end_s, t + dur);
        } else if (what == "pedal") {
            double t, pos;
            in >> t >> pos;
            events.push_back({(int64_t)std::llround(t * SR), 1, 0, pos, 0});
        }
    }
    std::stable_sort(events.begin(), events.end(), [](const Event& a, const Event& b) { return a.frame < b.frame; });
    const int64_t total = (int64_t)((end_s + 4.0) * SR);

    std::vector<coopiano_voice> voices(NV);
    std::vector<UI> vui(NV);
    std::vector<int> owner(NV, -1);
    std::vector<int64_t> since(NV, -1000000000);
    // A released voice whose output stays below this level for half a second
    // is no longer computed (as poly-dsp.h stops voices), until its next note.
    std::vector<int64_t> quiet(NV, 0);
    std::vector<bool> asleep(NV, true);
    const double stop_level = 1e-6;
    for (int v = 0; v < NV; ++v) { voices[v].init(SR); voices[v].buildUserInterface(&vui[v]); }
    coopiano_body body;
    UI bui;
    body.init(SR);
    body.buildUserInterface(&bui);

    std::vector<double> vout[5], mix[5], outL(B), outR(B);
    for (int c = 0; c < 5; ++c) { vout[c].assign(B, 0.0); mix[c].assign(B, 0.0); }
    std::vector<float> wav;
    wav.reserve(2 * total);
    size_t next = 0;
    double voice_s = 0, body_s = 0, voice_blocks = 0;
    for (int64_t pos = 0; pos < total;) {
        while (next < events.size() && events[next].frame <= pos) {
            const Event& e = events[next++];
            if (e.kind == 0) {
                int v = 0;  // the voice released the longest ago
                for (int i = 1; i < NV; ++i) if (since[i] < since[v]) v = i;
                *vui[v].zones["gate"] = 0;  // a released voice restrikes on the next block
                *vui[v].zones["freq"] = 440.0 * std::pow(2.0, (e.key - 69) / 12.0);
                *vui[v].zones["gain"] = e.value;
                owner[v] = e.key; since[v] = INT64_MAX; asleep[v] = false; quiet[v] = 0;
                double* in0[1] = {nullptr};
                double* o[5] = {vout[0].data(), vout[1].data(), vout[2].data(), vout[3].data(), vout[4].data()};
                voices[v].compute(1, in0, o);  // one sample with the gate down: the next one is a strike
                for (int c = 0; c < 5; ++c) mix[c][0] += vout[c][0];
                *vui[v].zones["gate"] = 1;
            } else if (e.kind == 2) {
                for (int v = 0; v < NV; ++v)
                    if (owner[v] == e.key && since[v] == INT64_MAX) { *vui[v].zones["gate"] = 0; since[v] = pos; owner[v] = -1; break; }
            } else {
                for (int v = 0; v < NV; ++v) *vui[v].zones["pedal"] = e.value;
                *bui.zones["pedal"] = e.value;
            }
        }
        int n = (int)std::min<int64_t>(B, total - pos);
        if (next < events.size()) n = (int)std::min<int64_t>(n, std::max<int64_t>(1, events[next].frame - pos));
        auto t0 = std::chrono::steady_clock::now();
        int active = 0;
        for (int v = 0; v < NV; ++v) {
            if (asleep[v]) continue;
            ++active;
            double* in0[1] = {nullptr};
            double* o[5] = {vout[0].data(), vout[1].data(), vout[2].data(), vout[3].data(), vout[4].data()};
            voices[v].compute(n, in0, o);
            double peak = 0;
            for (int c = 0; c < 5; ++c) for (int i = 0; i < n; ++i) { mix[c][i] += vout[c][i]; peak = std::max(peak, std::fabs(vout[c][i])); }
            if (since[v] != INT64_MAX && peak < stop_level) { quiet[v] += n; if (quiet[v] > SR / 2) asleep[v] = true; }
            else quiet[v] = 0;
        }
        voice_blocks += (double)active * n;
        auto t1 = std::chrono::steady_clock::now();
        double* bin[5] = {mix[0].data(), mix[1].data(), mix[2].data(), mix[3].data(), mix[4].data()};
        double* bo[2] = {outL.data(), outR.data()};
        body.compute(n, bin, bo);
        auto t2 = std::chrono::steady_clock::now();
        voice_s += std::chrono::duration<double>(t1 - t0).count();
        body_s += std::chrono::duration<double>(t2 - t1).count();
        for (int i = 0; i < n; ++i) { wav.push_back((float)outL[i]); wav.push_back((float)outR[i]); }
        for (int c = 0; c < 5; ++c) std::fill(mix[c].begin(), mix[c].end(), 0.0);
        pos += n;
    }
    write_wav(argv[2], wav, SR);
    double audio = (double)total / SR;
    float peak = 0;
    for (float s : wav) peak = std::max(peak, std::fabs(s));
    std::printf("%s: %.1f s of audio, %d voices, peak %.3f\n", argv[2], audio, NV, peak);
    std::printf("cost: voices %.3f s (%.1f%% of real time; %.2f%% per sounding voice, %.1f sounding on average), body %.3f s (%.1f%%)\n",
                voice_s, 100 * voice_s / audio, 100 * voice_s / (voice_blocks / SR), voice_blocks / total, body_s, 100 * body_s / audio);
    return 0;
}

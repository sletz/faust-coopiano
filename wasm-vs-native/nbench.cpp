#include <algorithm>
#include <cstdio>
#include <map>
#include <string>
#include <vector>
#define FAUSTFLOAT double

struct Meta {
    virtual ~Meta() {}
    virtual void declare(const char*, const char*) {}
};
// Controls by path without the program name ("gain", "action/pedal",
// "reverb/mix"), as the web page keys them: a label alone is ambiguous (the
// voice has both "gain", the velocity, and "resonance/gain").
struct UI {
    std::map<std::string, double*> zones;
    std::vector<std::string> boxes;
    virtual ~UI() {}
    std::string path(const char* l) const {
        std::string p;
        for (size_t i = 1; i < boxes.size(); ++i) p += boxes[i] + "/";
        return p + l;
    }
    virtual void openTabBox(const char* l) { boxes.push_back(l); }
    virtual void openHorizontalBox(const char* l) { boxes.push_back(l); }
    virtual void openVerticalBox(const char* l) { boxes.push_back(l); }
    virtual void closeBox() { boxes.pop_back(); }
    virtual void addButton(const char* l, double* z) { zones[path(l)] = z; }
    virtual void addCheckButton(const char* l, double* z) { zones[path(l)] = z; }
    virtual void addVerticalSlider(const char* l, double* z, double, double, double, double) { zones[path(l)] = z; }
    virtual void addHorizontalSlider(const char* l, double* z, double, double, double, double) { zones[path(l)] = z; }
    virtual void addNumEntry(const char* l, double* z, double, double, double, double) { zones[path(l)] = z; }
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
#include "voice.cpp"
}
namespace gen_body {
#include "body.cpp"
}
namespace gen_light {
#include "light.cpp"
}

// Same workload as faust-coopiano's scripts/web_check.mjs: 128-frame blocks at
// 44.1 kHz; the voice holds C4 (freq, gate = 1); a body gets 1e-3 on every
// input, pedal up or down. Two seconds of warm-up, then SECONDS measured.
//   nbench MODE SECONDS      MODE: voice body_up body_down light_up light_down
#include <chrono>
#include <cstdlib>
template <class D>
static double run(D& d, UI& ui, const std::string& mode, double seconds) {
    const int SR = 44100, B = 128;
    d.init(SR);
    d.buildUserInterface(&ui);
    if (mode == "voice") { *ui.zones.at("freq") = 261.6255653; *ui.zones.at("gate") = 1; }
    if (mode.size() > 5 && mode.substr(mode.size() - 5) == "_down") *ui.zones.at("action/pedal") = 1;
    const int ni = d.getNumInputs(), no = d.getNumOutputs();
    std::vector<std::vector<double>> in(ni, std::vector<double>(B, 1e-3)), out(no, std::vector<double>(B));
    std::vector<double*> ip(ni), op(no);
    for (int c = 0; c < ni; ++c) ip[c] = in[c].data();
    for (int c = 0; c < no; ++c) op[c] = out[c].data();
    const long warm = (long)(2.0 * SR / B), meas = (long)(seconds * SR / B);
    for (long b = 0; b < warm; ++b) d.compute(B, ip.data(), op.data());
    auto t0 = std::chrono::steady_clock::now();
    for (long b = 0; b < meas; ++b) d.compute(B, ip.data(), op.data());
    double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    volatile double sink = out[0][0]; (void)sink;
    return 100.0 * s / (meas * (double)B / SR);
}
int main(int argc, char** argv) {
    if (argc < 3) { std::fprintf(stderr, "usage: nbench MODE SECONDS\n"); return 1; }
    std::string mode = argv[1]; double seconds = std::atof(argv[2]);
    UI ui; double pct = 0;
    if (mode == "voice") { auto* d = new gen_voice::coopiano_voice(); pct = run(*d, ui, mode, seconds); }
    else if (mode.rfind("body", 0) == 0) { auto* d = new gen_body::coopiano_body(); pct = run(*d, ui, mode, seconds); }
    else { auto* d = new gen_light::coopiano_light(); pct = run(*d, ui, mode, seconds); }
    std::printf("%s %.2f\n", mode.c_str(), pct);
    return 0;
}

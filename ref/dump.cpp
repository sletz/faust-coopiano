// Reference extractor for faust-coopiano.
//
// Includes coopiano's own headers (piano.hpp, instrument.hpp) unchanged and
// writes, under the directory given as first argument:
//
//   admittance.txt   bridge admittance Re/Im per Hz, 0..12000 (BridgeAdmittance)
//   keys.txt         per key: KeyParams and the per-string tuning draws
//   strings.txt      per key/string/mode: w, wh, sig, g, s_a, w_br (prepare_key_strings)
//   strike.txt       per key and velocity: tone_peak_amp, contact ms, peak force
//   board.txt        soundboard modes: f, sigma, complex amplitudes L/R after the
//                    minimum-phase correction and normalisation, spatial phase
//   board_ir.f64     make_soundboard_ir output, L then R (raw float64)
//   note_*.f64       render_bridge_force of a few notes (raw float64, mono)
//   engine_*.f64     full instrument (Engine, reverb on/off), interleaved L/R
//
// The numbers come from the C++ model itself: the Faust model reads its
// fixed tables from here and the tests compare against the renders.

#include "instrument.hpp"

#include <cstdio>
#include <fstream>
#include <iomanip>
#include <string>

using namespace piano;
using namespace piano::detail;

static std::string dir;

static void write_f64(const std::string& name, const std::vector<double>& v) {
    std::ofstream f(dir + "/" + name, std::ios::binary);
    f.write(reinterpret_cast<const char*>(v.data()), (std::streamsize)(v.size() * sizeof(double)));
}

static void dump_admittance() {
    const auto& Y = BridgeAdmittance::get();
    std::ofstream f(dir + "/admittance.txt");
    f << std::setprecision(17);
    f << "# mean_re " << Y.mean_re << "\n";
    for (size_t i = 0; i < Y.re.size(); ++i) f << Y.re[i] << " " << Y.im[i] << "\n";
}

// Replicates the tuning draws of prepare_key_strings: the detune factor
// (0.8 + 0.4 u) of each string, drawn only when the key has a unison.
static void dump_keys() {
    std::ofstream f(dir + "/keys.txt"), s(dir + "/strings.txt");
    f << std::setprecision(17);
    s << std::setprecision(17);
    f << "# midi f0 L T mu m_s B alpha T60_1 c2 m_h K p fast_ratio det_scale f_long1 sigma_h"
         " fundamental_gain strike_level_gain low_mid_depth_db n_strings has_damper u0 u1 u2\n";
    s << "# midi string n w wh sig g s_a w_br\n";
    for (int midi = 21; midi <= 108; ++midi) {
        KeyParams k = make_key_params(midi);
        std::mt19937_64 tuning_rng{0x7069616e6fULL ^ (uint64_t)std::llround(k.f0 * 1048576.0)};
        std::uniform_real_distribution<double> u(-1.0, 1.0);
        double draws[3] = {0, 0, 0};
        if (k.n_strings > 1)
            for (int i = 0; i < k.n_strings; ++i) draws[i] = 0.8 + 0.4 * u(tuning_rng);
        f << midi << " " << k.f0 << " " << k.L << " " << k.T << " " << k.mu << " " << k.m_s << " "
          << k.B << " " << k.alpha << " " << k.T60_1 << " " << k.c2 << " " << k.m_h << " " << k.K
          << " " << k.p << " " << k.fast_ratio << " " << k.det_scale << " " << k.f_long1 << " "
          << k.sigma_h << " " << k.fundamental_gain << " " << k.strike_level_gain << " "
          << k.low_mid_depth_db << " " << k.n_strings << " " << (int)k.has_damper << " "
          << draws[0] << " " << draws[1] << " " << draws[2] << "\n";
        auto strings = prepare_key_strings(k);
        for (size_t i = 0; i < strings.size(); ++i)
            for (int n = 0; n < strings[i].n_modes; ++n)
                s << midi << " " << i << " " << n + 1 << " " << strings[i].w[n] << " "
                  << strings[i].wh[n] << " " << strings[i].sig[n] << " " << strings[i].g[n] << " "
                  << strings[i].s_a[n] << " " << strings[i].w_br[n] << "\n";
    }
}

// tone_peak_amp drives every action noise; it is only known after the contact
// solve, so the Faust model reads it from this grid (mean over four seeds).
static void dump_strikes() {
    std::ofstream f(dir + "/strike.txt");
    f << std::setprecision(17);
    f << "# midi velocity tone_peak contact_ms peak_force coff peak_amp\n";
    const int NV = 25;
    for (int midi = 21; midi <= 108; ++midi) {
        Key key = make_key(midi);
        for (int j = 0; j < NV; ++j) {
            double v = 0.02 * std::pow(50.0, (double)j / (NV - 1));
            double tp = 0, ms = 0, pf = 0, coff = 0, pa = 0;
            for (uint64_t seed = 1; seed <= 4; ++seed) {
                auto note = prep_note(key.parameters(), v, seed, Options{}, NoPreparationTrace{},
                                      &KeyAccess::strings(key));
                tp += note.tone_peak_amp / 4; ms += note.dbg.contact_ms / 4;
                pf += note.dbg.peak_force / 4; coff += note.coff / 4.0; pa += note.peak_amp / 4;
            }
            f << midi << " " << v << " " << tp << " " << ms << " " << pf << " " << coff << " " << pa << "\n";
        }
    }
}

// Same draws as make_soundboard_ir / make_soundboard_regions (seed of the
// instrument), with the correction evaluated at each mode frequency: a mode
// filtered by the smooth minimum-phase equalizer keeps its pole and takes the
// equalizer's complex gain at its frequency.
static void dump_board() {
    const uint64_t seed = 0xb0a4d5eedULL;
    const SoundboardVoicing board{};
    const double dur = 1.4 * board.decay_scale;
    const int N = (int)(dur * FS);
    std::mt19937_64 rng{seed}, spatial{seed ^ 0x9e3779b97f4a7c15ULL};
    std::uniform_real_distribution<double> u01(0.0, 1.0), um(-1.0, 1.0);
    struct Mode { double f, sig, phase; std::complex<double> zL, zR; };
    std::vector<Mode> modes;
    std::vector<double> baseL(N, 0.0), baseR(N, 0.0);
    double f = 48.0;
    while (f < 16500.0) {
        double T60 = 0.04 + 0.30 * std::pow(100.0 / f, 0.7);
        T60 = std::min(T60, 0.45) * board.decay_scale;
        double sig = std::log(1000.0) / T60;
        double amp = board_radiation(f, board) * std::pow(10.0, um(rng) * 3.0 / 20.0);
        double phL = u01(rng) * 2 * PI;
        double coher = std::clamp(f / 700.0, 0.0, 1.0);
        double phR = phL + coher * um(rng) * PI;
        double ampR = amp * std::pow(10.0, coher * um(rng) * 3.0 / 20.0);
        std::complex<double> zL = amp * std::exp(std::complex<double>(0, phL));
        std::complex<double> zR = ampR * std::exp(std::complex<double>(0, phR));
        std::complex<double> st = std::exp(std::complex<double>(-sig / FS, 2 * PI * f / FS));
        int len = std::min(N, (int)(T60 * 1.15 * FS));
        modes.push_back({f, sig, u01(spatial) * 2 * PI, zL, zR});
        for (int i = 0; i < len; ++i) {
            baseL[i] += zL.imag(); baseR[i] += zR.imag();
            zL *= st; zR *= st;
        }
        f += board_mode_spacing(f, board.low_mode_density) * (0.75 + 0.5 * u01(rng));
    }
    auto cL = ir_correction(baseL, board), cR = ir_correction(baseR, board);
    apply_ir_correction(baseL, cL); apply_ir_correction(baseR, cR);
    double e = 0.0;
    for (int i = 0; i < N; ++i) e += baseL[i] * baseL[i] + baseR[i] * baseR[i];
    double s = 1.0 / std::sqrt(e / 2.0);
    auto at = [](const std::vector<std::complex<double>>& c, double hz) {
        double x = hz * c.size() / FS;
        size_t i = (size_t)x;
        double t = x - i;
        return c[i] * (1.0 - t) + c[i + 1] * t;
    };
    std::ofstream out(dir + "/board.txt");
    out << std::setprecision(17);
    out << "# f sigma ALre ALim ARre ARim spatial_phase   (output = Im(A * lambda^n))\n";
    for (const auto& m : modes) {
        auto AL = m.zL * at(cL, m.f) * s, AR = m.zR * at(cR, m.f) * s;
        out << m.f << " " << m.sig << " " << AL.real() << " " << AL.imag() << " " << AR.real()
            << " " << AR.imag() << " " << m.phase << "\n";
    }
    std::vector<double> irL, irR;
    piano::make_soundboard_ir(irL, irR, seed, Voicing{});
    std::vector<double> both(irL);
    both.insert(both.end(), irR.begin(), irR.end());
    write_f64("board_ir.f64", both);
}

// The first draws of a strike's generator: prep_note_into spends one per
// string on the unison readout spread, in string order.
static void dump_draws() {
    std::ofstream f(dir + "/draws.txt");
    f << std::setprecision(17);
    for (uint64_t seed = 1; seed <= 4; ++seed) {
        std::mt19937_64 rng{seed};
        std::uniform_real_distribution<double> u(-1.0, 1.0);
        f << seed;
        for (int i = 0; i < 3; ++i) f << " " << u(rng);
        f << "\n";
    }
}

// Response of the regions' board to an impulse in region r: its head plus
// the shared tail (Engine drives the tail with the summed force).
static void dump_regions() {
    std::vector<std::vector<double>> left, right;
    std::vector<double> tl, tr;
    piano::make_soundboard_regions(left, right, 0xb0a4d5eedULL, Voicing{}, &tl, &tr);
    for (size_t r = 0; r < left.size(); ++r) {
        std::vector<double> out;
        for (size_t i = 0; i < tl.size(); ++i) {
            out.push_back((i < left[r].size() ? left[r][i] : 0.0) + tl[i]);
            out.push_back((i < right[r].size() ? right[r][i] : 0.0) + tr[i]);
        }
        write_f64("region_" + std::to_string(r) + ".f64", out);
    }
}

// The bridge force of key 60 (velocity 0.5, seed 1) after the sympathetic
// bank, held for 1 s then released, pedal up: the input of the soundboard.
static void dump_resonance() {
    Key key = make_key(60);
    const size_t n = (size_t)(3.0 * FS), hold = 44032;
    std::vector<double> own(n, 0.0);
    render_bridge_force(key, 0.5, (int64_t)hold, own, 0, 1);
    SympatheticResonance bank{Voicing{}};
    bank.set_key_held(60, true);
    std::vector<double> force = own, rows(88 * n, 0.0);
    for (size_t i = 0; i < n; ++i) rows[(60 - 21) * n + i] = own[i];
    // the bank is processed in two spans so the key is released at `hold`
    bank.process({force.data(), hold}, {rows.data(), rows.size()}, n);
    bank.set_key_held(60, false);
    bank.process({force.data() + hold, n - hold}, {rows.data() + hold, rows.size() - hold}, n);
    write_f64("resonance_60.f64", force);
    write_f64("force_60.f64", own);
}

static void dump_notes() {
    struct N { int midi; double vel, hold, dur; };
    // A0 and C1 fortissimo: single strings whose phantom pairs reach their bound.
    const N notes[] = {{21, 0.5, 4, 4}, {21, 1.0, 2, 2}, {24, 1.0, 2, 2}, {33, 0.5, 4, 4}, {45, 0.5, 4, 4}, {48, 0.8, 3, 3},
                       {60, 0.2, 3, 3}, {60, 0.5, 3, 3}, {60, 1.0, 3, 3}, {69, 0.5, 3, 3},
                       {69, 0.5, 0.5, 2}, {84, 0.5, 2, 2}, {96, 0.5, 2, 2}, {108, 0.5, 1, 1}};
    for (const auto& n : notes) {
        Key key = make_key(n.midi);
        std::vector<double> buf((size_t)(n.dur * FS), 0.0);
        render_bridge_force(key, n.vel, (int64_t)(n.hold * FS), buf, 0, 1);
        char name[64];
        std::snprintf(name, sizeof name, "note_%d_%.2f_%.2f.f64", n.midi, n.vel, n.hold);
        write_f64(name, buf);
    }
}

// Every key of the keyboard, A0 to C8, at one velocity and held 2 s: the
// full-range check of the voice (make keyboard).
static void dump_keyboard() {
    const double vel = 0.5, hold = 2.0, dur = 2.0;
    for (int midi = 21; midi <= 108; ++midi) {
        Key key = make_key(midi);
        std::vector<double> buf((size_t)(dur * FS), 0.0);
        render_bridge_force(key, vel, (int64_t)(hold * FS), buf, 0, 1);
        char name[64];
        std::snprintf(name, sizeof name, "note_%d_%.2f_%.2f.f64", midi, vel, hold);
        write_f64(name, buf);
    }
}

// The whole instrument through its block interface, one note held then
// released. Output before the engine's output gain and limiter is not
// exposed, so this is the float output divided by the gain.
static void dump_engine(bool reverb) {
    instrument::Settings settings;
    if (!reverb) settings.reverb.mix = 0.0;
    instrument::Engine engine(settings);
    const int midi = 60;
    const double vel = 0.5, hold = 1.0, dur = 3.0;
    auto strike = engine.prepare(midi, vel, 1);
    engine.start(strike);
    const int blocks = (int)(dur * FS / BLOCK_SIZE);
    std::vector<double> out;
    float L[BLOCK_SIZE], R[BLOCK_SIZE];
    for (int b = 0; b < blocks; ++b) {
        if (b == (int)(hold * FS / BLOCK_SIZE)) engine.note_off(midi);
        engine.render_block(L, R);
        for (int i = 0; i < BLOCK_SIZE; ++i) { out.push_back(L[i] / settings.gain); out.push_back(R[i] / settings.gain); }
    }
    write_f64(reverb ? "engine_60_reverb.f64" : "engine_60_dry.f64", out);
}

int main(int argc, char** argv) {
    if (argc < 2) { std::fprintf(stderr, "usage: dump OUTDIR [all|tables|notes|engine|keys]\n"); return 1; }
    dir = argv[1];
    std::string what = argc > 2 ? argv[2] : "all";
    if (what == "all" || what == "tables") { dump_admittance(); dump_keys(); dump_board(); dump_strikes(); }
    if (what == "all" || what == "regions") dump_regions();
    if (what == "all" || what == "resonance") dump_resonance();
    if (what == "all" || what == "notes") { dump_draws(); dump_notes(); }
    if (what == "all" || what == "engine") { dump_engine(false); dump_engine(true); }
    if (what == "keys") { dump_draws(); dump_keyboard(); }  // not in "all": 88 renders
    return 0;
}

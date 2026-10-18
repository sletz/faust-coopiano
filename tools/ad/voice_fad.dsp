// The bridge force of one voice (dsp/coopiano_note.dsp) and its forward-mode
// tangents with respect to three voicing controls: felt stiffness, felt width,
// late decay. Outputs: force, d/d stiffness_scale, d/d felt_width_scale,
// d/d decay_scale. Feasibility study, see tools/ad/README.md.
// sqrt(x) has an infinite slope at 0, so its tangent is 0 * inf = NaN where a
// mode's amplitude is exactly 0 (at rest, first sample of a strike): the two
// amplitude helpers take sqrt(max(x, 1e-300)) here (a 1e-150 change of value);
// the definitions of the modification are evaluated in this file's scope.
safe_sqrt(x) = sqrt(max(x, 1.0e-300));
bound_factor = library("coopiano.lib")._bound_factor;
cp = library("coopiano.lib")[
    _slot_mags = \(vr, vi, hr, hi, rd).(abs(rd) * safe_sqrt(vr * vr + vi * vi),
                                       abs(rd) * safe_sqrt(hr * hr + hi * hi));
    _pair_gains = \(avk, avj, ahk, ahj, kb).(bound_factor(kb * safe_sqrt(avk * avj)),
                                             bound_factor(kb * safe_sqrt(ahk * ahj)));
];
key = hslider("key", 40, 21, 108, 1);
velocity = hslider("velocity", 1, 0.02, 1, 0.001);
gate = button("gate");
d0 = hslider("draw0", 0, -1, 1, 0.001);
d1 = hslider("draw1", 0, -1, 1, 0.001);
d2 = hslider("draw2", 0, -1, 1, 0.001);
force = cp.voice_drawn(key, velocity, gate, d0, d1, d2) : !, _;
process = fad(force, (cp._h_stiffness, cp._h_width, cp._s_decay));

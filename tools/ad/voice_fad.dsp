// The bridge force of one voice (dsp/coopiano_note.dsp) and its forward-mode
// tangents with respect to three voicing controls: felt stiffness, felt width,
// late decay. Outputs: force, d/d stiffness_scale, d/d felt_width_scale,
// d/d decay_scale. Feasibility study, see tools/ad/README.md.
cp = library("coopiano.lib");
key = hslider("key", 40, 21, 108, 1);
velocity = hslider("velocity", 1, 0.02, 1, 0.001);
gate = button("gate");
d0 = hslider("draw0", 0, -1, 1, 0.001);
d1 = hslider("draw1", 0, -1, 1, 0.001);
d2 = hslider("draw2", 0, -1, 1, 0.001);
force = cp.voice_drawn(key, velocity, gate, d0, d1, d2) : !, _;
process = fad(force, (cp._h_stiffness, cp._h_width, cp._s_decay));

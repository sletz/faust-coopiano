// One coopiano key, its bridge force alone (render_bridge_force units):
// the program the tests compare with the C++ renders.
declare name "coopiano_note";
cp = library("coopiano.lib");

key = hslider("key", 60, 21, 108, 1);
velocity = hslider("velocity", 0.5, 0.02, 1, 0.001);
gate = button("gate");
// The strike's draws of the unison readout spread (piano.hpp draws them from its seed).
d0 = hslider("draw0", 0, -1, 1, 0.001);
d1 = hslider("draw1", 0, -1, 1, 0.001);
d2 = hslider("draw2", 0, -1, 1, 0.001);

process = cp.voice_drawn(key, velocity, gate, d0, d1, d2) : !, _;

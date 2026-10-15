// The hammer force of one coopiano key (newtons, all strings together):
// for the contact checks against prep_note's diagnostics.
declare name "coopiano_hammer";
cp = library("coopiano.lib");

key = hslider("key", 60, 21, 108, 1);
velocity = hslider("velocity", 0.5, 0.02, 1, 0.001);
gate = button("gate");
// The strike's draws of the unison readout spread (piano.hpp draws them from its seed).
d0 = hslider("draw0", 0, -1, 1, 0.001);
d1 = hslider("draw1", 0, -1, 1, 0.001);
d2 = hslider("draw2", 0, -1, 1, 0.001);

process = cp.voice_drawn(key, velocity, gate, d0, d1, d2) : _, !;

// One coopiano key as the instrument's voice hands it to the body: the
// bridge force split over the soundboard regions, then the sympathetic
// correction of its own key; the strike's draws are given.
declare name "coopiano_voice_out";
cp = library("coopiano.lib");

key = hslider("key", 60, 21, 108, 1);
velocity = hslider("velocity", 0.5, 0.02, 1, 0.001);
gate = button("gate");
d0 = hslider("draw0", 0, -1, 1, 0.001);
d1 = hslider("draw1", 0, -1, 1, 0.001);
d2 = hslider("draw2", 0, -1, 1, 0.001);

process = cp.voice_out_drawn(key, velocity, gate, d0, d1, d2);

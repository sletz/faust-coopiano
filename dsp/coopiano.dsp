// coopiano in Faust: the polyphonic instrument (faust-rs).
// Voices: freq/gain/gate (gain is the normalised MIDI velocity), each giving
// its bridge force split over the soundboard regions; the effect is the body
// of the instrument (sympathetic strings, soundboard, room, output stage).
declare name "coopiano";
declare options "[midi:on][nvoices:16]";
cp = library("coopiano.lib");

freq = hslider("freq", 261.6255653, 27.5, 4186.01, 0.001);
gain = hslider("gain", 0.5, 0.02, 1, 0.001);
gate = button("gate");

process = cp.voice_out(cp.freq2m(freq), gain, gate);
effect = cp.body;

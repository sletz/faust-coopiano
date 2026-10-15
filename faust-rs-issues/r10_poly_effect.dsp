declare options "[nvoices:2]";
// Control for r10b: an effect that keeps the channel count is applied.
freq = hslider("freq", 440, 20, 2000, 1);
gain = hslider("gain", 0.5, 0, 1, 0.01);
gate = button("gate");
process = gate * gain;
effect = *(2.0);

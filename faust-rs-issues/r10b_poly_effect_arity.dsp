declare options "[nvoices:2]";
freq = hslider("freq", 440, 20, 2000, 1);
gain = hslider("gain", 0.5, 0, 1, 0.01);
gate = button("gate");
process = gate * gain <: _, _;
effect = + : *(2.0);

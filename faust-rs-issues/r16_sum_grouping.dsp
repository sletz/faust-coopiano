// Point 15: a sum of a constant, a control and a signal. Faust C++ 2.90.8
// groups the constant with the control and hoists `1 - c` to block rate:
//   fRec0[0] = fRec0[1] + max(-fSlow0, min(fSlow0, fSlow1 - fRec0[1]));
// faust-rs groups the constant with the signal:
//   fRecCur0 = fRec0 + fmax(fSlow2, fmin(fSlow1, (1.0 - fRec0) - fSlow0));
// With c = 1 the C++ recursion reaches 0 exactly; the faust-rs one stops at
// the rounding error of `1 - o`: 1.1e-17 with --double, 1.1e-8 in single.
//   FP --double -n 88200 --in zero --set contact=0 --at 44100 contact=1 --every 22050 r16_sum_grouping.dsp
import("stdfaust.lib");
st = 1.0 / (hslider("t", 0.04, 0.001, 0.2, 0.001) * ma.SR);
c = hslider("contact", 1, 0, 1, 0.01);
process = (\(o).(o + max(-st, min(st, 1.0 - c - o)))) ~ _;

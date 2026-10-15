import("stdfaust.lib");
sq(x) = (x - 1.0) * (x + 1.0) + 1.0;
process = _ <: par(i, 256, (+(i * 1e-3) : sq)) :> _;

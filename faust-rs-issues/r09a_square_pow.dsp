import("stdfaust.lib");
process = _ <: par(i, 256, (+(i * 1e-3) <: *)) :> _;

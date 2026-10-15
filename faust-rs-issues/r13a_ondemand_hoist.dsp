import("stdfaust.lib");
m = hslider("m", 60, 0, 127, 1);
heavy(x) = sum(i, 16, exp(-0.001 * x * i) * cos(0.01 * x * i));
process = (m != m', m) : ondemand(heavy) : *(no.noise);

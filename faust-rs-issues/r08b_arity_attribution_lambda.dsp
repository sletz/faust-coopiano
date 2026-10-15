import("stdfaust.lib");
unrelated = (1, 2, 3) : si.block(1), _, _;
m(x) = (\(a, b).(a + x, b)) ~ (_, _);
bad = m(1) : \(a, b).(a), m(2) : \(a, b).(b);
process = unrelated, bad;

import("stdfaust.lib");
unrelated = (1, 2, 3) : !, _, _;
pair = (1, 2);
bad = pair : +, pair : +;
process = unrelated, bad;

// Bisection helper: the voice parameters (cp._voice_params_on) and their
// tangents with respect to the three voicing controls of voice_fad.dsp.
cp = library("coopiano.lib");
key = hslider("key", 40, 21, 108, 1);
chg = (key != key') | (cp._voicing_hash != cp._voicing_hash');
process = fad(cp._voice_params_on(chg, key), (cp._h_stiffness, cp._h_width, cp._s_decay));

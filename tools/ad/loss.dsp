// The loss of tools/ad/train_fad.dsp without its tangents, for grid searches
// (faustprobe --sweep ... --reduce dc gives the mean loss of each point).
ad = library("ad.lib");
process(t) = ad.loss(ad.force, t);

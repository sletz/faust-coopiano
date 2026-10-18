// Host-driven training of three voicing controls: input = target bridge force,
// outputs = per-sample loss, then its tangents with respect to stiffness_scale,
// felt_width_scale, decay_scale (faustprobe --train, loss lane 0, grad lane 1).
ad = library("ad.lib");
process(t) = fad(ad.loss(ad.force, t), ad.seeds);

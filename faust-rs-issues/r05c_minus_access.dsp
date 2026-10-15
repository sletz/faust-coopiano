L = library("r05_lib.lib");
z(k, u) = u + exp(-L.g(2, k));
process(u) = z(1, u);

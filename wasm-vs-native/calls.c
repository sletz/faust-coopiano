// ns per libm call, net of the loop: the same loops as calls.wat.
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + 1e-9 * t.tv_nsec; }
#define LOOP(NAME, EXPR) static double NAME(int n, double x) { double s = 0; for (int i = 0; i < n; ++i) { double a = x + i * 1e-7; s += EXPR; } return s; }
LOOP(l0, a) LOOP(lexp, exp(a)) LOOP(lsin, sin(a)) LOOP(ltanh, tanh(a)) LOOP(lpow, pow(a, 2.5))
static double best(double (*f)(int, double), int n, double x) { double b = 1e9; volatile double sink; for (int r = 0; r < 5; ++r) { double t = now(); sink = f(n, x); t = now() - t; if (t < b) b = t; } return b * 1e9 / n; }
int main(int argc, char** argv) {
    int n = argc > 1 ? atoi(argv[1]) : 10000000; double x = argc > 2 ? atof(argv[2]) : 0.3;
    double base = best(l0, n, x);
    printf("native exp: %.2f ns per call\n", best(lexp, n, x) - base);
    printf("native sin: %.2f ns per call\n", best(lsin, n, x) - base);
    printf("native tanh: %.2f ns per call\n", best(ltanh, n, x) - base);
    printf("native pow: %.2f ns per call\n", best(lpow, n, 1.3) - base);
    return 0;
}

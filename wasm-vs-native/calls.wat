;; Cost of a math call from wasm: n calls with independent arguments x + i*1e-7,
;; their results summed (loop1/loop2), against the same loop without the call (loop0).
(module
  (import "env" "f1" (func $f1 (param f64) (result f64)))
  (import "env" "f2" (func $f2 (param f64 f64) (result f64)))
  (func (export "loop0") (param $n i32) (param $x f64) (result f64)
    (local $i i32) (local $s f64)
    (block $done (loop $l
      (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
      (local.set $s (f64.add (local.get $s) (f64.add (local.get $x) (f64.mul (f64.convert_i32_s (local.get $i)) (f64.const 1e-7)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $s))
  (func (export "loop1") (param $n i32) (param $x f64) (result f64)
    (local $i i32) (local $s f64)
    (block $done (loop $l
      (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
      (local.set $s (f64.add (local.get $s) (call $f1 (f64.add (local.get $x) (f64.mul (f64.convert_i32_s (local.get $i)) (f64.const 1e-7))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $s))
  (func (export "loop2") (param $n i32) (param $x f64) (result f64)
    (local $i i32) (local $s f64)
    (block $done (loop $l
      (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
      (local.set $s (f64.add (local.get $s) (call $f2 (f64.add (local.get $x) (f64.mul (f64.convert_i32_s (local.get $i)) (f64.const 1e-7))) (f64.const 2.5))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $s)))

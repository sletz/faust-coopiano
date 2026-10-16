// One Faust DSP compiled by `faust-rs -lang wasm`: the module and its JSON
// companion, instantiated with its own memory. Used by the AudioWorklet
// (coopiano-processor.js) and by scripts/web_check.mjs under node.
//
// The contract is the one of Faust's C++ wasm backend, kept by faust-rs
// (crates/codegen/src/backends/wasm): the DSP structure at address 0, the
// JSON `ui[*].index` byte offsets read and written by `getParamValue` /
// `setParamValue`, the audio heap from JSON `size` on, the math functions
// imported from `env` (`_sin`, `_powf`...), `-double` making the audio
// buffers and the control values float64.

/**
 * The `env` imports of a Faust wasm module: the C math functions its code calls.
 * The backend names them `_sin` (double) and `_sinf` (float); both map to the same
 * JavaScript function, which computes in double. The C functions without a `Math`
 * counterpart (fmod, remainder, copysign, isnan, isinf, exp10) are written here.
 * @returns {Object<string, Function>} the import object for the module's `env`
 */
export function mathImports() {
  // JavaScript's % keeps the sign of the dividend, as C's fmod does.
  const fmod = (a, b) => a % b;
  // C's remainder rounds the quotient to the nearest integer, halves to even;
  // Math.round sends halves up: the two differ only on exact ties.
  const remainder = (a, b) => a - Math.round(a / b) * b;
  // The sign of y, -0 included.
  const copysign = (x, y) => Math.abs(x) * (Object.is(y, -0) || y < 0 ? -1 : 1);
  // isnan and isinf return an integer, as in C.
  const isnan = (x) => (Number.isNaN(x) ? 1 : 0);
  const isinf = (x) => (Number.isFinite(x) || Number.isNaN(x) ? 0 : 1);
  const exp10 = (x) => 10 ** x;
  const env = {};
  // Every function under both of its names: `_name` and `_namef`.
  const table = {
    sin: Math.sin, cos: Math.cos, exp: Math.exp, exp10, log: Math.log, log10: Math.log10,
    tan: Math.tan, atan: Math.atan, asin: Math.asin, acos: Math.acos, round: Math.round,
    pow: Math.pow, atan2: Math.atan2, fmod, remainder, isnan, isinf, copysign,
    acosh: Math.acosh, asinh: Math.asinh, atanh: Math.atanh, cosh: Math.cosh,
    sinh: Math.sinh, tanh: Math.tanh,
  };
  for (const [name, f] of Object.entries(table)) {
    env["_" + name] = f;
    env["_" + name + "f"] = f;
  }
  return env;
}

/**
 * The leaves of a Faust JSON `ui` tree, depth first: the controls and bargraphs,
 * without the groups that contain them.
 * @param {Array<Object>} ui - the `ui` array of a Faust JSON (or a group's `items`)
 * @param {Array<Object>} [out] - the array the leaves are appended to
 * @returns {Array<Object>} `out`
 */
export function uiItems(ui, out = []) {
  for (const item of ui || []) {
    if (Array.isArray(item.items)) uiItems(item.items, out);
    else out.push(item);
  }
  return out;
}

// A control's address without the program name: "/coopiano/action/pedal"
// and "/coopiano_light/action/pedal" are both "action/pedal", so the voice
// and either body share their controls the way Faust's polyphonic
// architectures do.
/**
 * @param {string} address - a Faust control address ("/coopiano/action/pedal")
 * @returns {string} the address without its first component ("action/pedal")
 */
export function controlKey(address) {
  return address.split("/").filter(Boolean).slice(1).join("/");
}

// `value` rounded up to a multiple of `alignment`.
const align = (value, alignment) => Math.ceil(value / alignment) * alignment;

/**
 * One instance of a faust-rs wasm DSP, with its own memory, laid out as Faust's
 * C++ wasm architecture does:
 *
 *     0 .. json.size     the DSP structure: its state and its controls
 *     inputsPtr          the input pointer table, one 32-bit pointer per input
 *     outputsPtr         the output pointer table, right after the input one
 *     then               one block of `blockSize` samples per channel, inputs
 *                        first, aligned to the sample size (8 bytes with -double)
 *
 * Controls are addressed by key (`controlKey`), so the voice and the bodies can be
 * sent the same `set` calls: a key a DSP does not have is ignored.
 */
export class FaustWasmDsp {
  /**
   * @param {{module: WebAssembly.Module, json: Object}} compiled - the compiled
   *   module and its parsed JSON companion
   * @param {number} sampleRate - the sample rate given to the DSP's `init`
   * @param {number} blockSize - the largest number of frames per `compute` call
   */
  constructor(compiled, sampleRate, blockSize) {
    const { module, json } = compiled;
    this.json = json;
    this.blockSize = blockSize;
    const env = mathImports();
    // A module either exports its memory or imports it from `env`; an imported one
    // starts with one 64 KiB page and is grown below.
    const importsMemory = WebAssembly.Module.imports(module).some((i) => i.module === "env" && i.name === "memory");
    if (importsMemory) env.memory = new WebAssembly.Memory({ initial: 1 });
    this.exports = new WebAssembly.Instance(module, { env }).exports;
    const memory = this.exports.memory || env.memory;

    // Samples and control values are float64 when the DSP was compiled with -double.
    this.double = /(^|\s)-double(\s|$)/.test(json.compile_options || "");
    const bytes = this.double ? 8 : 4;
    this.inputs = this.exports.getNumInputs(0);
    this.outputs = this.exports.getNumOutputs(0);

    // Channel pointer tables, then one block per channel, after the DSP.
    this.inputsPtr = align(Number(json.size), 4);
    this.outputsPtr = this.inputsPtr + this.inputs * 4;
    let cursor = align(this.outputsPtr + this.outputs * 4, bytes);
    const channels = [];
    for (let c = 0; c < this.inputs + this.outputs; c += 1) {
      channels.push(cursor);
      cursor += blockSize * bytes;
    }
    // Grow the memory to hold the buffers, in 64 KiB pages. Growing detaches the
    // old ArrayBuffer: the typed views below are made afterwards.
    if (cursor > memory.buffer.byteLength) {
      memory.grow(Math.ceil((cursor - memory.buffer.byteLength) / 65536));
    }
    const u32 = new Uint32Array(memory.buffer);
    // The output pointer table follows the input one: slot c for channel c.
    channels.forEach((ptr, c) => {
      u32[(this.inputsPtr >> 2) + c] = ptr;
    });
    // One typed view per channel buffer: `input(c)` and `output(c)` return them.
    const Heap = this.double ? Float64Array : Float32Array;
    this.channelViews = channels.map((ptr) => new Heap(memory.buffer, ptr, blockSize));

    // `init` = classInit then instanceInit, on the DSP at address 0.
    this.exports.init(0, sampleRate);

    // Control offsets, by address and by key.
    this.controls = new Map();
    for (const item of uiItems(json.ui)) {
      if (item.address !== undefined && Number.isInteger(item.index)) {
        this.controls.set(controlKey(item.address), item.index);
      }
    }
  }

  /**
   * Sets a control by key ("action/pedal", "freq"); unknown keys are ignored,
   * so one call can address the voice and the body alike.
   * @param {string} key - a control key
   * @param {number} value - its new value
   */
  set(key, value) {
    const index = this.controls.get(key);
    if (index !== undefined) this.exports.setParamValue(0, index, value);
  }

  /**
   * @param {string} key - a control key ("action/pedal", "freq")
   * @returns {number|undefined} the control's value, undefined if the DSP has none
   */
  get(key) {
    const index = this.controls.get(key);
    return index === undefined ? undefined : this.exports.getParamValue(0, index);
  }

  /**
   * @param {number} c - input channel
   * @returns {Float32Array|Float64Array} its buffer, to fill before `compute`
   */
  input(c) {
    return this.channelViews[c];
  }

  /**
   * @param {number} c - output channel
   * @returns {Float32Array|Float64Array} its buffer, valid after `compute`
   */
  output(c) {
    return this.channelViews[this.inputs + c];
  }

  /**
   * Runs the DSP on `frames` samples (at most `blockSize`) of the channel buffers.
   * @param {number} frames
   */
  compute(frames) {
    this.exports.compute(0, frames, this.inputsPtr, this.outputsPtr);
  }
}

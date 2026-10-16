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

export function mathImports() {
  const fmod = (a, b) => a % b;
  const remainder = (a, b) => a - Math.round(a / b) * b;
  const copysign = (x, y) => Math.abs(x) * (Object.is(y, -0) || y < 0 ? -1 : 1);
  const isnan = (x) => (Number.isNaN(x) ? 1 : 0);
  const isinf = (x) => (Number.isFinite(x) || Number.isNaN(x) ? 0 : 1);
  const exp10 = (x) => 10 ** x;
  const env = {};
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

// The leaves of a Faust JSON `ui` tree.
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
export function controlKey(address) {
  return address.split("/").filter(Boolean).slice(1).join("/");
}

const align = (value, alignment) => Math.ceil(value / alignment) * alignment;

export class FaustWasmDsp {
  // `compiled` is { module: WebAssembly.Module, json: parsed JSON }.
  constructor(compiled, sampleRate, blockSize) {
    const { module, json } = compiled;
    this.json = json;
    this.blockSize = blockSize;
    const env = mathImports();
    const importsMemory = WebAssembly.Module.imports(module).some((i) => i.module === "env" && i.name === "memory");
    if (importsMemory) env.memory = new WebAssembly.Memory({ initial: 1 });
    this.exports = new WebAssembly.Instance(module, { env }).exports;
    const memory = this.exports.memory || env.memory;

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
    if (cursor > memory.buffer.byteLength) {
      memory.grow(Math.ceil((cursor - memory.buffer.byteLength) / 65536));
    }
    const u32 = new Uint32Array(memory.buffer);
    // The output pointer table follows the input one: slot c for channel c.
    channels.forEach((ptr, c) => {
      u32[(this.inputsPtr >> 2) + c] = ptr;
    });
    const Heap = this.double ? Float64Array : Float32Array;
    this.channelViews = channels.map((ptr) => new Heap(memory.buffer, ptr, blockSize));

    this.exports.init(0, sampleRate);

    // Control offsets, by address and by key.
    this.controls = new Map();
    for (const item of uiItems(json.ui)) {
      if (item.address !== undefined && Number.isInteger(item.index)) {
        this.controls.set(controlKey(item.address), item.index);
      }
    }
  }

  // Sets a control by key ("action/pedal", "freq"); unknown keys are ignored,
  // so one call can address the voice and the body alike.
  set(key, value) {
    const index = this.controls.get(key);
    if (index !== undefined) this.exports.setParamValue(0, index, value);
  }

  get(key) {
    const index = this.controls.get(key);
    return index === undefined ? undefined : this.exports.getParamValue(0, index);
  }

  input(c) {
    return this.channelViews[c];
  }

  output(c) {
    return this.channelViews[this.inputs + c];
  }

  compute(frames) {
    this.exports.compute(0, frames, this.inputsPtr, this.outputsPtr);
  }
}

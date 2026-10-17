// The page: controls with their explanations, the keyboard (mouse, touch,
// computer keys), Web MIDI input, and the AudioWorklet that runs the
// faust-rs wasm voices and body (coopiano-processor.js).

import { GROUPS, PRESETS, TEXT } from "./controls.js";
import { uiItems, controlKey } from "./faust-wasm-dsp.js";

// Where `make web` puts the wasm modules and their JSON, relative to the page.
const DSP_DIR = "dsp/";
const FIRST_KEY = 21; // A0
const LAST_KEY = 108; // C8
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Scientific pitch name of a MIDI key (60 is C4).
const noteName = (key) => NOTE_NAMES[key % 12] + (Math.floor(key / 12) - 1);
// True for the keys of C#, D#, F#, G# and A#.
const isBlack = (key) => [1, 3, 6, 8, 10].includes(key % 12);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- language

// The page's language, "en" or "fr": the stored choice, else the browser's.
let lang = "en";
try {
  lang = localStorage.getItem("coopiano-lang") || (navigator.language || "en").slice(0, 2);
} catch {
  lang = (navigator.language || "en").slice(0, 2);
}
if (lang !== "fr") lang = "en";
// The text of an { en, fr } entry in the page's language (English as fallback).
const t = (entry) => (entry ? entry[lang] || entry.en : "");

// The "How it works" section, as HTML.
const HOW = {
  en: `
<p>Each key played takes one of the voices. Its felt hammer is solved against its strings at every sample, and the voice hands the body five signals: its bridge force split over four bridge regions (a crossfade between the two regions around the key's place on the bridge), and a correction that withholds the key's own share from the sympathetic strings.</p>
<p>The body runs once on the sum of the voices:</p>
<ul>
<li>the <b>sympathetic register</b>: the strings of the 88 keys driven by the total force, open while the pedal lifts the dampers, and always open from F#6 up;</li>
<li>the <b>soundboard</b>: 732 modes. The imaged body fits each mode per bridge region and per channel (1464 resonators); the light one gives each mode a single resonator for both channels, about a third of the cost, without the regions' stereo image;</li>
<li>a 20 Hz DC filter, the <b>room</b>, the output gain and a soft limiter.</li>
</ul>
<p>Everything is written in Faust (<code>dsp/coopiano.lib</code>), compiled to WebAssembly by faust-rs and run in an AudioWorklet. The model is checked against the C++ model it ports: see the <a href="https://github.com/sletz/faust-coopiano#readme">README</a> and the <a href="https://github.com/sletz/faust-coopiano/blob/main/paper/faust-coopiano.pdf">paper</a>. The imaged body costs about twice the light one, and with the pedal down the sympathetic strings of the damped keys wake up and cost more: the load meter above tells how much of the audio thread is used.</p>`,
  fr: `
<p>Chaque touche jouée prend une des voix. Son marteau de feutre est résolu contre ses cordes à chaque échantillon, et la voix transmet au corps cinq signaux : sa force au chevalet répartie sur quatre régions du chevalet (un fondu entre les deux régions qui entourent la place de la touche), et une correction qui retire la part de la touche de ses propres cordes sympathiques.</p>
<p>Le corps tourne une seule fois sur la somme des voix :</p>
<ul>
<li>la <b>résonance sympathique</b> : les cordes des 88 touches excitées par la force totale, ouvertes quand la pédale lève les étouffoirs, et toujours ouvertes à partir de fa# 6 ;</li>
<li>la <b>table d'harmonie</b> : 732 modes. Le corps imagé ajuste chaque mode par région du chevalet et par canal (1464 résonateurs) ; le corps léger donne à chaque mode un seul résonateur pour les deux canaux, environ trois fois moins cher, sans l'image stéréo des régions ;</li>
<li>un filtre continu à 20 Hz, la <b>salle</b>, le gain de sortie et un limiteur doux.</li>
</ul>
<p>Tout est écrit en Faust (<code>dsp/coopiano.lib</code>), compilé en WebAssembly par faust-rs et exécuté dans un AudioWorklet. Le modèle est vérifié contre le modèle C++ qu'il porte : voir le <a href="https://github.com/sletz/faust-coopiano/blob/main/README.fr.md">README</a> et l'<a href="https://github.com/sletz/faust-coopiano/blob/main/paper/faust-coopiano.pdf">article</a>. Le corps imagé coûte environ deux fois le corps léger, et pédale enfoncée les cordes sympathiques des touches étouffées se réveillent et coûtent davantage : l'indicateur de charge ci-dessus dit quelle part du thread audio est utilisée.</p>`,
};

// The help line under the keyboard.
const KEYS_HINT = {
  en: "Mouse or touch: play the keys (with “from the click position”, lower on the key is louder). Computer keyboard: two rows, Z S X D C… and Q 2 W 3 E… (by key position, whatever the layout), from the octave shown; ← and → shift it; the space bar holds the pedal. MIDI: choose an input above. To play from another application on macOS, enable the IAC Driver in Audio MIDI Setup and send to it.",
  fr: "Souris ou écran tactile : jouer sur les touches (avec « selon la position du clic », plus bas sur la touche, plus fort). Clavier d'ordinateur : deux rangées, W S X D C… et A 2 Z 3 E… sur un AZERTY (par position des touches, quelle que soit la disposition), à partir de l'octave affichée ; ← et → la décalent ; la barre d'espace tient la pédale. MIDI : choisir une entrée ci-dessus. Pour jouer depuis une autre application sous macOS, activer le gestionnaire IAC dans Configuration audio et MIDI et lui envoyer les notes.",
};

// ---------------------------------------------------------------- controls

const controlDefs = new Map(); // key -> { min, max, step, init }
const values = new Map(); // key -> current value
const controlViews = new Map(); // key -> { input, value }

/**
 * @param {number} step - a control's step
 * @returns {number} the number of decimals of `step`
 */
function decimals(step) {
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

/**
 * @param {string} key - a control key
 * @param {number} value
 * @returns {string} `value` with the decimals of the control's step (at most 4)
 */
function formatValue(key, value) {
  const def = controlDefs.get(key);
  return Number(value).toFixed(def ? Math.min(4, decimals(def.step)) : 2);
}

/**
 * Sets a control: its value, its slider and label (marked when it differs from
 * the default), the processor (unless `send` is false), and the presets' state.
 * @param {string} key - a control key
 * @param {number} value
 * @param {{send?: boolean}} [options] - send: false only updates the page
 */
function setControl(key, value, { send = true } = {}) {
  values.set(key, value);
  const view = controlViews.get(key);
  if (view) {
    view.input.value = value;
    view.value.textContent = formatValue(key, value) + (view.unit ? " " + view.unit : "");
    view.value.classList.toggle("changed", Math.abs(value - controlDefs.get(key).init) > 1e-12);
  }
  if (send && audio.node) audio.node.port.postMessage({ type: "control", key, value });
  updatePresetState();
}

// ---------------------------------------------------------------- presets

// The last preset applied: its card is highlighted.
let lastPreset = "concert";

/**
 * What a preset sets: its overrides, the defaults for every other control
 * shown on the page, the pedal left alone.
 * @param {Object} preset - an entry of PRESETS
 * @returns {Map<string, number>} control key -> value
 */
function presetTargets(preset) {
  const targets = new Map();
  for (const [key, def] of controlDefs) {
    if (key === "action/pedal" || !controlViews.has(key)) continue;
    targets.set(key, preset.values[key] ?? def.init);
  }
  return targets;
}

/**
 * @param {Object} preset - an entry of PRESETS
 * @returns {boolean} true while every control is at the value the preset sets
 */
function presetMatches(preset) {
  for (const [key, value] of presetTargets(preset)) {
    if (Math.abs(values.get(key) - value) > 1e-9) return false;
  }
  return true;
}

/**
 * Applies a preset: its values, and the defaults for the controls it does not list.
 * @param {Object} preset - an entry of PRESETS
 */
function applyPreset(preset) {
  lastPreset = preset.id;
  for (const [key, value] of presetTargets(preset)) setControl(key, value);
  updatePresetState();
}

/**
 * Highlights the last preset applied, with a "modified" badge once a control
 * no longer has the value it set.
 */
function updatePresetState() {
  for (const card of document.querySelectorAll(".preset[data-preset]")) {
    const preset = PRESETS.find((p) => p.id === card.dataset.preset);
    const active = preset.id === lastPreset;
    card.classList.toggle("active", active);
    card.querySelector(".badge").hidden = !active || presetMatches(preset);
  }
}

/**
 * @param {string} key - a control key
 * @returns {string} its name in the page's language, the key itself if unknown
 */
function controlName(key) {
  for (const group of GROUPS) if (group.controls[key]) return t(group.controls[key].name);
  return key;
}

/**
 * Fills the Presets tab: one card per preset, with its explanation, the controls
 * it sets and an Apply button.
 * @param {HTMLElement} box - the tab's panel
 */
function buildPresetsPanel(box) {
  const intro = document.createElement("p");
  intro.className = "group-intro";
  intro.textContent = t(TEXT.presetsIntro);
  const grid = document.createElement("div");
  grid.className = "presets";
  for (const preset of PRESETS) {
    const card = document.createElement("div");
    card.className = "preset";
    card.dataset.preset = preset.id;
    const head = document.createElement("div");
    head.className = "preset-head";
    const name = document.createElement("h3");
    name.textContent = t(preset.name);
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = t(TEXT.modified);
    badge.hidden = true;
    name.append(" ", badge);
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = t(TEXT.apply);
    apply.addEventListener("click", () => applyPreset(preset));
    head.append(name, apply);
    const help = document.createElement("p");
    help.className = "control-help";
    help.textContent = t(preset.help);
    const changes = document.createElement("p");
    changes.className = "control-range";
    const keys = Object.keys(preset.values);
    changes.textContent = t(TEXT.presetChanges) + " : "
      + (keys.length ? keys.map(controlName).join(", ") : t(TEXT.presetNoChange)) + ".";
    if (lang === "en") changes.textContent = changes.textContent.replace(" : ", ": ");
    card.append(head, help, changes);
    grid.append(card);
  }
  box.append(intro, grid);
}

// The open tab, remembered across visits when storage is available.
let activeGroup = "presets";
try {
  activeGroup = localStorage.getItem("coopiano-tab") || activeGroup;
} catch {
  // the tab is only remembered when storage is available
}
// The tabs: the presets, then one per control group.
const TABS = [{ id: "presets", title: TEXT.presets }, ...GROUPS];
if (!TABS.some((g) => g.id === activeGroup)) activeGroup = TABS[0].id;

/**
 * Opens a tab (ARIA tabs: selected state, roving tabindex, panels shown or hidden).
 * @param {string} id - the tab's group id
 * @param {boolean} [focus] - also move the keyboard focus to the tab
 */
function selectGroup(id, focus = false) {
  activeGroup = id;
  try {
    localStorage.setItem("coopiano-tab", id);
  } catch {
    // the tab is only remembered when storage is available
  }
  for (const tab of document.querySelectorAll("#tabs [role=tab]")) {
    const on = tab.dataset.group === id;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  for (const panel of document.querySelectorAll("#groups [role=tabpanel]")) panel.hidden = panel.dataset.group !== id;
}

/**
 * Builds the tabs and their panels: the presets, then one tab per type of
 * control (the groups of default.ini).
 */
function buildControls() {
  const tabs = $("tabs");
  const root = $("groups");
  tabs.textContent = "";
  root.textContent = "";
  for (const group of TABS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "tab-" + group.id;
    tab.dataset.group = group.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", "panel-" + group.id);
    tab.textContent = t(group.title);
    tab.addEventListener("click", () => selectGroup(group.id));
    // Left and right arrows move between the tabs, cyclically.
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      const i = TABS.findIndex((g) => g.id === activeGroup);
      const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
      selectGroup(next.id, true);
    });
    tabs.append(tab);

    const box = document.createElement("div");
    box.className = "group";
    box.id = "panel-" + group.id;
    box.dataset.group = group.id;
    box.setAttribute("role", "tabpanel");
    box.setAttribute("aria-labelledby", tab.id);
    if (group.id === "presets") {
      buildPresetsPanel(box);
      root.append(box);
      continue;
    }
    const head = document.createElement("div");
    head.className = "group-head";
    const intro = document.createElement("p");
    intro.className = "group-intro";
    intro.textContent = t(group.intro);
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = t(TEXT.reset);
    reset.addEventListener("click", () => {
      for (const key of Object.keys(group.controls)) setControl(key, controlDefs.get(key).init);
    });
    head.append(intro, reset);
    const grid = document.createElement("div");
    grid.className = "group-controls";
    box.append(head, grid);
    // One row per control the compiled DSPs have: name and Faust name, value,
    // slider (double-click: default), explanation, default and range.
    for (const [key, info] of Object.entries(group.controls)) {
      const def = controlDefs.get(key);
      if (!def) continue;
      const row = document.createElement("div");
      row.className = "control";
      const top = document.createElement("div");
      top.className = "control-row";
      const name = document.createElement("label");
      name.className = "control-name";
      name.htmlFor = "ctl-" + key;
      name.textContent = t(info.name);
      const code = document.createElement("code");
      code.textContent = key.split("/")[1];
      name.append(code);
      const value = document.createElement("span");
      value.className = "control-value";
      const input = document.createElement("input");
      input.type = "range";
      input.id = "ctl-" + key;
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.addEventListener("input", () => setControl(key, Number(input.value)));
      input.addEventListener("dblclick", () => setControl(key, def.init));
      top.append(name, value, input);
      const help = document.createElement("p");
      help.className = "control-help";
      help.textContent = t(info.help) + " ";
      const range = document.createElement("span");
      range.className = "control-range";
      const unit = info.unit ? " " + info.unit : "";
      range.textContent = (lang === "fr" ? "Défaut " : "Default ") + formatValue(key, def.init) + unit
        + (lang === "fr" ? ", de " : ", range ") + formatValue(key, def.min) + (lang === "fr" ? " à " : " to ")
        + formatValue(key, def.max) + unit + (lang === "fr" ? " (double-clic : défaut)." : " (double-click: default).");
      help.append(range);
      row.append(top, help);
      grid.append(row);
      controlViews.set(key, { input, value, unit: info.unit });
      setControl(key, values.get(key), { send: false });
    }
    root.append(box);
  }
  selectGroup(activeGroup);
  updatePresetState();
}

// ---------------------------------------------------------------- audio

// The audio context, the processor's node, and a flag while they are created;
// `pending` is the context while it is being set up, `stopped` that the user
// stopped the audio (Stop audio), as opposed to the browser holding it.
const audio = { ctx: null, node: null, compiled: null, starting: false, pending: null, stopped: false };

/**
 * Resumes the audio context unless the user stopped it. Safari (and Chrome under
 * its autoplay policy) runs a context only once `resume` is called during a user
 * gesture: every key press and the Start button call this.
 */
function wakeAudio() {
  const ctx = audio.ctx || audio.pending;
  if (ctx && ctx.state !== "running" && !audio.stopped) ctx.resume().catch(() => {});
}

/**
 * Shows an error of the audio thread in the status line, and in the console.
 * @param {string} message
 */
function showError(message) {
  console.error(message);
  $("status").textContent = message;
}

/**
 * Shows the state of the running context: the status line and the Start/Stop
 * button.
 */
function showAudioState() {
  const ctx = audio.ctx;
  if (!ctx) return;
  const running = ctx.state === "running";
  if (running) setStatus(TEXT.running, ctx.sampleRate !== 44100 ? ` (${ctx.sampleRate} Hz)` : "");
  else setStatus(audio.stopped ? TEXT.stopped : TEXT.blocked);
  $("start").dataset.text = running ? "stop" : "start";
  $("start").textContent = t(TEXT[$("start").dataset.text]);
}

/**
 * Fetches and compiles one DSP of DSP_DIR.
 * @param {string} name - "voice", "body" or "body_light"
 * @returns {Promise<{json: Object, module: WebAssembly.Module}>}
 */
async function compileDsp(name) {
  const [json, module] = await Promise.all([
    fetch(DSP_DIR + name + ".json").then((r) => {
      if (!r.ok) throw new Error(`${DSP_DIR}${name}.json: ${r.status} (run make web)`);
      return r.json();
    }),
    fetch(DSP_DIR + name + ".wasm").then(async (r) => {
      if (!r.ok) throw new Error(`${DSP_DIR}${name}.wasm: ${r.status} (run make web)`);
      return WebAssembly.compile(await r.arrayBuffer());
    }),
  ]);
  return { json, module };
}

/**
 * @param {Object|null} entry - a TEXT entry for the status line
 * @param {string} [extra] - text appended to it
 */
function setStatus(entry, extra = "") {
  $("status").textContent = (entry ? t(entry) : "") + extra;
}

/**
 * The Start/Stop button. The first call creates the audio context at 44.1 kHz,
 * loads the processor, compiles the three DSPs and starts the voices with the
 * current controls; the later calls suspend or resume the context (suspending
 * first releases every note).
 */
async function startAudio() {
  if (audio.ctx) {
    if (audio.ctx.state === "running") {
      audio.stopped = true;
      allNotesOff();
      await audio.ctx.suspend();
    } else {
      audio.stopped = false;
      await audio.ctx.resume();
    }
    showAudioState();
    return;
  }
  if (audio.starting) {
    wakeAudio();
    return;
  }
  audio.starting = true;
  setStatus(TEXT.loading);
  try {
    const ctx = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
    // Safari runs a context only if `resume` is called during the user's gesture,
    // which the loads below outlast: call it now, without waiting for it. A start
    // from MIDI is no gesture; the next key press or Start resumes it (wakeAudio).
    audio.pending = ctx;
    ctx.resume().catch(() => {});
    await ctx.audioWorklet.addModule("coopiano-processor.js");
    const [voice, light, full] = await Promise.all(["voice", "body_light", "body"].map(compileDsp));
    // The compiled modules are structured-cloned into the audio thread, which
    // instantiates them (coopiano-processor.js).
    const node = new AudioWorkletNode(ctx, "coopiano", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {
        voice,
        bodies: { light, full },
        body: $("body").value,
        polyphony: Number($("polyphony").value),
        controls: Object.fromEntries(values),
      },
    });
    await new Promise((resolve, reject) => {
      node.port.onmessage = (e) => {
        if (e.data.type === "ready") resolve();
        else if (e.data.type === "error") reject(new Error("processor: " + e.data.message));
      };
      node.onprocessorerror = (e) => reject(new Error("processor error: " + (e.message || e)));
      // A processor that never answers: say so, with the context's state.
      setTimeout(() => reject(new Error(`no answer from the audio processor after 20 s (context ${ctx.state})`)), 20000);
    });
    node.port.onmessage = (e) => onStats(e.data);
    node.onprocessorerror = (e) => showError("processor error: " + (e.message || e));
    node.connect(ctx.destination);
    audio.ctx = ctx;
    audio.node = node;
    $("panic").disabled = false;
    ctx.onstatechange = showAudioState;
    showAudioState();
    initMidi();
  } catch (error) {
    console.error(error);
    $("status").textContent = String(error.message || error);
  } finally {
    audio.starting = false;
    audio.pending = null;
  }
}

/**
 * Shows the processor's statistics: load of the audio thread (warning above 95 %),
 * output peak in dBFS over a 60 dB scale, sounding voices and the body's sleep.
 * @param {Object} m - a message of the processor
 */
function onStats(m) {
  if (m.type === "error") {
    console.error(m.stack);
    showError("processor: " + m.message);
    return;
  }
  if (m.type !== "stats") return;
  const load = Math.round(100 * m.load);
  $("cpu-bar").style.width = Math.min(100, load) + "%";
  $("cpu-bar").classList.toggle("over", load > 85);
  $("cpu-value").textContent = load + " %";
  $("cpu-warning").hidden = load <= 95;
  const peak = Math.max(m.peakL, m.peakR);
  const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  $("level-bar").style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + "%";
  $("level-bar").classList.toggle("over", m.clips > 0);
  $("level-value").textContent = Number.isFinite(db) ? db.toFixed(1) + " dB" : "–";
  $("voices-value").textContent = `${m.active} / ${$("polyphony").value}` + (m.bodyAsleep ? ` · ${t(TEXT.bodyIdle)}` : "");
}

/**
 * Posts a message to the processor, once it exists.
 * @param {Object} message - see the protocol in coopiano-processor.js
 */
function send(message) {
  if (audio.node) audio.node.port.postMessage(message);
}

// ---------------------------------------------------------------- notes

// A key sounds while one source at least holds it: a mouse pointer, a computer
// key and a MIDI input can hold the same key; the note is released with the last.
const sources = new Map(); // key -> set of sources holding it (pointer ids, "kbd", "midi")
const keyElements = new Map();

/**
 * A key pressed by a source (the first note starts the audio).
 * @param {number} key - MIDI key; keys outside A0..C8 are ignored
 * @param {number} velocity - in [0, 1]
 * @param {string} source - who holds it: "p<pointer id>", "kbd", "midi", "console"
 */
function noteOn(key, velocity, source) {
  if (key < FIRST_KEY || key > LAST_KEY) return;
  if (!audio.ctx && !audio.starting) startAudio();
  else wakeAudio();
  let held = sources.get(key);
  if (!held) sources.set(key, (held = new Set()));
  held.add(source);
  keyElements.get(key)?.classList.add("down");
  send({ type: "noteOn", key, velocity });
}

/**
 * A key released by a source; the note ends when no source holds it any more.
 * @param {number} key - MIDI key
 * @param {string} source - as given to noteOn
 */
function noteOff(key, source) {
  const held = sources.get(key);
  if (!held || !held.delete(source)) return;
  if (held.size === 0) {
    keyElements.get(key)?.classList.remove("down");
    send({ type: "noteOff", key });
  }
}

/**
 * Releases every held key, whatever holds it.
 */
function allNotesOff() {
  for (const [key, held] of sources) {
    if (held.size > 0) send({ type: "noteOff", key });
    held.clear();
    keyElements.get(key)?.classList.remove("down");
  }
}

/**
 * The sustain pedal: the control and the pedal button's state.
 * @param {number} value - 0 up .. 1 down
 */
function setPedal(value) {
  setControl("action/pedal", value);
  $("pedal").classList.toggle("down", value >= 0.5);
}

// ---------------------------------------------------------------- keyboard

// Widths of the white and black keys, in pixels.
const WHITE = 24;
const BLACK = 15;

/**
 * Draws the 88 keys, A0 to C8, absolutely positioned (black keys straddle two
 * white ones), with the C keys and A0 labelled.
 */
function buildKeyboard() {
  const kb = $("keyboard");
  kb.textContent = "";
  let white = 0;
  for (let key = FIRST_KEY; key <= LAST_KEY; key += 1) {
    const el = document.createElement("div");
    el.dataset.key = key;
    if (isBlack(key)) {
      el.className = "key black";
      el.style.left = white * WHITE - BLACK / 2 + "px";
      el.style.width = BLACK + "px";
    } else {
      el.className = "key white";
      el.style.left = white * WHITE + "px";
      el.style.width = WHITE + "px";
      if (key % 12 === 0 || key === FIRST_KEY) {
        const label = document.createElement("span");
        label.className = "label";
        label.textContent = noteName(key);
        el.append(label);
      }
      white += 1;
    }
    kb.append(el);
    keyElements.set(key, el);
  }
  kb.style.width = white * WHITE + "px";
  // Start the view around the middle of the keyboard.
  requestAnimationFrame(() => {
    const scroll = kb.parentElement;
    scroll.scrollLeft = (kb.scrollWidth - scroll.clientWidth) / 2;
  });
}

/**
 * Velocity of a click: the velocity slider, or, with "from the click position",
 * from the height of the click on the key: MIDI 16 at the top to 127 at the bottom.
 * @param {PointerEvent} event
 * @param {HTMLElement} el - the key
 * @returns {number} velocity in [0, 1]
 */
function velocityFor(event, el) {
  if (!$("velocity-position").checked) return Number($("velocity").value) / 127;
  const rect = el.getBoundingClientRect();
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  return Math.max(1, Math.round(16 + 111 * y)) / 127;
}

/**
 * @param {number} x - client coordinates
 * @param {number} y
 * @returns {{el: HTMLElement, key: number}|null} the key under the point
 */
function keyAt(x, y) {
  const el = document.elementFromPoint(x, y)?.closest(".key");
  return el ? { el, key: Number(el.dataset.key) } : null;
}

/**
 * Mouse and touch: one note per pointer, captured by the keyboard, sliding from
 * key to key (glissando) while the pointer moves.
 */
function initPointer() {
  const kb = $("keyboard");
  const pointers = new Map(); // pointer id -> key
  kb.addEventListener("pointerdown", (e) => {
    const hit = keyAt(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    kb.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, hit.key);
    noteOn(hit.key, velocityFor(e, hit.el), "p" + e.pointerId);
  });
  kb.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const hit = keyAt(e.clientX, e.clientY);
    const old = pointers.get(e.pointerId);
    if (!hit || hit.key === old) return;
    noteOff(old, "p" + e.pointerId);
    pointers.set(e.pointerId, hit.key);
    noteOn(hit.key, velocityFor(e, hit.el), "p" + e.pointerId);
  });
  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    noteOff(pointers.get(e.pointerId), "p" + e.pointerId);
    pointers.delete(e.pointerId);
  };
  kb.addEventListener("pointerup", up);
  kb.addEventListener("pointercancel", up);
}

// Physical key positions (KeyboardEvent.code), so the rows work on any layout.
// Two rows of a piano keyboard on the computer keyboard, as on trackers: the
// lower row from C of `baseOctave`, the upper one an octave higher.
const LOWER_ROW = ["KeyZ", "KeyS", "KeyX", "KeyD", "KeyC", "KeyV", "KeyG", "KeyB", "KeyH", "KeyN", "KeyJ", "KeyM",
  "Comma", "KeyL", "Period", "Semicolon", "Slash"];
const UPPER_ROW = ["KeyQ", "Digit2", "KeyW", "Digit3", "KeyE", "KeyR", "Digit5", "KeyT", "Digit6", "KeyY", "Digit7", "KeyU",
  "KeyI", "Digit9", "KeyO", "Digit0", "KeyP"];
// Labels of the punctuation codes when the layout is unknown.
const QWERTY = { Comma: ",", Period: ".", Semicolon: ";", Slash: "/" };
let baseOctave = 3; // the lower row starts at C3
// The keyboard layout (navigator.keyboard), for the labels; null if unavailable.
let layoutMap = null;
const computerKeys = new Map(); // code -> key while held

/**
 * @param {string} code - a KeyboardEvent.code
 * @returns {number|null} its offset in semitones from C of `baseOctave`, null if
 *   the code plays no note
 */
function codeOffset(code) {
  let i = LOWER_ROW.indexOf(code);
  if (i >= 0) return i;
  i = UPPER_ROW.indexOf(code);
  return i >= 0 ? 12 + i : null;
}

/**
 * @param {string} code - a KeyboardEvent.code
 * @returns {string} the character it types on this layout (or QWERTY's)
 */
function codeLabel(code) {
  const c = layoutMap?.get(code);
  if (c) return c.toUpperCase();
  if (QWERTY[code]) return QWERTY[code];
  return code.replace(/^Key|^Digit/, "");
}

/**
 * Writes on the keys the computer keys that play them, and the octave shown.
 */
function labelComputerKeys() {
  for (const el of document.querySelectorAll(".label.computer")) el.remove();
  const base = 12 * (baseOctave + 1);
  // The rows overlap over C to E of the upper row's octave: both labels.
  for (const code of [...LOWER_ROW, ...UPPER_ROW]) {
    const key = base + codeOffset(code);
    const el = keyElements.get(key);
    if (!el) continue;
    const existing = el.querySelector(".label.computer");
    if (existing) {
      existing.textContent += " " + codeLabel(code);
      continue;
    }
    const label = document.createElement("span");
    label.className = "label computer";
    label.textContent = codeLabel(code);
    el.append(label);
  }
  $("octave-value").textContent = "C" + baseOctave;
}

/**
 * Shifts the computer keyboard by octaves, keeping its lower row from C0 to C6.
 * @param {number} delta - -1 or 1
 */
function shiftOctave(delta) {
  baseOctave = Math.min(6, Math.max(0, baseOctave + delta));
  labelComputerKeys();
}

/**
 * The computer keyboard: the two rows play, the space bar holds the pedal, the
 * left and right arrows shift the octave. Keys typed into a form field, or with a
 * modifier, are left alone; leaving the window releases the held keys.
 */
function initComputerKeyboard() {
  navigator.keyboard?.getLayoutMap?.().then((map) => {
    layoutMap = map;
    labelComputerKeys();
  }).catch(() => {});
  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "SELECT" || tag === "TEXTAREA" || (tag === "INPUT" && document.activeElement.type !== "range" && document.activeElement.type !== "checkbox")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) setPedal(1);
      return;
    }
    if ((e.code === "ArrowLeft" || e.code === "ArrowRight") && document.activeElement?.type !== "range") {
      e.preventDefault();
      if (!e.repeat) shiftOctave(e.code === "ArrowLeft" ? -1 : 1);
      return;
    }
    const offset = codeOffset(e.code);
    if (offset === null) return;
    e.preventDefault();
    if (e.repeat || computerKeys.has(e.code)) return;
    const key = 12 * (baseOctave + 1) + offset;
    computerKeys.set(e.code, key);
    noteOn(key, Number($("velocity").value) / 127, "kbd");
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      setPedal(0);
      return;
    }
    const key = computerKeys.get(e.code);
    if (key === undefined) return;
    computerKeys.delete(e.code);
    noteOff(key, "kbd");
  });
  window.addEventListener("blur", () => {
    for (const key of computerKeys.values()) noteOff(key, "kbd");
    computerKeys.clear();
  });
}

// ---------------------------------------------------------------- MIDI

// Web MIDI: the access object, the chosen input ("all" or an id), the channel
// (0 for omni) and the timer of the activity light.
const midi = { access: null, input: "all", channel: 0, activityTimer: 0 };

/**
 * @returns {Array<MIDIInput>} the MIDI inputs, none before access is granted
 */
function midiInputs() {
  return midi.access ? [...midi.access.inputs.values()] : [];
}

/**
 * Fills the MIDI input menu, or says why there is no input.
 */
function fillMidiSelect() {
  const select = $("midi-input");
  select.textContent = "";
  const inputs = midiInputs();
  if (!navigator.requestMIDIAccess) {
    select.append(new Option(t(TEXT.midiUnsupported), ""));
    select.disabled = true;
    return;
  }
  if (!midi.access) {
    select.append(new Option("—", ""));
    return;
  }
  if (inputs.length === 0) {
    select.append(new Option(t(TEXT.midiNone), ""));
    return;
  }
  select.disabled = false;
  select.append(new Option(t(TEXT.midiAll), "all"));
  for (const input of inputs) select.append(new Option(input.name, input.id));
  select.value = inputs.some((i) => i.id === midi.input) ? midi.input : "all";
  midi.input = select.value;
}

/**
 * Fills the MIDI channel menu: omni, then 1 to 16.
 */
function fillChannelSelect() {
  const select = $("midi-channel");
  const current = midi.channel;
  select.textContent = "";
  select.append(new Option(t(TEXT.midiOmni), "0"));
  for (let c = 1; c <= 16; c += 1) select.append(new Option(String(c), String(c)));
  select.value = String(current);
}

/**
 * Listens to the chosen input (or to all of them).
 */
function bindMidiInputs() {
  for (const input of midiInputs()) {
    input.onmidimessage = midi.input === "all" || midi.input === input.id ? onMidiMessage : null;
  }
}

/**
 * Asks for MIDI access once (when the audio starts), and follows inputs
 * connected or disconnected later.
 */
async function initMidi() {
  if (!navigator.requestMIDIAccess || midi.access) return;
  try {
    midi.access = await navigator.requestMIDIAccess();
  } catch {
    $("midi-input").textContent = "";
    $("midi-input").append(new Option(t(TEXT.midiDenied), ""));
    return;
  }
  midi.access.onstatechange = () => {
    fillMidiSelect();
    bindMidiInputs();
  };
  fillMidiSelect();
  bindMidiInputs();
}

/**
 * A MIDI message: note on and off, sustain pedal (CC64, continuous), all notes
 * off (CC120, CC123), on the chosen channel; the activity light and the last
 * message are shown.
 * @param {{data: Uint8Array}} event
 */
function onMidiMessage(event) {
  const [status, a = 0, b = 0] = event.data;
  const kind = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  if (status >= 0xf0) return; // clock, active sensing, sysex
  if (midi.channel !== 0 && channel !== midi.channel) return;
  let text = "";
  if (kind === 0x90 && b > 0) {
    noteOn(a, b / 127, "midi");
    text = `${noteName(a)} ${b}`;
  } else if (kind === 0x80 || (kind === 0x90 && b === 0)) {
    noteOff(a, "midi");
    text = `${noteName(a)} off`;
  } else if (kind === 0xb0 && a === 64) {
    setPedal(b / 127);
    text = `CC64 ${b}`;
  } else if (kind === 0xb0 && (a === 120 || a === 123)) {
    allNotesOff();
    text = `CC${a}`;
  } else {
    return;
  }
  $("midi-message").textContent = `ch ${channel} · ${text}`;
  $("midi-activity").classList.add("on");
  clearTimeout(midi.activityTimer);
  midi.activityTimer = setTimeout(() => $("midi-activity").classList.remove("on"), 120);
}

// ---------------------------------------------------------------- page

/**
 * Sets the page's texts in its language and rebuilds the translated parts.
 */
function applyLanguage() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-text]")) {
    const entry = TEXT[el.dataset.text];
    if (entry) el.textContent = t(entry);
  }
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  showAudioState();
  $("how").innerHTML = HOW[lang];
  $("keys-hint").textContent = KEYS_HINT[lang];
  buildControls();
  fillMidiSelect();
  fillChannelSelect();
}

/**
 * Loads the controls' ranges and defaults from the JSON of the DSPs, builds the
 * keyboard and the controls, and wires the page's buttons and menus.
 */
async function main() {
  // Ranges and defaults: the JSON of the voice and of the light body (the
  // full body has the same controls).
  const [voiceJson, bodyJson] = await Promise.all(["voice", "body_light"].map((n) =>
    fetch(DSP_DIR + n + ".json").then((r) => {
      if (!r.ok) throw new Error(`${DSP_DIR}${n}.json: ${r.status} (run make web)`);
      return r.json();
    })));
  for (const item of [...uiItems(voiceJson.ui), ...uiItems(bodyJson.ui)]) {
    if (item.address === undefined || item.min === undefined) continue;
    const key = controlKey(item.address);
    if (!controlDefs.has(key)) {
      controlDefs.set(key, { min: item.min, max: item.max, step: item.step, init: item.init });
      values.set(key, item.init);
    }
  }

  buildKeyboard();
  initPointer();
  initComputerKeyboard();
  applyLanguage();
  labelComputerKeys();

  $("start").addEventListener("click", startAudio);
  $("panic").addEventListener("click", () => {
    allNotesOff();
    send({ type: "panic" });
  });
  $("reset-all").addEventListener("click", () => {
    for (const [key, def] of controlDefs) if (controlViews.has(key)) setControl(key, def.init);
    setPedal(0);
  });
  $("body").addEventListener("change", (e) => send({ type: "body", name: e.target.value }));
  $("polyphony").addEventListener("change", (e) => send({ type: "polyphony", count: Number(e.target.value) }));
  $("velocity").addEventListener("input", (e) => ($("velocity-value").textContent = e.target.value));
  $("octave-down").addEventListener("click", () => shiftOctave(-1));
  $("octave-up").addEventListener("click", () => shiftOctave(1));
  const pedal = $("pedal");
  pedal.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    setPedal(values.get("action/pedal") >= 0.5 ? 0 : 1);
  });
  $("midi-input").addEventListener("change", (e) => {
    midi.input = e.target.value;
    bindMidiInputs();
  });
  $("midi-channel").addEventListener("change", (e) => (midi.channel = Number(e.target.value)));
  for (const b of document.querySelectorAll("[data-lang]")) {
    b.addEventListener("click", () => {
      lang = b.dataset.lang;
      try {
        localStorage.setItem("coopiano-lang", lang);
      } catch {
        // the choice is only kept for this page view
      }
      applyLanguage();
      labelComputerKeys();
    });
  }
}

// A handle for scripting the page from the browser console, e.g.
// coopiano.noteOn(60, 0.7); coopiano.noteOff(60); coopiano.set("reverb/mix", 0);
// coopiano.midi([0x90, 60, 100]) feeds a MIDI message as if from an input;
// coopiano.controls() lists the control keys and coopiano.get(key) reads one.
window.coopiano = {
  noteOn: (key, velocity = 0.6) => noteOn(key, velocity, "console"),
  noteOff: (key) => noteOff(key, "console"),
  set: (key, value) => setControl(key, value),
  get: (key) => values.get(key),
  controls: () => [...controlDefs.keys()],
  midi: (bytes) => onMidiMessage({ data: Uint8Array.from(bytes) }),
};

main().catch((error) => {
  console.error(error);
  $("status").textContent = String(error.message || error);
});

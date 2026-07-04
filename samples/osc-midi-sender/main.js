// OSC / MIDI Sender — outbound control built ENTIRELY from catalog nodes this app
// creates in its hidden scope. Demonstrates the modules.create / set / connect pattern
// for I/O nodes.
//
// Each lane wires a `float` node (value source) into an output node:
//   OSC:  float.Out --> OSCFloatOutput.In   (settable: currentOSCAddress)
//   MIDI: float.Out --> midi_output.Val      (settables: currentDeviceName/currentChannel/currentNumber)
//
// HOW EMISSION FIRES (verified against the module source, not assumed):
//   OSCFloatOutput sends only on its "In" float CHANGING (floatInput.OnFloatChanged);
//   midi_output sends on its "Val" float changing (or on a Trig edge). The `float` node
//   pushes its "Out" whenever currentValue changes. So writing the float node's
//   `currentValue` via modules.set propagates the new value across the wired edge and
//   the output node emits — no explicit trigger needed for a *changed* value.
//   CONSTRAINT: currentValue is a distinct-until-changed ReactiveProperty, so re-writing
//   the SAME value does NOT re-emit. The nodes' "Trigger"/"Trig" ports would force a
//   re-emit, but apiVersion 0 exposes no way to fire a trigger port from JS
//   (no modules.trigger). See the README "Honest limitations".
//
// RELOAD IDEMPOTENCY: modules.create is NOT keyed/get-or-create (SYNAPSE_API.md
//   "synapse.modules"). Unkeyed modules the app created are swept on reload, so each
//   boot() builds the chains fresh; only the user-facing SETTINGS (address/device/etc.)
//   are persisted, in synapse.storage. If a modules.set later hits `not_found` (our node
//   was swept mid-session), we rebuild that lane once and retry — the documented pattern.

const statusEl = document.querySelector('#status');
function status(value) {
  statusEl.textContent = typeof value === 'string'
    ? value
    : JSON.stringify(value && value.synapse ? value.synapse : value);
}

// Storage keys (synapse.storage is per-app, project-independent).
const STORE = {
  oscAddress: 'oscAddress',
  midiDevice: 'midiDevice',
  midiChannel: 'midiChannel',
  midiNumber: 'midiNumber'
};

const state = {
  osc: { floatId: null, outId: null },
  midi: { floatId: null, outId: null }
};

// ---- lane construction ----------------------------------------------------------------------
// Build a `float` source node wired into `outType` on `inputPort`. Returns the two moduleIds.
// modules.create({type}) → SynapseModule { moduleId, ... }  (SYNAPSE_API.md: synapse.modules).
// modules.connect is positional: (fromModuleId, fromPort, toModuleId, toPort)
// (synapse.d.ts SynapseModulesApi.connect; ports match by id or name — NODE_CATALOG.md ids).
async function buildLane(label, outType, inputPort) {
  const floatNode = await window.synapse.modules.create({ type: 'float', label: `${label} value` });
  const outNode = await window.synapse.modules.create({ type: outType, label });
  // float "Out" (FloatOutput) → output node input ("In" for OSC, "Val" for MIDI).
  await window.synapse.modules.connect(floatNode.moduleId, 'Out', outNode.moduleId, inputPort);
  return { floatId: floatNode.moduleId, outId: outNode.moduleId };
}

// ---- OSC lane -------------------------------------------------------------------------------
async function buildOscLane() {
  const lane = await buildLane('OSC Sender', 'OSCFloatOutput', 'In');
  state.osc = lane;
  // Apply the persisted / current address to the OSCFloatOutput node.
  // modules.set(moduleId, path, value); currentOSCAddress is a settable string
  // (NODE_CATALOG.md OSCFloatOutput row).
  await window.synapse.modules.set(lane.outId, 'currentOSCAddress', oscAddressEl.value);
  return lane;
}

// Send an OSC value: write the float node's currentValue; the wired edge carries it to
// OSCFloatOutput.In, which emits. currentValue is a settable float (NODE_CATALOG.md `float`).
async function sendOsc(value) {
  try {
    await window.synapse.modules.set(state.osc.floatId, 'currentValue', value);
  } catch (err) {
    if (err && err.synapse && err.synapse.code === 'not_found') {
      await buildOscLane();                                            // node swept — rebuild once
      await window.synapse.modules.set(state.osc.floatId, 'currentValue', value);
      return;
    }
    throw err;
  }
}

// ---- MIDI lane ------------------------------------------------------------------------------
async function buildMidiLane() {
  const lane = await buildLane('MIDI Sender', 'midi_output', 'Val');
  state.midi = lane;
  await applyMidiSettings(lane.outId);
  return lane;
}

// Push device/channel/number to the midi_output node.
// currentDeviceName(string) / currentChannel(int) / currentNumber(int) — NODE_CATALOG.md.
async function applyMidiSettings(outId) {
  await window.synapse.modules.set(outId, 'currentDeviceName', midiDeviceEl.value);
  await window.synapse.modules.set(outId, 'currentChannel', clampInt(midiChannelEl.value, 0, 15));
  await window.synapse.modules.set(outId, 'currentNumber', clampInt(midiNumberEl.value, 0, 127));
}

async function sendMidi(value) {
  try {
    await window.synapse.modules.set(state.midi.floatId, 'currentValue', value);
  } catch (err) {
    if (err && err.synapse && err.synapse.code === 'not_found') {
      await buildMidiLane();
      await window.synapse.modules.set(state.midi.floatId, 'currentValue', value);
      return;
    }
    throw err;
  }
}

// ---- helpers --------------------------------------------------------------------------------
function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

// Throttle a rapid stream (slider drag) to at most one bridge call per `ms`, and always
// deliver the final value. Keeps us off the "no per-frame JS control loops" rule while the
// slider still feels live.
function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  let pending = null;
  return (arg) => {
    pending = arg;
    const now = Date.now();
    const wait = ms - (now - last);
    if (wait <= 0) {
      last = now;
      fn(pending);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(pending);
      }, wait);
    }
  };
}

async function storeGet(key, fallback) {
  const r = await window.synapse.storage.get(key);
  return r && r.exists ? r.value : fallback;
}

// ---- DOM ------------------------------------------------------------------------------------
const oscAddressEl = document.querySelector('#oscAddress');
const oscValueEl = document.querySelector('#oscValue');
const oscValueLabel = document.querySelector('#oscValueLabel');
const midiDeviceEl = document.querySelector('#midiDevice');
const midiChannelEl = document.querySelector('#midiChannel');
const midiNumberEl = document.querySelector('#midiNumber');
const midiValueEl = document.querySelector('#midiValue');
const midiValueLabel = document.querySelector('#midiValueLabel');

// ---- boot -----------------------------------------------------------------------------------
async function boot() {
  const app = await SynapseSDK.connect();

  // Restore persisted settings into the fields BEFORE building the nodes, so the nodes are
  // created with the right address/device from the first frame.
  oscAddressEl.value = await storeGet(STORE.oscAddress, oscAddressEl.value);
  midiDeviceEl.value = await storeGet(STORE.midiDevice, '');
  midiChannelEl.value = await storeGet(STORE.midiChannel, midiChannelEl.value);
  midiNumberEl.value = await storeGet(STORE.midiNumber, midiNumberEl.value);
  oscValueLabel.textContent = Number(oscValueEl.value).toFixed(3);
  midiValueLabel.textContent = Number(midiValueEl.value).toFixed(3);

  await buildOscLane();
  await buildMidiLane();

  // --- OSC lane wiring ---
  oscAddressEl.addEventListener('change', async () => {
    await window.synapse.storage.set(STORE.oscAddress, oscAddressEl.value);
    await window.synapse.modules.set(state.osc.outId, 'currentOSCAddress', oscAddressEl.value);
    status(`OSC address set to ${oscAddressEl.value}`);
  });

  const sendOscThrottled = throttle((v) => sendOsc(v).catch(status), 60);
  oscValueEl.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    oscValueLabel.textContent = v.toFixed(3);
    sendOscThrottled(v);
  });

  // --- MIDI lane wiring ---
  midiDeviceEl.addEventListener('change', async () => {
    await window.synapse.storage.set(STORE.midiDevice, midiDeviceEl.value);
    await window.synapse.modules.set(state.midi.outId, 'currentDeviceName', midiDeviceEl.value);
    status(`MIDI device set to "${midiDeviceEl.value}"`);
  });
  midiChannelEl.addEventListener('change', async () => {
    const ch = clampInt(midiChannelEl.value, 0, 15);
    midiChannelEl.value = ch;
    await window.synapse.storage.set(STORE.midiChannel, ch);
    await window.synapse.modules.set(state.midi.outId, 'currentChannel', ch);
    status(`MIDI channel ${ch}`);
  });
  midiNumberEl.addEventListener('change', async () => {
    const num = clampInt(midiNumberEl.value, 0, 127);
    midiNumberEl.value = num;
    await window.synapse.storage.set(STORE.midiNumber, num);
    await window.synapse.modules.set(state.midi.outId, 'currentNumber', num);
    status(`MIDI CC number ${num}`);
  });

  const sendMidiThrottled = throttle((v) => sendMidi(v).catch(status), 60);
  midiValueEl.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    midiValueLabel.textContent = v.toFixed(3);
    sendMidiThrottled(v);
  });

  await app.ready();
  status('Ready. Nodes built in the app scope — move a slider to send.');
}

boot().catch(status);

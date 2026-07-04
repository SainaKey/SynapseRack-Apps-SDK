// Spout / NDI Bridge — external texture I/O in one panel.
//
// IN:   a SpoutReceiver and an NDIReceiver, created via synapse.modules.create (app-owned, living
//       in the app's hidden scope). Their source names are set with synapse.modules.set on the
//       catalog's settable members (SpoutReceiver.currentSourceName, NDIReceiver.currentNDIName).
// MIX:  a keyed render.createStack composites the two receiver outputs; receiver outputs are wired
//       into the stack's input ports with synapse.modules.connect.
// OUT:  the stack output is published three ways — MediaOut (output.publish), Spout/Syphon
//       (output.publishSpout), and an NDISender (modules.create + modules.connect, send name via
//       modules.set on NDISender.currentSendNDIName).
//
// v0 constraints baked into the design (see README):
//  - No source-enumeration API: the user TYPES the Spout/NDI source name. Placeholders say so.
//  - No JS read-back of a receiver's live external value: modules.get returns module METADATA
//    (ports/type), not "is this Spout source currently connected". We surface what we SET, not what
//    the host resolved.
//  - modules.connect / modules.set take POSITIONAL args (per synapse.d.ts + SYNAPSE_API.md table),
//    NOT the object form shown in NODE_CATALOG.md's "How to use". See README "Deviations".

// ---- catalog rows used verbatim (NODE_CATALOG.md) ---------------------------------------------
// SpoutReceiver : out "RenderTexture Output"(RenderTexture) ; settable currentSourceName(string)
// NDIReceiver   : out "RenderTexture Output"(RenderTexture) ; settable currentNDIName(string)
// NDISender     : in  "RenderTexture Input"(RenderTexture)  ; settable currentSendNDIName(string)
// AppStackMixer : in  "Texture 1".."Texture 8"(RenderTexture) ; out "Out"(RenderTexture)
const SPOUT_RECEIVER_OUT = 'RenderTexture Output';
const NDI_RECEIVER_OUT = 'RenderTexture Output';
const NDI_SENDER_IN = 'RenderTexture Input';
const STACK_SLOT0_IN = 'Texture 1'; // stack slot 0 (bottom) = Spout
const STACK_SLOT1_IN = 'Texture 2'; // stack slot 1 (top)    = NDI
const STACK_OUT = 'Out';

// storage keys (per-app, project-independent — the last-typed names follow the app)
const K_SPOUT_SRC = 'spout-ndi-bridge.spoutSource';
const K_NDI_SRC = 'spout-ndi-bridge.ndiSource';
const K_NDI_SEND = 'spout-ndi-bridge.ndiSendName';

const log = document.querySelector('#log');
function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

const state = {
  spoutRx: null,   // SynapseModule (SpoutReceiver)
  ndiRx: null,     // SynapseModule (NDIReceiver)
  ndiTx: null,     // SynapseModule (NDISender)
  stack: null      // stack handle from render.createStack
};

// Wire a text input so its value applies on Enter or the sibling Apply button (never per-keystroke —
// no bridge call fires while typing). `apply(name)` performs the single modules.set + storage.set.
function wireNameField(slotId, apply) {
  const slot = document.querySelector(slotId);
  const input = slot.querySelector('.src');
  const button = slot.querySelector('.apply');

  async function commit() {
    const name = input.value.trim();
    try {
      await apply(name);
      write(`${slotId}: source set to "${name}"`);
    } catch (error) {
      // Surface the structured host error; never swallow it.
      write(error && error.synapse ? JSON.stringify(error.synapse) : String(error));
    }
  }

  button.addEventListener('click', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
  return input;
}

// ---- boot --------------------------------------------------------------------------------------
async function boot() {
  const app = await SynapseSDK.connect();

  // IN — create the two receivers. modules.create is NOT keyed/get-or-create (SYNAPSE_API.md:
  // "calling modules.create twice makes two modules"), so we create them exactly once here and
  // track the returned moduleId ourselves; app.ready()'s reconciliation cleans up on reload.
  state.spoutRx = await window.synapse.modules.create({ type: 'SpoutReceiver', label: 'Bridge Spout In' });
  state.ndiRx = await window.synapse.modules.create({ type: 'NDIReceiver', label: 'Bridge NDI In' });

  // MIX — keyed stack (get-or-create): slot 0 (bottom) = Spout, slot 1 (top) = NDI. We hand the
  // receiver outputs as this stack's inputs by textureId. The stack's own .output textureId is the
  // composite fed to every output below.
  state.stack = await window.synapse.render.createStack({
    id: 'bridge-stack',
    inputs: [
      { source: state.spoutRx.output, opacity: 1 }, // slot 0, bottom = Spout
      { source: state.ndiRx.output, opacity: 1 }    // slot 1, top    = NDI
    ]
  });

  // The docs describe two ways to feed the stack's slots: pass receiver outputs as `inputs` above
  // (a stack `source` accepts ANY textureId — including a modules.create receiver output), OR wire
  // them explicitly with modules.connect. We ALSO wire explicitly here to match the brief and to be
  // robust if a receiver's textureId is not resolvable as a stack input on some hosts. Re-wiring the
  // same edge is idempotent. modules.connect is POSITIONAL: (fromModuleId, fromPort, toModuleId, toPort).
  await window.synapse.modules.connect(
    state.spoutRx.moduleId, SPOUT_RECEIVER_OUT, state.stack.moduleId, STACK_SLOT0_IN
  );
  await window.synapse.modules.connect(
    state.ndiRx.moduleId, NDI_RECEIVER_OUT, state.stack.moduleId, STACK_SLOT1_IN
  );

  // OUT #1 — MediaOut "Bridge" (keyed id → survives reloads / project round-trips + user wiring).
  await window.synapse.output.publish({
    id: 'bridge-mediaout', source: state.stack.output, name: 'Bridge'
  });

  // OUT #2 — Spout/Syphon "Bridge". publishSpout is the documented alias of publishSyphon
  // (SYNAPSE_API.md synapse.output: "output.publishSpout … alias of publishSyphon").
  const spoutOut = await window.synapse.output.publishSpout({
    id: 'bridge-spoutout', source: state.stack.output, name: 'Bridge'
  });
  document.querySelector('#spoutOutStatus').textContent =
    spoutOut.protocol === 'Unsupported'
      ? 'not available on this platform'
      : `publishing as ${spoutOut.protocol} "${spoutOut.serverName || 'Bridge'}"`;

  // OUT #3 — NDISender, created + wired from the stack output. Also not keyed (modules.create), so
  // created once here. Wire stack.output → NDISender input; send name set below on restore/apply.
  state.ndiTx = await window.synapse.modules.create({ type: 'NDISender', label: 'Bridge NDI Out' });
  await window.synapse.modules.connect(
    state.stack.moduleId, STACK_OUT, state.ndiTx.moduleId, NDI_SENDER_IN
  );

  // In-app previews of the two receiver inputs and the composite (click-through — these textures
  // have no owning webview, so pointer:'passthrough' is explicit per the surface docs).
  await window.synapse.surface.attach('#spoutIn .preview', {
    surfaceId: 'spout-in-preview', type: 'texture', textureId: state.spoutRx.output, pointer: 'passthrough'
  });
  await window.synapse.surface.attach('#ndiIn .preview', {
    surfaceId: 'ndi-in-preview', type: 'texture', textureId: state.ndiRx.output, pointer: 'passthrough'
  });
  await window.synapse.surface.attach('#stackPreview', {
    surfaceId: 'stack-preview', type: 'texture', textureId: state.stack.output, pointer: 'passthrough'
  });

  // ---- wire the name fields (apply on Enter / button; one modules.set + storage.set per commit) ----
  const spoutInput = wireNameField('#spoutIn', async (name) => {
    await window.synapse.modules.set(state.spoutRx.moduleId, 'currentSourceName', name);
    await window.synapse.storage.set(K_SPOUT_SRC, name);
  });
  const ndiInput = wireNameField('#ndiIn', async (name) => {
    await window.synapse.modules.set(state.ndiRx.moduleId, 'currentNDIName', name);
    await window.synapse.storage.set(K_NDI_SRC, name);
  });
  const ndiSendInput = wireNameField('#ndiOut', async (name) => {
    await window.synapse.modules.set(state.ndiTx.moduleId, 'currentSendNDIName', name);
    await window.synapse.storage.set(K_NDI_SEND, name);
  });

  // ---- per-slot opacity sliders via the stack handle ----
  wireOpacity('#spoutIn', 0);
  wireOpacity('#ndiIn', 1);

  // ---- restore persisted names from synapse.storage and apply them to the live modules ----
  await restoreName(K_SPOUT_SRC, spoutInput, (n) =>
    window.synapse.modules.set(state.spoutRx.moduleId, 'currentSourceName', n));
  await restoreName(K_NDI_SRC, ndiInput, (n) =>
    window.synapse.modules.set(state.ndiRx.moduleId, 'currentNDIName', n));
  // NDI send name defaults to the field's markup value; persist/apply whatever is restored-or-default.
  await restoreName(K_NDI_SEND, ndiSendInput, (n) =>
    window.synapse.modules.set(state.ndiTx.moduleId, 'currentSendNDIName', n));
  await window.synapse.modules.set(
    state.ndiTx.moduleId, 'currentSendNDIName', ndiSendInput.value.trim()
  );

  await app.ready();
  write('Ready. Type the exact Spout/NDI source names, then Apply. ' +
        'Composite publishes as MediaOut / Spout·Syphon / NDI "Bridge".');
}

// A per-slot opacity slider drives stack.setInput(index, {opacity}) — a discrete change event, never
// per-frame. (Continuous modulation would be a host-side binding on opacity{index+1}; not used here.)
function wireOpacity(slotId, index) {
  const slider = document.querySelector(`${slotId} .opacity`);
  if (!slider) return;
  slider.addEventListener('change', async (e) => {
    try {
      await state.stack.setInput(index, { opacity: Number(e.target.value) });
    } catch (error) {
      write(error && error.synapse ? JSON.stringify(error.synapse) : String(error));
    }
  });
}

// Restore a stored name into an input and push it to the live module (only when a value exists).
async function restoreName(key, input, applyToModule) {
  const stored = await window.synapse.storage.get(key);
  if (stored.exists && typeof stored.value === 'string' && stored.value) {
    input.value = stored.value;
    await applyToModule(stored.value);
  }
}

boot().catch((error) => write(String(error && error.synapse ? JSON.stringify(error.synapse) : error)));

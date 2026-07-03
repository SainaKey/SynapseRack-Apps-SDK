// Control Surface — a performance panel for the user's EXISTING layers.
// It enumerates the visible layer stack (synapse.layers.list) and renders one strip per
// layer; a fader writes the layer live via the documented per-layer setters. It creates
// nothing on the canvas — the ground truth is the live layer state, so initial fader
// positions are read FROM the layers API, and nothing is persisted.
//
// No per-layer host bindings (MIDI/LFO): a visible layer exposes no moduleId and layer
// properties are not documented {moduleId, path} binding targets in v0 — see README.

const log = document.querySelector('#log');
function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

const stripsEl = document.querySelector('#strips');
const emptyEl = document.querySelector('#empty');
const template = document.querySelector('#stripTemplate');

// Throttle: a dragged slider fires many `input` events; the bridge is not a per-frame loop.
// Coalesce to ~30 Hz per target and always flush the final value on `change` (drag end).
function makeThrottle(intervalMs) {
  let pending = null;   // latest fn to run
  let timer = null;
  const flush = () => {
    timer = null;
    if (pending) { const fn = pending; pending = null; fn(); schedule(); }
  };
  const schedule = () => { if (!timer) timer = setTimeout(flush, intervalMs); };
  return {
    push(fn) { pending = fn; schedule(); },
    // Cancel any queued call and run `fn` now (for the definitive change-event write).
    final(fn) { pending = null; if (timer) { clearTimeout(timer); timer = null; } fn(); }
  };
}

// ---- strip ----
// Each strip binds to a layer id. Every fader write is a discrete setter call; the setter
// resolves to the updated SynapseLayer, which we do not re-read (the fader IS the intent).
function buildStrip(layer) {
  const node = template.content.firstElementChild.cloneNode(true);
  const el = {
    name: node.querySelector('.name'),
    badge: node.querySelector('.badge'),
    opacity: node.querySelector('.opacity'),
    opacityVal: node.querySelector('.opacity-val'),
    rotz: node.querySelector('.rotz'),
    rotzVal: node.querySelector('.rotz-val')
  };

  el.name.textContent = layer.name || layer.id;
  el.badge.textContent = layer.type ? String(layer.type).toUpperCase() : '';

  // Initial fader positions come from the live layer (ground truth), not stored state.
  const opacity = typeof layer.opacity === 'number' ? layer.opacity : 1;
  const rotz = layer.rotation && typeof layer.rotation.z === 'number' ? layer.rotation.z : 0;
  el.opacity.value = String(opacity);
  el.opacityVal.textContent = opacity.toFixed(2);
  el.rotz.value = String(Math.round(rotz));
  el.rotzVal.textContent = `${Math.round(rotz)}°`;

  const opacityThrottle = makeThrottle(33);
  const rotzThrottle = makeThrottle(33);

  el.opacity.addEventListener('input', (e) => {
    const value = Number(e.target.value);
    el.opacityVal.textContent = value.toFixed(2);
    opacityThrottle.push(() => setOpacity(layer.id, value));
  });
  el.opacity.addEventListener('change', (e) => {
    const value = Number(e.target.value);
    opacityThrottle.final(() => setOpacity(layer.id, value));
  });

  el.rotz.addEventListener('input', (e) => {
    const value = Number(e.target.value);
    el.rotzVal.textContent = `${Math.round(value)}°`;
    rotzThrottle.push(() => setRotationZ(layer.id, value));
  });
  el.rotz.addEventListener('change', (e) => {
    const value = Number(e.target.value);
    rotzThrottle.final(() => setRotationZ(layer.id, value));
  });

  return node;
}

async function setOpacity(layerId, value) {
  try {
    await window.synapse.layers.setOpacity(layerId, value);
  } catch (error) {
    write(error && error.synapse ? error.synapse : String(error));
  }
}

async function setRotationZ(layerId, value) {
  try {
    await window.synapse.layers.setRotationZ(layerId, value);
  } catch (error) {
    write(error && error.synapse ? error.synapse : String(error));
  }
}

// ---- enumeration ----
// (Re-)build the whole panel from layers.list(). No documented layer-change event exists in
// v0, so re-enumeration is manual (the Refresh button); if one is added, subscribe here too.
async function enumerateLayers() {
  const layers = await window.synapse.layers.list();
  stripsEl.replaceChildren();

  if (!layers || layers.length === 0) {
    emptyEl.hidden = false;
    write('No layers found. Add a layer in SynapseRack, then Refresh.');
    return;
  }

  emptyEl.hidden = true;
  for (const layer of layers) {
    if (!layer || layer.exists === false) continue; // list() only returns real layers, but be defensive.
    stripsEl.appendChild(buildStrip(layer));
  }
  write(`${layers.length} layer${layers.length === 1 ? '' : 's'} — move a fader to drive one live.`);
}

// ---- boot ----
async function boot() {
  // connect() waits for window.synapse and pings once. We use no SDK-created resources (this
  // app creates nothing), but keeping the SDK connect keeps house style + gives us app.ready.
  const app = await SynapseSDK.connect();

  document.querySelector('#refresh').addEventListener('click', () => {
    enumerateLayers().catch((error) => write(error && error.synapse ? error.synapse : String(error)));
  });

  await enumerateLayers(); // zero layers is a valid ready state — empty message already shown.

  await app.ready();
}

boot().catch((error) => write(error && error.synapse ? JSON.stringify(error.synapse) : String(error)));

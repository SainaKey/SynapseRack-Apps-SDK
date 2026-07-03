// VJ Notepad — one keyed text overlay (render.createText) published once as a "Notepad" MediaOut.
// Type → Enter/Send calls text.set/setText; style sliders map to the documented setter shape
// (size → number, <input type=color> hex → color:{r,g,b,a} 0..1, align → 'left'|'center'|'right').
// All bridge traffic is discrete (Enter, button, slider change) — never per-keystroke, never per-frame.

const log = document.querySelector('#log');
function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// Presets persist in synapse.storage under this single key (a JSON array of PRESET_COUNT slots).
// storage is project-independent, so a saved preset bank follows the app into any project.
const PRESETS_KEY = 'vj-notepad.presets';
const PRESET_COUNT = 8;

const el = {
  text: document.querySelector('#text'),
  send: document.querySelector('#send'),
  flash: document.querySelector('#flash'),
  clear: document.querySelector('#clear'),
  size: document.querySelector('#size'),
  sizeVal: document.querySelector('#sizeVal'),
  color: document.querySelector('#color'),
  flashSecs: document.querySelector('#flashSecs'),
  flashSecsVal: document.querySelector('#flashSecsVal'),
  flashSecsLabel: document.querySelector('#flashSecsLabel'),
  alignBtns: Array.from(document.querySelectorAll('.align-btn')),
  bank: document.querySelector('#presetBank')
};

// Live UI style state, mirrored into every text.set call.
const style = { size: 120, color: '#ffffff', align: 'center' };

const state = { overlay: null, presets: [], flashTimer: null };

// ---- color mapping ----
// The docs: render.createText color is "{r,g,b,a}" with "Colors are 0..1 per channel".
// Map an <input type="color"> "#rrggbb" hex to that shape (alpha stays 1 — opaque overlay).
function hexToColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
}

// ---- overlay writes (discrete only) ----
// setText is doc'd sugar for set({text}); set({size,color,align}) writes size/color/align in one
// re-render. We push the full current style on send so a slot fired before a send still looks right.
async function pushText(text) {
  if (!state.overlay) return;
  await state.overlay.set({
    text,
    size: style.size,
    color: hexToColor(style.color),
    align: style.align
  });
}

async function sendCurrent() {
  clearFlash();
  await pushText(el.text.value);
  write(el.text.value ? `sent: ${el.text.value}` : 'sent: (empty)');
}

async function clearOverlay() {
  clearFlash();
  el.text.value = '';
  await pushText('');            // empty string = blank transparent overlay
  write('cleared');
}

function clearFlash() {
  if (state.flashTimer) { clearTimeout(state.flashTimer); state.flashTimer = null; }
}

// Flash mode: page-side setTimeout only (no host timers) — show, then blank after N seconds.
async function flashCurrent() {
  clearFlash();
  const text = el.text.value;
  await pushText(text);
  const secs = Number(el.flashSecs.value);
  write(`flashing ${secs}s: ${text || '(empty)'}`);
  state.flashTimer = setTimeout(() => { state.flashTimer = null; pushText(''); }, secs * 1000);
}

// ---- style controls ----
// Sliders fire on 'change' (discrete: pointer release / commit), not 'input' per drag-tick.
function setupStyleControls() {
  el.sizeVal.textContent = String(style.size);
  el.size.addEventListener('input', () => { el.sizeVal.textContent = el.size.value; });
  el.size.addEventListener('change', async () => {
    style.size = Number(el.size.value);
    if (state.overlay) await state.overlay.set({ size: style.size });
  });

  el.color.addEventListener('change', async () => {
    style.color = el.color.value;
    if (state.overlay) await state.overlay.set({ color: hexToColor(style.color) });
  });

  el.alignBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      style.align = btn.dataset.align;    // 'left' | 'center' | 'right' — exactly the doc'd names
      el.alignBtns.forEach((b) => b.classList.toggle('active', b === btn));
      if (state.overlay) await state.overlay.set({ align: style.align });
    });
  });

  const updateFlashLabel = () => {
    el.flashSecsVal.textContent = `${el.flashSecs.value}s`;
    el.flashSecsLabel.textContent = `${el.flashSecs.value}s`;
  };
  el.flashSecs.addEventListener('input', updateFlashLabel);
  updateFlashLabel();
}

function applyStyleToUI() {
  el.size.value = String(style.size);
  el.sizeVal.textContent = String(style.size);
  el.color.value = style.color;
  el.alignBtns.forEach((b) => b.classList.toggle('active', b.dataset.align === style.align));
}

// ---- preset bank ----
// Each slot holds { text, size, color, align }. Click fires it live (the performance action);
// Shift+click saves the current composer text + style into that slot and persists the whole bank.
function renderBank() {
  el.bank.innerHTML = '';
  for (let i = 0; i < PRESET_COUNT; i++) {
    const preset = state.presets[i];
    const btn = document.createElement('button');
    btn.className = 'preset' + (preset ? ' filled' : '');
    btn.type = 'button';
    btn.dataset.index = String(i);
    btn.title = preset ? `Fire "${preset.text}" · Shift+click to overwrite` : 'Shift+click to save current';
    btn.innerHTML = preset
      ? `<span class="preset-num">${i + 1}</span><span class="preset-text">${escapeHtml(preset.text) || '(empty)'}</span>`
      : `<span class="preset-num">${i + 1}</span><span class="preset-text empty">empty</span>`;
    btn.addEventListener('click', (e) => (e.shiftKey ? savePreset(i) : firePreset(i)));
    el.bank.appendChild(btn);
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function savePreset(i) {
  state.presets[i] = {
    text: el.text.value,
    size: style.size,
    color: style.color,
    align: style.align
  };
  renderBank();
  await window.synapse.storage.set(PRESETS_KEY, state.presets);
  write(`saved preset ${i + 1}`);
}

async function firePreset(i) {
  const preset = state.presets[i];
  if (!preset) { write(`preset ${i + 1} is empty — Shift+click to save`); return; }
  // Adopt the slot's style so a later manual send stays consistent, then push it live.
  style.size = preset.size;
  style.color = preset.color;
  style.align = preset.align;
  el.text.value = preset.text;
  applyStyleToUI();
  clearFlash();
  await pushText(preset.text);
  write(`fired preset ${i + 1}: ${preset.text || '(empty)'}`);
}

async function loadPresets() {
  const { value, exists } = await window.synapse.storage.get(PRESETS_KEY);
  state.presets = exists && Array.isArray(value) ? value.slice(0, PRESET_COUNT) : [];
  renderBank();
}

// ---- boot ----
async function boot() {
  const app = await SynapseSDK.connect();

  setupStyleControls();

  // The one keyed overlay. Explicit id 'notepad' → get-or-create, so a hot reload reconciles the
  // SAME AppTextRender module + output textureId, and the user's wiring into the Notepad MediaOut
  // survives. Fixed 1080p so the published source is a clean 16:9 regardless of project resolution.
  const overlay = await window.synapse.render.createText({
    id: 'notepad',
    text: '',
    size: style.size,
    color: hexToColor(style.color),
    align: style.align,
    width: 1920,
    height: 1080
  });
  state.overlay = overlay;

  // Publish once with a stable id so the MediaOut node (and downstream user wiring) is reload-stable.
  await window.synapse.output.publish({ id: 'notepad-out', source: overlay.output, name: 'Notepad' });

  // Enter sends, Shift+Enter is a literal newline in the overlay text.
  el.text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
  });
  el.send.addEventListener('click', sendCurrent);
  el.clear.addEventListener('click', clearOverlay);
  el.flash.addEventListener('click', flashCurrent);

  await loadPresets();

  await app.ready();            // once, after overlay + publish are wired
  write('Ready. Type a message and Send — output is MediaOut "Notepad". Shift+click a slot to save.');
}

boot().catch((error) => write(String(error && error.synapse ? JSON.stringify(error.synapse) : error)));

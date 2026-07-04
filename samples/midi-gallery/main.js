// MIDI Gallery — a control-surface benchmark for the MIDI learn system.
//
// 42 controls across six layouts (button row / toggle grid / vertical fader strip / dense trim
// rows / rotary knob row / 4x4 pad grid), every one always MIDI-learnable with an anchored
// in-page learn overlay — no arm buttons anywhere. Two wiring patterns on display:
//
//   AUTO   controls.register({ midi: true, anchor: el })  — zero extra code (transport/toggles/pads)
//   MANUAL bindings.midi(...) + bindings.badge(handle)    — when you want the badge (mixer/trims)
//
// What to benchmark in SR's learn mode: all overlays land exactly on their controls, stay glued
// through page scroll / window drag / resize, click-to-select works per control, and assignments
// show up in badges and the header counter (via the bridge's synapse:midi-* window events).

const log = document.querySelector('#log');
const write = (msg) => { log.textContent = String(msg); };

const mappedTargets = new Set();
let totalControls = 0;

function refreshStats() {
  document.querySelector('#statTotal').textContent = String(totalControls);
  document.querySelector('#statMapped').textContent = String(mappedTargets.size);
}

// ---- control builders ---------------------------------------------------------------------------

// Momentary: press = 1, release = 0. A mapped NoteOn drives the value with its velocity and the
// host routes NoteOff back to 0, so hardware pads behave exactly like the on-screen button.
async function makeMomentary(container, id, label) {
  const el = document.createElement('button');
  el.innerHTML = '<span>' + label + '</span>';
  container.appendChild(el);

  const ctl = await window.synapse.controls.register({
    id, label, type: 'float', min: 0, max: 1, value: 0, midi: true, anchor: el
  });
  ctl.onChange((v) => {
    const value = Number(v) || 0;
    el.classList.toggle('on', value > 0);
    el.style.setProperty('--vel', value);
  });

  el.addEventListener('pointerdown', () => ctl.setValue(1));
  el.addEventListener('pointerup', () => ctl.setValue(0));
  el.addEventListener('pointerleave', () => { if (el.classList.contains('on')) ctl.setValue(0); });
  totalControls++;
}

// Latching toggle, displayed as value >= 0.5. Clicking flips it; a mapped CC acts as a threshold
// switch (fader up = on). Deliberately simple — latching from momentary notes is app policy.
async function makeToggle(container, id, label) {
  const el = document.createElement('div');
  el.className = 'toggle';
  el.innerHTML = '<span class="lamp"></span><span class="t-label">' + label + '</span>';
  container.appendChild(el);

  const ctl = await window.synapse.controls.register({
    id, label, type: 'float', min: 0, max: 1, value: 0, midi: true, anchor: el
  });
  ctl.onChange((v) => el.classList.toggle('on', (Number(v) || 0) >= 0.5));
  el.addEventListener('click', () => ctl.setValue(el.classList.contains('on') ? 0 : 1));
  totalControls++;
}

// Manual pattern: register the control, arm the binding explicitly (same keyed id the auto path
// would use), then place a badge that shows MIDI / the learned signal.
async function makeSlider(rootEl, input, badgeHost, valueEl, id, label) {
  const ctl = await window.synapse.controls.register({
    id, label, type: 'float', min: 0, max: 1, value: Number(input.value)
  });
  const handle = await window.synapse.bindings.midi({
    id: 'midi:control:' + id, target: { controlId: id }, min: 0, max: 1, anchor: input
  });
  window.synapse.bindings.badge(handle, badgeHost);

  ctl.onChange((v) => {
    const value = Number(v) || 0;
    input.value = value;
    if (valueEl) valueEl.textContent = value.toFixed(2);
  });
  input.addEventListener('input', (e) => ctl.setValue(Number(e.target.value)));
  totalControls++;
}

async function makeChannel(container, id, label) {
  const el = document.createElement('div');
  el.className = 'channel';
  el.innerHTML =
    '<span class="badge-host"></span>' +
    '<input type="range" min="0" max="1" step="0.01" value="0.5">' +
    '<span class="ch-label">' + label + '</span>' +
    '<span class="val">0.50</span>';
  container.appendChild(el);
  await makeSlider(el, el.querySelector('input'), el.querySelector('.badge-host'), el.querySelector('.val'), id, label);
}

async function makeTrim(container, id, label) {
  const el = document.createElement('div');
  el.className = 'trim';
  el.innerHTML =
    '<span class="t-name">' + label + '</span>' +
    '<input type="range" min="0" max="1" step="0.01" value="0.5">' +
    '<span class="badge-host"></span>';
  container.appendChild(el);
  await makeSlider(el, el.querySelector('input'), el.querySelector('.badge-host'), null, id, label);
}

// Rotary knob — SAME wiring as a slider (control + explicit binding + badge), different skin.
// Drag vertically to change; value 0..1 maps to a 270° sweep. The knob div itself is the anchor,
// so in learn mode the overlay is a circle-sized square right on the knob.
async function makeKnob(container, id, label) {
  const el = document.createElement('div');
  el.className = 'knob-unit';
  el.innerHTML =
    '<div class="knob"><span class="needle"></span></div>' +
    '<span class="k-label">' + label + '</span>' +
    '<span class="val">0.50</span>' +
    '<span class="badge-host"></span>';
  container.appendChild(el);
  const knob = el.querySelector('.knob');
  const valueEl = el.querySelector('.val');

  const ctl = await window.synapse.controls.register({
    id, label, type: 'float', min: 0, max: 1, value: 0.5
  });
  const handle = await window.synapse.bindings.midi({
    id: 'midi:control:' + id, target: { controlId: id }, min: 0, max: 1, anchor: knob
  });
  window.synapse.bindings.badge(handle, el.querySelector('.badge-host'));

  let shown = 0.5;
  const paint = (v) => {
    shown = Math.max(0, Math.min(1, Number(v) || 0));
    knob.style.setProperty('--v', shown);
    knob.style.setProperty('--angle', (45 + shown * 270) + 'deg');
    valueEl.textContent = shown.toFixed(2);
  };
  ctl.onChange(paint);
  paint(0.5);

  // Vertical drag: full travel over ~150px, pointer capture so it keeps tracking off-element.
  let dragStartY = 0;
  let dragStartValue = 0;
  knob.addEventListener('pointerdown', (e) => {
    dragStartY = e.clientY;
    dragStartValue = shown;
    knob.setPointerCapture(e.pointerId);
  });
  knob.addEventListener('pointermove', (e) => {
    if (!knob.hasPointerCapture(e.pointerId)) return;
    const next = Math.max(0, Math.min(1, dragStartValue + (dragStartY - e.clientY) / 150));
    if (next !== shown) ctl.setValue(next);
  });
  totalControls++;
}

async function makePad(container, id, label) {
  const el = document.createElement('div');
  el.className = 'pad';
  el.innerHTML = '<span>' + label + '</span>';
  container.appendChild(el);

  const ctl = await window.synapse.controls.register({
    id, label, type: 'float', min: 0, max: 1, value: 0, midi: true, anchor: el
  });
  ctl.onChange((v) => {
    const value = Number(v) || 0;
    el.classList.toggle('on', value > 0);
    el.style.setProperty('--vel', value);
  });
  el.addEventListener('pointerdown', () => ctl.setValue(1));
  el.addEventListener('pointerup', () => ctl.setValue(0));
  el.addEventListener('pointerleave', () => { if (el.classList.contains('on')) ctl.setValue(0); });
  totalControls++;
}

// ---- boot ----------------------------------------------------------------------------------------

async function boot() {
  await SynapseSDK.connect();

  // Bridge events: learn-mode banner + live "assigned" counter. midi.mapped carries the targetId of
  // any binding that gained/lost a mapping; we count the ones belonging to this app.
  window.addEventListener('synapse:midi-learn', (e) => {
    document.querySelector('#learnBanner').classList.toggle('on', !!e.detail.active);
  });
  window.addEventListener('synapse:midi-mapped', (e) => {
    if (e.detail.removed) mappedTargets.delete(e.detail.targetId);
    else mappedTargets.add(e.detail.targetId);
    refreshStats();
  });

  const transport = document.querySelector('#transport');
  await makeMomentary(transport, 'play', 'PLAY');
  await makeMomentary(transport, 'stop', 'STOP');
  await makeMomentary(transport, 'cue-a', 'CUE A');
  await makeMomentary(transport, 'cue-b', 'CUE B');

  const toggles = document.querySelector('#toggles');
  for (let i = 1; i <= 8; i++) {
    await makeToggle(toggles, 'toggle-' + i, 'FX ' + i);
  }

  const mixer = document.querySelector('#mixer');
  const channels = ['KICK', 'BASS', 'SYNTH', 'VOX', 'FX', 'MASTER'];
  for (let i = 0; i < channels.length; i++) {
    await makeChannel(mixer, 'ch-' + (i + 1), channels[i]);
  }

  const trims = document.querySelector('#trims');
  const trimNames = ['Hue', 'Zoom', 'Blur', 'Gain'];
  for (let i = 0; i < trimNames.length; i++) {
    await makeTrim(trims, 'trim-' + (i + 1), trimNames[i]);
  }

  const knobs = document.querySelector('#knobs');
  const knobNames = ['DRY/WET', 'FEEDBACK', 'RATE', 'DEPTH'];
  for (let i = 0; i < knobNames.length; i++) {
    await makeKnob(knobs, 'knob-' + (i + 1), knobNames[i]);
  }

  const pads = document.querySelector('#pads');
  for (let i = 1; i <= 16; i++) {
    await makePad(pads, 'pad-' + i, String(i));
  }

  refreshStats();
  await window.synapse.app.ready();
  write('Ready: ' + totalControls + ' controls armed. Enter MIDI-learn mode in SynapseRack and every ' +
        'control lights up in place. Scroll and resize while learn mode is on — overlays must stay glued.');
}

boot().catch((error) => write(String(error && error.synapse ? JSON.stringify(error.synapse) : error)));

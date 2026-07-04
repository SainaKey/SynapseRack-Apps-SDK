// Reactive Pad — a performance surface that makes INPUTS visible.
//
// Visual core: a stack (render.createStack) with two slots published to MediaOut:
//   slot 0 (bottom) = an animated background child web window (web.createWindow),
//   slot 1 (top)    = a "REACTIVE" text layer (render.createText).
// MIDI and audio drive things you can SEE in the published pixels — there is no value
// read-back in v0, so the moving output IS the display. All continuous modulation runs
// HOST-SIDE via synapse.bindings.* against bindable module members; JS never runs a
// per-frame bridge loop. The background canvas animates page-locally in its own window.
//
// Three MIDI-learnable / audio-followable parameters:
//   1. Text size    -> text.fontSize        (bindable float member of AppTextRender)
//   2. Word opacity -> stack.opacity2       (bindable float member of AppStackMixer, slot 1 = text)
//   3. Pulse glow   -> a registered control, whose onChange drives a page-local canvas glow
//                      in the background window (the child window owns the control + visuals).

const OUT_W = 1280;
const OUT_H = 720;
const STORE_KEY = 'reactivePad.bindings';   // which binding kind each parameter uses
const PULSE_CONTROL_ID = 'reactive-pulse';  // control lives in the BACKGROUND child window

// Bindable member paths, proven bindable in SYNAPSE_API.md:
//   fontSize  — "Bindable member paths ... fontSize (float-writable)"  (Text render section)
//   opacity2  — "Bindable member paths ... opacity1..opacity8 (float-writable)" (Stack mixer);
//               slot index 1 (text) maps to member opacity2.
const FONT_MIN = 40, FONT_MAX = 260;   // px range the text size sweeps between
const OPACITY_MIN = 0.15, OPACITY_MAX = 1.0;

const log = document.querySelector('#log');
function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// Persisted record of which binding kind ('midi' | 'audio' | 'none') each parameter uses,
// and the selected audio band. Project-independent presets, via synapse.storage.
const bindingState = { font: 'none', opacity: 'none', pulse: 'none', fontBand: 'audio.bass', opacityBand: 'audio.level' };

async function loadBindingState() {
  try {
    const r = await window.synapse.storage.get(STORE_KEY);
    if (r && r.exists && r.value) Object.assign(bindingState, r.value);
  } catch (e) { /* first run / unavailable — keep defaults */ }
}
async function saveBindingState() {
  try { await window.synapse.storage.set(STORE_KEY, bindingState); }
  catch (e) { write('could not persist bindings: ' + (e && e.message ? e.message : e)); }
}

// The background window's page. Self-contained and page-local: it renders an animated
// gradient/pulse on a canvas with requestAnimationFrame (zero bridge traffic per frame),
// and registers the PULSE control in its OWN bridge so control.onChange drives the glow
// directly — no cross-window per-frame calls. A MIDI binding on that control (armed here,
// in the same window that owns the control) routes an assigned CC through the control, so
// its onChange fires and the glow reacts. Control registries are per-window in v0, so the
// control, its MIDI binding, and its onChange all live together here.
function backgroundWindowHtml(controlId) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#05060a;overflow:hidden;}
    #bg{display:block;width:100%;height:100%;}
  </style></head><body>
    <canvas id="bg"></canvas>
    <script>
    (function(){
      const CONTROL_ID=${JSON.stringify(controlId)};
      const cv=document.getElementById('bg');
      const ctx=cv.getContext('2d',{alpha:false});
      cv.width=${OUT_W};cv.height=${OUT_H};
      // pulse: 0..1, driven by the control's onChange (MIDI or setValue). Page-local rAF
      // eases the drawn glow toward it — no bridge call per frame.
      let pulseTarget=0, pulse=0, t=0;

      function draw(){
        t+=0.008;
        pulse+=(pulseTarget-pulse)*0.12;
        const w=cv.width,h=cv.height;
        // slow drifting radial gradient; brightness scales with the pulse value
        const cx=w*(0.5+0.18*Math.sin(t*0.7));
        const cy=h*(0.5+0.18*Math.cos(t*0.9));
        const base=18+pulse*90;
        const g=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(w,h)*0.7);
        g.addColorStop(0,'rgb('+Math.round(base*0.4)+','+Math.round(base*0.9)+','+Math.round(base*1.6%256)+')');
        g.addColorStop(0.5,'rgb('+Math.round(20+pulse*40)+','+Math.round(10+pulse*30)+','+Math.round(40+pulse*80)+')');
        g.addColorStop(1,'#05060a');
        ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
        // a scanning bar whose glow tracks the pulse — makes MIDI/audio hits visible
        const bx=((t*140)%(w+240))-120;
        ctx.fillStyle='rgba('+Math.round(120+pulse*135)+','+Math.round(160+pulse*80)+',255,'+(0.06+pulse*0.35)+')';
        ctx.fillRect(bx,0,120,h);
        requestAnimationFrame(draw);
      }
      requestAnimationFrame(draw);

      // Register the pulse control HERE so its onChange stays in-window and drives the canvas
      // with no cross-window traffic. midi:true makes it appear in SR's MIDI-learn mode; the
      // MIDI binding below routes an assigned CC through this control (firing onChange).
      (async function(){
        try{
          const ctl=await window.synapse.controls.register({
            id:CONTROL_ID, label:'Reactive Pulse', type:'float', min:0, max:1, value:0, midi:true
          });
          window.synapse.controls.onChange(CONTROL_ID,(value)=>{
            const v=Number(value); if(!isNaN(v)) pulseTarget=Math.max(0,Math.min(1,v));
          });
          // Re-arm MIDI when the main window asks (it flips a storage flag on its MIDI button).
          async function syncArm(){
            try{
              const r=await window.synapse.storage.get('reactivePad.pulseMidi');
              if(r&&r.exists&&r.value) await window.synapse.bindings.midi({ target:{controlId:CONTROL_ID}, min:0, max:1 });
            }catch(e){}
          }
          await syncArm();
          // Poll the arm flag rarely (2s) — a discrete control-plane check, NOT a per-frame draw call.
          setInterval(syncArm,2000);
        }catch(e){ /* controls unavailable — background still animates on t alone */ }
      })();
    })();
    <\/script>
  </body></html>`;
}

// ---- per-parameter binding rows (host-side; mutually exclusive MIDI vs AUDIO) ----------------

// Wire one parameter's MIDI button + AUDIO toggle to bindings against a {moduleId, path} target.
// stateKey/bandKey index into bindingState; unbindId is the stable binding id we remove on swap.
function wireModuleParam(rootId, target, stateKey, bandKey, range) {
  const root = document.querySelector(rootId);
  const midiBtn = root.querySelector('.midi');
  const audioChk = root.querySelector('.audio');
  const bandSel = root.querySelector('.band');
  const stateEl = root.querySelector('.p-state');
  const midiId = 'midi:' + stateKey;
  const audioId = 'follow:' + stateKey;

  if (bandKey && bindingState[bandKey]) bandSel.value = bindingState[bandKey];

  function paint() {
    midiBtn.classList.toggle('active', bindingState[stateKey] === 'midi');
    audioChk.checked = bindingState[stateKey] === 'audio';
    bandSel.disabled = bindingState[stateKey] !== 'audio';
    stateEl.textContent =
      bindingState[stateKey] === 'midi' ? 'MIDI-learnable (assign in host)' :
      bindingState[stateKey] === 'audio' ? 'following ' + bandSel.value :
      'unbound';
  }

  async function clearBindings() {
    // Remove whichever host-side binding currently drives this target (id-keyed, idempotent).
    try { await window.synapse.bindings.remove(midiId); } catch (e) {}
    try { await window.synapse.bindings.remove(audioId); } catch (e) {}
  }

  async function bindMidi() {
    await clearBindings();
    await window.synapse.bindings.midi({ id: midiId, target, min: range.min, max: range.max });
    bindingState[stateKey] = 'midi';
    saveBindingState(); window.synapse.app.setState(bindingState); paint();
    write(rootId + ': MIDI-learn armed — assign a CC in the host.');
  }

  async function bindAudio() {
    await clearBindings();
    await window.synapse.bindings.follow({
      id: audioId, target, source: bandSel.value, min: range.min, max: range.max, smooth: 0.4
    });
    bindingState[stateKey] = 'audio';
    if (bandKey) bindingState[bandKey] = bandSel.value;
    saveBindingState(); window.synapse.app.setState(bindingState); paint();
    write(rootId + ': following ' + bandSel.value + '.');
  }

  async function unbind() {
    await clearBindings();
    bindingState[stateKey] = 'none';
    saveBindingState(); window.synapse.app.setState(bindingState); paint();
    write(rootId + ': unbound.');
  }

  midiBtn.addEventListener('click', () => {
    if (bindingState[stateKey] === 'midi') { unbind(); } else { bindMidi(); }
  });
  audioChk.addEventListener('change', () => {
    if (audioChk.checked) { bindAudio(); } else { unbind(); }
  });
  bandSel.addEventListener('change', () => {
    if (bindingState[stateKey] === 'audio') bindAudio();   // re-follow the newly selected band
  });

  return { paint, bindMidi, bindAudio, unbind };
}

// The Pulse row targets a control in the BACKGROUND window, which owns the control + its
// onChange + its MIDI binding. This main-window button only flips a storage flag the child
// reads (discretely) to arm/disarm the MIDI binding — a control registered in one window
// cannot be bound from another in v0, so the actual bindings.midi call happens in the child.
function wirePulseParam(rootId) {
  const root = document.querySelector(rootId);
  const midiBtn = root.querySelector('.midi');
  const stateEl = root.querySelector('.p-state');

  function paint() {
    const on = bindingState.pulse === 'midi';
    midiBtn.classList.toggle('active', on);
    stateEl.textContent = on ? 'MIDI-learnable (assign in host)' : 'unbound';
  }

  async function setArm(on) {
    try { await window.synapse.storage.set('reactivePad.pulseMidi', on); } catch (e) {}
    bindingState.pulse = on ? 'midi' : 'none';
    saveBindingState(); window.synapse.app.setState(bindingState); paint();
    write(rootId + (on ? ': MIDI-learn armed for the pulse control — assign a CC in the host.'
                       : ': pulse MIDI disarmed.'));
  }

  midiBtn.addEventListener('click', () => setArm(bindingState.pulse !== 'midi'));
  return { paint, setArm };
}

async function boot() {
  await SynapseSDK.connect();
  await loadBindingState();

  // 1) Background: an animated canvas child window (owns the pulse control + page-local visuals).
  const bg = await window.synapse.web.createWindow({
    id: 'reactive-bg',
    title: 'Reactive Pad Background',
    html: backgroundWindowHtml(PULSE_CONTROL_ID),
    width: OUT_W,
    height: OUT_H
  });

  // 2) Foreground: the "REACTIVE" word. fontSize / colorA are the bindable members here.
  const text = await window.synapse.render.createText({
    id: 'reactive-text',
    text: 'REACTIVE',
    size: 140,
    color: { r: 1, g: 1, b: 1, a: 1 },
    align: 'center',
    width: OUT_W,
    height: OUT_H
  });

  // 3) Composite: text screened over the animated background, then publish the stack.
  //    Slot 0 = background (opacity1), slot 1 = text (opacity2 — the "word opacity" target).
  const stack = await window.synapse.render.createStack({
    id: 'reactive-stack',
    inputs: [
      { source: bg.textureId },                       // slot 0, bottom
      { source: text.output, blend: 'screen' }        // slot 1, top (text)
    ]
  });

  await window.synapse.output.publish({
    id: 'reactive-out', source: stack.output, name: 'Reactive Pad'
  });

  // In-app monitor of the published pixels (no publishing; click-through).
  await window.synapse.surface.attach('#preview', {
    surfaceId: 'reactive-preview', type: 'texture', textureId: stack.output, pointer: 'passthrough'
  });

  // Wire the two module-member parameters. Targets are proven-bindable float members:
  //   text.fontSize  and  stack.opacity2  (slot 1 = the text layer).
  const fontRow = wireModuleParam('#pFont',
    { moduleId: text.moduleId, path: 'fontSize' }, 'font', 'fontBand', { min: FONT_MIN, max: FONT_MAX });
  const opacityRow = wireModuleParam('#pOpacity',
    { moduleId: stack.moduleId, path: 'opacity2' }, 'opacity', 'opacityBand', { min: OPACITY_MIN, max: OPACITY_MAX });
  const pulseRow = wirePulseParam('#pPulse');

  // Re-apply persisted binding kinds so a reload restores the same MIDI/AUDIO wiring.
  async function applyPersisted() {
    if (bindingState.font === 'midi') await fontRow.bindMidi();
    else if (bindingState.font === 'audio') await fontRow.bindAudio();
    if (bindingState.opacity === 'midi') await opacityRow.bindMidi();
    else if (bindingState.opacity === 'audio') await opacityRow.bindAudio();
    if (bindingState.pulse === 'midi') await pulseRow.setArm(true);
    fontRow.paint(); opacityRow.paint(); pulseRow.paint();
  }

  // Restore per-project state after a project round-trip (fires once after ready()).
  window.synapse.app.onRestore((restored) => {
    if (restored && typeof restored === 'object') {
      Object.assign(bindingState, restored);
      applyPersisted();
      saveBindingState();
    }
  });

  await applyPersisted();
  window.synapse.app.setState(bindingState);

  await window.synapse.app.ready();
  write('Ready. Output publishes as MediaOut "Reactive Pad". Assign MIDI in the host, or toggle AUDIO to follow the music.');
}

boot().catch((error) => write(String(error && error.synapse ? JSON.stringify(error.synapse) : error)));

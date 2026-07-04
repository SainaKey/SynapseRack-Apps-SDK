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

// Persisted record of which binding kind each parameter uses, and the selected audio band.
// Natural model: 'midi' is the DEFAULT (every parameter is always learnable); 'audio' is the only
// other state. Old saves may still contain 'none' — applyPersisted treats anything non-'audio' as
// 'midi', so they migrate silently. Project-independent presets, via synapse.storage.
const bindingState = { font: 'midi', opacity: 'midi', pulse: 'midi', fontBand: 'audio.bass', opacityBand: 'audio.level' };

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
      // with no cross-window traffic. Natural model: the control is ALWAYS MIDI-learnable —
      // anchor '#bg' makes the whole canvas the learn-mode click target.
      //
      // claim() runs on a slow heartbeat, not just once: every MAIN-window reload starts a new
      // epoch that sweeps instance resources the reloaded code does not re-claim, but this CHILD
      // page only re-runs when its own html changes — so it must re-claim its control + binding
      // periodically. Both calls are keyed get-or-create: no-ops while alive, instant re-create
      // after a sweep. A discrete control-plane heartbeat, NOT a per-frame call.
      (async function(){
        // window.synapse is injected by the host bootstrap; on a fresh child page this inline
        // script can run first, so wait for it (the same thing SynapseSDK.connect does in the
        // main window — this page deliberately has no SDK include).
        while(!window.synapse){ await new Promise(r=>setTimeout(r,50)); }
        async function claim(){
          try{
            await window.synapse.controls.register({
              id:CONTROL_ID, label:'Reactive Pulse', type:'float', min:0, max:1, value:0, midi:true
            });
            await window.synapse.bindings.midi({ target:{controlId:CONTROL_ID}, min:0, max:1, anchor:'#bg' });
          }catch(e){ console.error('[reactive-pad] pulse claim failed', e); }
        }
        await claim();
        window.synapse.controls.onChange(CONTROL_ID,(value)=>{
          const v=Number(value); if(!isNaN(v)) pulseTarget=Math.max(0,Math.min(1,v));
        });
        setInterval(claim, 3000);
      })();
    })();
    <\/script>
  </body></html>`;
}

// ---- per-parameter binding rows (host-side; mutually exclusive MIDI vs AUDIO) ----------------

// Wire one parameter row against a {moduleId, path} target. Natural model: the parameter is
// ALWAYS MIDI-learnable — no arm button. The SDK badge (bindings.badge) sits in the row showing
// MIDI / the learned signal, and the whole row is the learn-mode click target (anchor: root).
// The AUDIO toggle swaps the target to bindings.follow (one host-side binding drives a parameter
// at a time); unchecking it re-arms MIDI.
function wireModuleParam(rootId, target, stateKey, bandKey, range) {
  const root = document.querySelector(rootId);
  const badgeHost = root.querySelector('.midi-badge');
  const audioChk = root.querySelector('.audio');
  const bandSel = root.querySelector('.band');
  const stateEl = root.querySelector('.p-state');
  const midiId = 'midi:' + stateKey;
  const audioId = 'follow:' + stateKey;

  if (bandKey && bindingState[bandKey]) bandSel.value = bindingState[bandKey];

  function paint() {
    const audio = bindingState[stateKey] === 'audio';
    audioChk.checked = audio;
    bandSel.disabled = !audio;
    stateEl.textContent = audio
      ? 'following ' + bandSel.value
      : 'MIDI-learnable — enter learn mode and click this row';
  }

  async function armMidi() {
    try { await window.synapse.bindings.remove(audioId); } catch (e) {}
    // anchor: the whole row — in learn mode it lights up as one big click target.
    const handle = await window.synapse.bindings.midi({
      id: midiId, target, min: range.min, max: range.max, anchor: root
    });
    // (Re-)create the badge after every arm: bindings.remove tears the old one down.
    window.synapse.bindings.badge(handle, badgeHost);
    bindingState[stateKey] = 'midi';
    saveBindingState(); window.synapse.app.setState(bindingState); paint();
  }

  async function bindAudio() {
    try { await window.synapse.bindings.remove(midiId); } catch (e) {}
    await window.synapse.bindings.follow({
      id: audioId, target, source: bandSel.value, min: range.min, max: range.max, smooth: 0.4
    });
    bindingState[stateKey] = 'audio';
    if (bandKey) bindingState[bandKey] = bandSel.value;
    saveBindingState(); window.synapse.app.setState(bindingState); paint();
    write(rootId + ': following ' + bandSel.value + '.');
  }

  audioChk.addEventListener('change', () => {
    if (audioChk.checked) { bindAudio(); } else { armMidi(); }
  });
  bandSel.addEventListener('change', () => {
    if (bindingState[stateKey] === 'audio') bindAudio();   // re-follow the newly selected band
  });

  return { paint, armMidi, bindAudio };
}

// The Pulse parameter targets a control in the BACKGROUND window, which owns the control + its
// onChange + its MIDI binding (a control registered in one window cannot be bound from another
// in v0). The child arms it unconditionally at boot — this main-window row is display only.
function wirePulseParam(rootId) {
  const root = document.querySelector(rootId);
  const stateEl = root.querySelector('.p-state');

  function paint() {
    stateEl.textContent = 'MIDI-learnable — in learn mode, click the background window';
  }

  return { paint };
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

  // Re-apply persisted binding kinds so a reload restores the same MIDI/AUDIO wiring. Natural
  // model: anything that is not explicitly 'audio' arms MIDI — this also migrates old saves that
  // still contain 'none' (the retired arm-button state). Pulse arms itself in the child window.
  async function applyPersisted() {
    if (bindingState.font === 'audio') await fontRow.bindAudio();
    else await fontRow.armMidi();
    if (bindingState.opacity === 'audio') await opacityRow.bindAudio();
    else await opacityRow.armMidi();
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
  write('Ready. Output publishes as MediaOut "Reactive Pad". Every parameter is MIDI-learnable ' +
        '(enter learn mode in the host and click a row), or toggle AUDIO to follow the music.');
}

boot().catch((error) => write(String(error && error.synapse ? JSON.stringify(error.synapse) : error)));

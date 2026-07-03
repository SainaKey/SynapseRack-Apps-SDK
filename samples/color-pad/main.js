// Color Pad — a VJ color-flash instrument published as a clean color surface.
//
// Publish pattern: the color output is a CHILD web window (web.createWindow with
// publish:true, width/height). The whole instrument — pad grid + full-bleed color
// canvas + fade animation — lives INSIDE that window, driven by its own in-window
// click events and a page-local requestAnimationFrame loop, so no bridge call ever
// runs per frame. The main window here is a thin host: it creates/publishes the color
// window, mirrors its pixels as an in-app preview, and owns the mode/fade settings the
// pad reads on each (discrete) tap via synapse.storage (the only cross-window channel
// in v0). The pad strip is part of the published pixels by necessity — see README.

const OUT_W = 1280;
const OUT_H = 720;
const STORE_KEY = 'colorPad.settings';

// Palette: rows of the pad grid. First cells are strobe/utility, then colors.
const PALETTE = [
  '#ffffff', '#000000', '#ff0040', '#ff7a00',
  '#ffd400', '#38e04a', '#00d3c4', '#1e88ff',
  '#6a3cff', '#ff33cc', '#ff9db0', '#0a0a0a',
  '#c8ff00', '#00ffa3', '#ff2d2d', '#f4f6ff'
];

const log = document.querySelector('#log');
function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// The color window's page. Self-contained: reads settings from its own synapse.storage
// on each pad tap (a discrete event, never per frame); animates the fade on a canvas
// with requestAnimationFrame (page-local, zero bridge traffic).
function colorWindowHtml(palette, storeKey) {
  const paletteJson = JSON.stringify(palette);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#000;overflow:hidden;font:12px sans-serif;color:#fff;-webkit-user-select:none;user-select:none;touch-action:none;}
    #stage{position:fixed;inset:0;}
    #surface{display:block;width:100%;height:100%;}
    #pads{position:fixed;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:2px;background:rgba(0,0,0,.35);}
    .pad{aspect-ratio:2/1;border-radius:3px;cursor:pointer;border:1px solid rgba(255,255,255,.12);}
    .pad.active{outline:2px solid #fff;outline-offset:-2px;}
  </style></head><body>
    <div id="stage"><canvas id="surface"></canvas></div>
    <div id="pads"></div>
    <script>
    (function(){
      const PALETTE=${paletteJson};
      const STORE_KEY=${JSON.stringify(storeKey)};
      const cv=document.getElementById('surface');
      const ctx=cv.getContext('2d',{alpha:false});
      // Fixed-resolution backing store matches the published texture size.
      cv.width=${OUT_W};cv.height=${OUT_H};
      const state={color:[0,0,0],from:[0,0,0],to:[0,0,0],t:1,fadeMs:0,anim:0};

      function hexToRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');
        return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
      function paint(rgb){ctx.fillStyle='rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')';ctx.fillRect(0,0,cv.width,cv.height);}
      function set(rgb){cancelAnimationFrame(state.anim);state.color=rgb.slice();state.t=1;paint(rgb);}
      function fadeTo(rgb,ms){
        if(!ms){set(rgb);return;}
        cancelAnimationFrame(state.anim);
        state.from=state.color.slice();state.to=rgb.slice();state.t=0;
        const start=performance.now();
        const step=(now)=>{
          state.t=Math.min(1,(now-start)/ms);
          const c=state.color=[0,1,2].map(i=>Math.round(state.from[i]+(state.to[i]-state.from[i])*state.t));
          paint(c);
          if(state.t<1)state.anim=requestAnimationFrame(step);
        };
        state.anim=requestAnimationFrame(step);
      }

      async function readSettings(){
        try{const r=await window.synapse.storage.get(STORE_KEY);
          const s=(r&&r.exists&&r.value)||{};
          return {momentary:!!s.momentary,fadeMs:Number(s.fadeMs)||0};
        }catch(e){return {momentary:false,fadeMs:0};}
      }

      const padsEl=document.getElementById('pads');
      let activeEl=null;
      function markActive(el){if(activeEl)activeEl.classList.remove('active');activeEl=el;if(el)el.classList.add('active');}

      PALETTE.forEach((hex)=>{
        const el=document.createElement('div');
        el.className='pad';el.style.background=hex;
        const rgb=hexToRgb(hex);
        // Press: instant cut to the color (fade applies only on release/next tap).
        el.addEventListener('pointerdown',async(ev)=>{
          ev.preventDefault();markActive(el);
          set(rgb);                                   // instant cut on press
        });
        // Release: in momentary mode, fall back to black (with fade if set).
        el.addEventListener('pointerup',async()=>{
          const {momentary,fadeMs}=await readSettings();
          if(momentary){markActive(null);fadeTo([0,0,0],fadeMs);}
        });
        el.addEventListener('pointercancel',async()=>{
          const {momentary,fadeMs}=await readSettings();
          if(momentary){markActive(null);fadeTo([0,0,0],fadeMs);}
        });
        padsEl.appendChild(el);
      });

      paint([0,0,0]);
    })();
    <\/script>
  </body></html>`;
}

// Load persisted settings (project-independent presets) before wiring the UI.
async function loadSettings() {
  try {
    const r = await window.synapse.storage.get(STORE_KEY);
    if (r && r.exists && r.value) return r.value;
  } catch (e) { /* first run / unavailable — fall through to defaults */ }
  return { momentary: false, fadeMs: 0 };
}

async function saveSettings(settings) {
  try { await window.synapse.storage.set(STORE_KEY, settings); }
  catch (e) { write('could not persist settings: ' + (e && e.message ? e.message : e)); }
}

async function boot() {
  await SynapseSDK.connect();

  const settings = await loadSettings();
  const momentaryEl = document.querySelector('#momentary');
  const fadeEl = document.querySelector('#fade');
  const fadeValEl = document.querySelector('#fadeVal');

  momentaryEl.checked = !!settings.momentary;
  fadeEl.value = String(Number(settings.fadeMs) || 0);
  fadeValEl.textContent = fadeEl.value + ' ms';

  // Ensure the store holds a value before the child window reads it on its first tap.
  await saveSettings(settings);

  // Create + publish the color window. publish:true does output.publish in the same
  // round trip; width/height fix the published texture at a clean 720p.
  const win = await window.synapse.web.createWindow({
    id: 'color-surface',
    title: 'Color Pad Output',
    html: colorWindowHtml(PALETTE, STORE_KEY),
    publish: true,
    outputName: 'Color Pad',
    width: OUT_W,
    height: OUT_H
  });

  // Mirror the same texture into the app window as a monitor (no publishing).
  await window.synapse.surface.attach('#preview', {
    surfaceId: 'color-preview', type: 'texture', textureId: win.textureId, pointer: 'passthrough'
  });

  // Mode + fade are read by the color window on each pad tap; persist them for next run.
  momentaryEl.addEventListener('change', () => {
    settings.momentary = momentaryEl.checked;
    saveSettings(settings);
  });
  fadeEl.addEventListener('input', () => {
    settings.fadeMs = Number(fadeEl.value) || 0;
    fadeValEl.textContent = fadeEl.value + ' ms';
  });
  fadeEl.addEventListener('change', () => saveSettings(settings));

  // Restore per-project UI state after a project round-trip (fires once after ready()).
  window.synapse.app.onRestore((restored) => {
    if (!restored || typeof restored !== 'object') return;
    if (typeof restored.momentary === 'boolean') { settings.momentary = restored.momentary; momentaryEl.checked = restored.momentary; }
    if (typeof restored.fadeMs === 'number') { settings.fadeMs = restored.fadeMs; fadeEl.value = String(restored.fadeMs); fadeValEl.textContent = restored.fadeMs + ' ms'; }
    saveSettings(settings);
  });
  window.synapse.app.setState(settings);

  await window.synapse.app.ready();
  write('Ready. Output publishes as MediaOut "Color Pad" — tap a pad in the output window.');
}

boot().catch((error) => write(String(error && error.synapse ? JSON.stringify(error.synapse) : error)));

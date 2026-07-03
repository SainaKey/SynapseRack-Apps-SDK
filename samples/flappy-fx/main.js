// Flappy FX — a Flappy Bird-like game where every jump fires a VJ effect.
// The game runs entirely inside an offscreen web window (its canvas becomes the
// published texture). This window only hosts the preview + wiring; per-frame
// rendering never touches the bridge.

const log = document.querySelector('#log');
const layerSelect = document.querySelector('#layerSelect');
const refreshLayers = document.querySelector('#refreshLayers');
const kickReadout = document.querySelector('#kickReadout');
const tapTempoToggle = document.querySelector('#tapTempo');

function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// ---- layer kick wiring ----
// The kick itself runs INSIDE the game window (see gameWindowHtml) so it fires on every flap no
// matter where the input came from — a forwarded preview click or the game window directly. This
// window only owns the picker UI and shares the chosen layer via synapse.storage.

async function populateLayers(selectedId) {
  const layers = await window.synapse.layers.list();
  layerSelect.innerHTML = '<option value="">(none)</option>';
  for (const layer of layers) {
    if (!layer.exists) continue;
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = layer.name || layer.id;
    layerSelect.appendChild(option);
  }
  if (selectedId && [...layerSelect.options].some((o) => o.value === selectedId)) {
    layerSelect.value = selectedId;
  }
}

async function selectKickLayer(layerId) {
  await window.synapse.storage.set('kickLayerId', layerId || '');
  kickReadout.textContent = layerId ? 'armed' : '';
}

// The whole game lives in this HTML string. Pointer events reach it through the
// surface overlay (pointer: 'web'), so clicking the preview flaps the bird.
function gameWindowHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>html, body, canvas { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #05060a; }</style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');

    // ---- state ----
    const W = 960, H = 540;               // fixed game space, scaled to the window
    let state = 'title';                  // title | playing | gameover
    let bird, pipes, score, best = 0, t = 0;

    // FX state — one slot per effect type, each jump triggers the next in the cycle.
    const FX = ['shockwave', 'flash', 'hueshift', 'burst', 'zoom', 'glitch'];
    let fxIndex = 0;
    let hue = 195;                        // palette hue, shifted by the hueshift FX
    let flash = 0;                        // 0..1 screen flash
    let zoom = 0;                         // 0..1 zoom punch
    let glitch = 0;                       // frames of glitch left
    let rings = [];                       // shockwaves {x, y, r, a}
    let particles = [];                   // {x, y, vx, vy, life, hue}
    let trail = [];                       // bird trail

    function reset() {
      bird = { x: W * 0.3, y: H * 0.5, vy: 0, r: 14 };
      pipes = [];
      score = 0;
      t = 0;
      trail = [];
    }
    reset();

    function spawnPipe() {
      const gap = 170;
      const cy = 90 + Math.random() * (H - 180 - gap) + gap / 2;
      pipes.push({ x: W + 40, cy, gap, w: 64, passed: false });
    }

    // ---- jump + FX trigger ----
    function jump() {
      if (state === 'title') { state = 'playing'; reset(); }
      if (state === 'gameover') { state = 'title'; return; }
      bird.vy = -6.4;
      fire(FX[fxIndex]);
      fxIndex = (fxIndex + 1) % FX.length;
      kickLayer(); // fire-and-forget: punch the SR layer chosen in the app window
      tapTempo(); // fire-and-forget: flap rhythm drives the global BPM
    }

    // ---- tap tempo: flap rhythm -> global BPM ----
    // BPM is computed here from flap intervals (rolling average, same idea as SR's own tap tempo),
    // then written to a hidden app-owned GlobalTempo node: its float input sets the GLOBAL BPM
    // singleton, so every tempo-synced thing in the rack follows the game. No user graph changes.
    // anim: frames left on the HUD animation; slam = big-change variant (scale punch +
    // gold flash + number roll from rollFrom to bpm). Rendered in draw(), decayed in step().
    const tempo = { taps: [], moduleId: '', bpm: 0, anim: 0, slam: false, rollFrom: 0 };
    const BPM_ANIM_POP = 10, BPM_ANIM_SLAM = 28;

    async function tapTempo() {
      const now = performance.now();
      if (tempo.taps.length && now - tempo.taps[tempo.taps.length - 1] > 2000) {
        tempo.taps = []; // fell out of rhythm — start a fresh measurement
      }
      tempo.taps.push(now);
      if (tempo.taps.length > 9) tempo.taps.shift();
      if (tempo.taps.length < 2) return;

      let sum = 0;
      for (let i = 1; i < tempo.taps.length; i++) sum += tempo.taps[i] - tempo.taps[i - 1];
      const avgMs = sum / (tempo.taps.length - 1);
      const prevBpm = tempo.bpm;
      tempo.bpm = Math.round(Math.min(300, Math.max(40, 60000 / avgMs)));

      if (tempo.bpm !== prevBpm) {
        tempo.slam = prevBpm > 0 && Math.abs(tempo.bpm - prevBpm) >= 12;
        tempo.rollFrom = prevBpm;
        tempo.anim = tempo.slam ? BPM_ANIM_SLAM : BPM_ANIM_POP;
      }

      try {
        const enabled = await synapse.storage.get('tapTempoEnabled');
        if (enabled.exists && enabled.value === false) return;
        await setGlobalBpm(tempo.bpm);
      } catch (err) {
        console.error('[flappy] tap tempo failed', err.synapse || err);
      }
    }

    async function setGlobalBpm(bpm) {
      if (!tempo.moduleId) {
        const node = await synapse.modules.create({ type: 'GlobalTempo', label: 'Flappy Tap Tempo' });
        tempo.moduleId = node.moduleId;
      }
      try {
        await synapse.modules.set(tempo.moduleId, 'inputA', bpm);
      } catch (err) {
        if (err.synapse && err.synapse.code === 'not_found') {
          // Our node was swept by an app reload — recreate once and retry.
          tempo.moduleId = '';
          const node = await synapse.modules.create({ type: 'GlobalTempo', label: 'Flappy Tap Tempo' });
          tempo.moduleId = node.moduleId;
          await synapse.modules.set(tempo.moduleId, 'inputA', bpm);
          return;
        }
        throw err;
      }
    }

    // ---- SR layer kick ----
    // This window has its own synapse bridge, so the kick lives HERE, on the jump itself —
    // it fires no matter where the flap input came from (forwarded preview click or this
    // window directly). The chosen layer id is shared by the app window via synapse.storage.
    const kick = { layerId: '', rotation: 0, baseOpacity: 1, restoreTimer: 0, count: 0 };

    async function kickLayer() {
      try {
        const stored = await synapse.storage.get('kickLayerId');
        const layerId = (stored && stored.value) || '';
        if (!layerId) return;

        if (kick.layerId !== layerId) {
          // New target: capture its current pose as the base to kick from / restore to.
          const layers = await synapse.layers.list();
          const layer = layers.find((l) => l.id === layerId);
          if (!layer || !layer.exists) return;
          kick.layerId = layerId;
          kick.rotation = (layer.rotation && layer.rotation.z) || 0;
          kick.baseOpacity = typeof layer.opacity === 'number' ? layer.opacity : 1;
          kick.count = 0;
        }

        kick.rotation = (kick.rotation + 12) % 360;
        kick.count++;
        await synapse.layers.setRotationZ(kick.layerId, kick.rotation);
        await synapse.layers.setOpacity(kick.layerId, Math.max(0.1, kick.baseOpacity * 0.55));
        clearTimeout(kick.restoreTimer);
        kick.restoreTimer = setTimeout(() => {
          synapse.layers.setOpacity(kick.layerId, kick.baseOpacity)
            .catch((err) => console.error('[flappy] opacity restore failed', err.synapse || err));
        }, 150);
      } catch (err) {
        // Deleted layer etc. — disarm locally and surface the structured error to the console.
        console.error('[flappy] kick failed', err.synapse || err);
        kick.layerId = '';
      }
    }

    function fire(fx) {
      if (fx === 'shockwave') rings.push({ x: bird.x, y: bird.y, r: 10, a: 1 });
      if (fx === 'flash') flash = 1;
      if (fx === 'hueshift') hue = (hue + 47) % 360;
      if (fx === 'burst') {
        for (let i = 0; i < 42; i++) {
          const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 7;
          particles.push({ x: bird.x, y: bird.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                           life: 1, hue: (hue + Math.random() * 60) % 360 });
        }
      }
      if (fx === 'zoom') zoom = 1;
      if (fx === 'glitch') glitch = 14;
    }

    window.addEventListener('pointerdown', jump);
    window.addEventListener('keydown', (e) => { if (e.code === 'Space') jump(); });

    // ---- simulation ----
    function step() {
      t++;
      flash *= 0.90;
      zoom *= 0.88;
      if (glitch > 0) glitch--;
      if (tempo.anim > 0) tempo.anim--;
      rings.forEach(r => { r.r += 9; r.a *= 0.93; });
      rings = rings.filter(r => r.a > 0.03);
      particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life *= 0.95; });
      particles = particles.filter(p => p.life > 0.04);

      if (state !== 'playing') return;

      bird.vy += 0.32;
      bird.y += bird.vy;
      trail.push({ x: bird.x, y: bird.y });
      if (trail.length > 22) trail.shift();

      if (t % 95 === 0) spawnPipe();
      pipes.forEach(p => { p.x -= 3.1; });
      pipes = pipes.filter(p => p.x > -p.w - 20);

      for (const p of pipes) {
        if (!p.passed && p.x + p.w < bird.x) { p.passed = true; score++; fire('shockwave'); }
        const inX = bird.x + bird.r > p.x && bird.x - bird.r < p.x + p.w;
        const inGap = bird.y - bird.r > p.cy - p.gap / 2 && bird.y + bird.r < p.cy + p.gap / 2;
        if (inX && !inGap) return die();
      }
      if (bird.y + bird.r > H || bird.y - bird.r < 0) return die();
    }

    function die() {
      state = 'gameover';
      best = Math.max(best, score);
      tempo.taps = []; // death breaks the rhythm — next run starts a fresh measurement
      fire('burst'); fire('glitch'); fire('flash');
    }

    // ---- rendering ----
    function draw() {
      canvas.width = Math.max(1, innerWidth);
      canvas.height = Math.max(1, innerHeight);
      const s = Math.min(canvas.width / W, canvas.height / H);
      ctx.save();
      ctx.translate((canvas.width - W * s) / 2, (canvas.height - H * s) / 2);
      ctx.scale(s, s);

      // zoom punch: scale around the bird
      if (zoom > 0.01) {
        const z = 1 + zoom * 0.08;
        ctx.translate(bird.x, bird.y); ctx.scale(z, z); ctx.translate(-bird.x, -bird.y);
      }

      // background: dark vertical gradient + scrolling grid
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, 'hsl(' + hue + ' 45% 6%)');
      bg.addColorStop(1, 'hsl(' + ((hue + 40) % 360) + ' 55% 12%)');
      ctx.fillStyle = bg;
      ctx.fillRect(-W, -H, W * 3, H * 3);

      ctx.strokeStyle = 'hsla(' + hue + ' 80% 60% / 0.12)';
      ctx.lineWidth = 1;
      const off = (t * 3.1) % 60;
      for (let x = -off; x < W; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // pipes: neon slabs
      for (const p of pipes) {
        const c = 'hsl(' + ((hue + 140) % 360) + ' 85% 55%)';
        ctx.fillStyle = 'hsla(' + ((hue + 140) % 360) + ' 85% 55% / 0.22)';
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = c;
        ctx.shadowBlur = 18;
        const topH = p.cy - p.gap / 2, botY = p.cy + p.gap / 2;
        ctx.fillRect(p.x, 0, p.w, topH);   ctx.strokeRect(p.x, 0, p.w, topH);
        ctx.fillRect(p.x, botY, p.w, H - botY); ctx.strokeRect(p.x, botY, p.w, H - botY);
        ctx.shadowBlur = 0;
      }

      // bird trail
      trail.forEach((pt, i) => {
        const a = i / trail.length * 0.5;
        ctx.fillStyle = 'hsla(' + hue + ' 90% 65% / ' + a + ')';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, bird.r * (i / trail.length) * 0.8, 0, 7); ctx.fill();
      });

      // bird
      ctx.shadowColor = 'hsl(' + hue + ' 95% 65%)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = 'hsl(' + hue + ' 95% 70%)';
      ctx.beginPath(); ctx.arc(bird.x, bird.y, bird.r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;

      // particles
      for (const p of particles) {
        ctx.fillStyle = 'hsla(' + p.hue + ' 90% 65% / ' + p.life + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 * p.life + 1, 0, 7); ctx.fill();
      }

      // shockwave rings
      for (const r of rings) {
        ctx.strokeStyle = 'hsla(' + hue + ' 95% 70% / ' + r.a + ')';
        ctx.lineWidth = 4 * r.a + 1;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke();
      }

      // HUD
      ctx.fillStyle = 'hsla(0 0% 100% / 0.92)';
      ctx.textAlign = 'center';
      ctx.font = '700 44px sans-serif';
      if (state === 'playing') ctx.fillText(score, W / 2, 64);
      if (state === 'title') {
        ctx.fillText('FLAPPY FX', W / 2, H / 2 - 30);
        ctx.font = '400 20px sans-serif';
        ctx.fillText('CLICK / SPACE TO FLAP — every flap fires an effect', W / 2, H / 2 + 14);
      }
      if (state === 'gameover') {
        ctx.fillText('GAME OVER — ' + score, W / 2, H / 2 - 30);
        ctx.font = '400 20px sans-serif';
        ctx.fillText('best ' + best + ' — click to continue', W / 2, H / 2 + 14);
      }
      if (kick.count > 0) {
        ctx.font = '400 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'hsla(0 0% 100% / 0.6)';
        ctx.fillText('layer kicks ' + kick.count, 14, H - 14);
        ctx.textAlign = 'center';
      }

      // BPM readout, score-style at top center. Normal updates pop briefly; a big jump
      // (>= 12 BPM) slams: gold flash, scale punch, and the number rolls to the new value.
      if (tempo.bpm > 0) {
        let display = tempo.bpm;
        let scale = 1;
        let color = 'hsla(0 0% 100% / 0.85)';
        if (tempo.anim > 0) {
          if (tempo.slam) {
            const p = tempo.anim / 28;                          // 1 -> 0
            const punch = Math.sin((1 - p) * Math.PI);          // 0 -> 1 -> 0
            scale = 1 + punch * 0.45;
            display = Math.round(tempo.bpm + (tempo.rollFrom - tempo.bpm) * p * p);
            color = 'hsla(' + (48 + (1 - p) * 12) + ' 95% ' + (62 + (1 - p) * 25) + '% / 0.95)';
          } else {
            scale = 1 + (tempo.anim / 10) * 0.12;
          }
        }
        ctx.save();
        ctx.translate(W / 2, 104);
        ctx.scale(scale, scale);
        ctx.font = '700 26px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText('BPM: ' + display, 0, 0);
        ctx.restore();
      }

      // screen flash
      if (flash > 0.01) {
        ctx.fillStyle = 'hsla(' + hue + ' 90% 85% / ' + flash * 0.7 + ')';
        ctx.fillRect(-W, -H, W * 3, H * 3);
      }
      ctx.restore();

      // glitch: horizontal slice displacement over the final frame
      if (glitch > 0) {
        const slices = 6;
        for (let i = 0; i < slices; i++) {
          const sy = Math.floor(Math.random() * canvas.height);
          const sh = 6 + Math.floor(Math.random() * 26);
          const dx = Math.floor((Math.random() - 0.5) * 60);
          ctx.drawImage(canvas, 0, sy, canvas.width, sh, dx, sy, canvas.width, sh);
        }
      }
    }

    function loop() {
      step();
      draw();
      requestAnimationFrame(loop);
    }
    loop();
  <\/script>
</body>
</html>`;
}

async function boot() {
  const app = await SynapseSDK.connect();
  write('Connected to SynapseRack: ' + JSON.stringify(app.pingResult));

  // The game canvas, as a texture source. Stable key so hot reloads reuse the window.
  // 960x540 = the game's native space, so the published texture is clean 16:9 with no letterbox.
  const gameWindow = await app.webWindow('flappy-canvas', {
    title: 'Flappy FX',
    html: gameWindowHtml(),
    width: 960,
    height: 540
  });

  // Stable output id — user wiring from this MediaOut survives reloads.
  await app.publishMedia('flappy-out', {
    source: gameWindow,
    name: 'Flappy FX'
  });

  // Show the game in this window; clicks on the preview forward into the game window (flap).
  // The layer kick fires inside the game window itself, so no app-side pointer handling needed.
  await window.synapse.surface.attach('#preview', {
    type: 'texture',
    textureId: gameWindow.textureId,
    pointer: 'web'
  });

  // Layer picker UI + persistence. synapse.storage remembers the choice across sessions;
  // re-select it if the layer still exists, otherwise selectKickLayer('') clears the stale id
  // so the game doesn't keep kicking a layer the picker no longer shows.
  const stored = await window.synapse.storage.get('kickLayerId');
  await populateLayers((stored && stored.value) || '');
  await selectKickLayer(layerSelect.value);

  // Tap-tempo toggle, also remembered across sessions (defaults to on).
  const tapStored = await window.synapse.storage.get('tapTempoEnabled');
  tapTempoToggle.checked = !(tapStored.exists && tapStored.value === false);
  tapTempoToggle.addEventListener('change', () => {
    window.synapse.storage.set('tapTempoEnabled', tapTempoToggle.checked);
  });
  layerSelect.addEventListener('change', async () => {
    await selectKickLayer(layerSelect.value);
    window.synapse.app.setState({ kickLayerId: layerSelect.value });
  });
  refreshLayers.addEventListener('click', () => populateLayers(layerSelect.value));

  window.synapse.app.onRestore(async (state) => {
    if (state && state.kickLayerId) {
      await populateLayers(state.kickLayerId);
      await selectKickLayer(layerSelect.value);
    }
  });

  await app.ready();
  write('Ready. Pick a Kick Layer, then click the preview to flap — every flap punches that layer.');
}

boot().catch((error) => write(String(error)));

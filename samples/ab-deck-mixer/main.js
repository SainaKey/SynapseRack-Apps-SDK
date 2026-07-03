// AB Deck Mixer — two offscreen media decks crossfaded into one published output.
// Dogfoods the low-layer catalog C2 surface: real ContentPlayer-backed players
// (HAP/VLC/video/image via the shared classifier), transport controls, the native
// file picker (assets.pickFile), and host-side bindings on the crossfader.

const log = document.querySelector('#log');
function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

const state = { decks: {}, mixer: null, autoFade: false };

// ---- deck ----
// Each deck wraps a keyed render player. UI events are discrete; the only recurring
// bridge traffic is a 600ms status poll while the deck is playing (seek bar/time).
function setupDeck(key, rootId) {
  const root = document.querySelector(rootId);
  const deck = {
    key,
    player: null,
    playing: false,
    duration: 0,
    seeking: false,
    el: {
      preview: root.querySelector('.preview'),
      name: root.querySelector('.name'),
      badge: root.querySelector('.badge'),
      playpause: root.querySelector('.playpause'),
      seek: root.querySelector('.seek'),
      time: root.querySelector('.time'),
      rate: root.querySelector('.rate'),
      rateVal: root.querySelector('.rate-val'),
      loop: root.querySelector('.loop')
    }
  };
  state.decks[key] = deck;

  deck.el.preview.addEventListener('click', () => loadIntoDeck(deck));

  deck.el.playpause.addEventListener('click', async () => {
    if (!deck.player) return;
    const s = deck.playing ? await deck.player.pause() : await deck.player.play();
    applyStatus(deck, s);
  });

  deck.el.seek.addEventListener('pointerdown', () => { deck.seeking = true; });
  deck.el.seek.addEventListener('change', async (e) => {
    deck.seeking = false;
    if (deck.player) applyStatus(deck, await deck.player.seek(Number(e.target.value)));
  });

  deck.el.rate.addEventListener('change', async (e) => {
    const rate = Number(e.target.value);
    deck.el.rateVal.textContent = rate.toFixed(2);
    if (deck.player) await deck.player.setRate(rate);
  });

  deck.el.loop.addEventListener('change', async (e) => {
    if (deck.player) await deck.player.setLoop(e.target.checked);
  });

  return deck;
}

async function loadIntoDeck(deck) {
  const picked = await window.synapse.assets.pickFile({
    title: `Load Deck ${deck.key.toUpperCase()}`
  });
  if (!picked.picked) return;

  const asset = await window.synapse.assets.importPath(picked.path);
  await deck.player.load(asset.id);
  await deck.player.setLoop(deck.el.loop.checked);
  await deck.player.setRate(Number(deck.el.rate.value));
  const s = await deck.player.play();

  deck.el.name.textContent = asset.name || picked.path.split(/[\\/]/).pop();
  applyStatus(deck, s);
  write(`deck ${deck.key.toUpperCase()}: ${picked.path}`);
}

function applyStatus(deck, s) {
  if (!s) return;
  deck.playing = !!s.playing;
  deck.duration = s.duration || 0;
  deck.el.playpause.textContent = deck.playing ? '⏸' : '▶';
  deck.el.badge.textContent = s.type && s.type !== 'none' ? String(s.type).toUpperCase() : '';
  if (!deck.seeking && typeof s.position === 'number') {
    deck.el.seek.value = String(s.position);
    deck.el.time.textContent = formatTime(s.position * deck.duration);
  }
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Discrete poll (not per-frame): refresh seek/time for playing decks.
function watchTransport() {
  setInterval(async () => {
    for (const deck of Object.values(state.decks)) {
      if (deck.player && deck.playing && !deck.seeking) {
        applyStatus(deck, await deck.player.status());
      }
    }
  }, 600);
}

// ---- boot ----
async function boot() {
  const app = await SynapseSDK.connect();

  const deckA = setupDeck('a', '#deckA');
  const deckB = setupDeck('b', '#deckB');

  // createPlayer directly — render.createSession is a deprecated no-op shim (see SYNAPSE_API.md).
  deckA.player = await window.synapse.render.createPlayer({ id: 'deckA' });
  deckB.player = await window.synapse.render.createPlayer({ id: 'deckB' });

  const mixer = await app.mixer('ab-mix', {
    type: 'crossfade',
    inputs: [deckA.player.output, deckB.player.output],
    value: 0.5
  });
  state.mixer = mixer;

  await app.publishMedia('deck-mixer-out', { source: mixer, name: 'Deck Mixer' });

  // Deck previews: each deck's own texture, click-through so the preview click opens the picker
  // (player textures have no owning webview, so the default 'web' would fall through anyway —
  // 'passthrough' makes the intent explicit).
  await window.synapse.surface.attach(deckA.el.preview, {
    surfaceId: 'deck-a-preview', type: 'texture', textureId: deckA.player.output, pointer: 'passthrough'
  });
  await window.synapse.surface.attach(deckB.el.preview, {
    surfaceId: 'deck-b-preview', type: 'texture', textureId: deckB.player.output, pointer: 'passthrough'
  });

  // Crossfader: slider + MIDI learn + optional tempo-synced auto sweep (host-side LFO —
  // zero per-frame JS, keeps moving even while this window idles).
  const slider = document.querySelector('#crossfade');
  slider.addEventListener('input', (e) => mixer.value.set(Number(e.target.value)));
  await mixer.value.bindMidi({ min: 0, max: 1 });

  const autoButton = document.querySelector('#autoFade');
  autoButton.addEventListener('click', async () => {
    state.autoFade = !state.autoFade;
    autoButton.classList.toggle('active', state.autoFade);
    if (state.autoFade) {
      await mixer.value.lfo({ id: 'auto-fade', rate: '2', shape: 'sine', min: 0, max: 1 });
      document.querySelector('#mixerHint').textContent = 'auto-fading (2 bars, tempo-synced)';
    } else {
      await mixer.value.unbind('auto-fade');
      document.querySelector('#mixerHint').textContent = 'crossfader is MIDI-learnable';
    }
  });

  // End events: with loop on these stay quiet; if loop is off, reflect the stop in the UI.
  deckA.player.onEnd(({ kind }) => { if (kind === 'end') { deckA.playing = false; deckA.el.playpause.textContent = '▶'; } });
  deckB.player.onEnd(({ kind }) => { if (kind === 'end') { deckB.playing = false; deckB.el.playpause.textContent = '▶'; } });

  watchTransport();
  await app.ready();
  write('Ready. Click a deck to load media — output is MediaOut "Deck Mixer".');
}

boot().catch((error) => write(String(error && error.synapse ? JSON.stringify(error.synapse) : error)));

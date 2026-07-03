// BG Looper — one offscreen player cycling a playlist forever, published as a single MediaOut.
// Demonstrates the low-layer end-event mechanism: player.onEnd({kind}) drives playlist advance
// (SYNAPSE_API.md: "Fires when playback reaches the loop point / end. kind is 'loop' ... or 'end'").
// Loop is OFF on the player, so a finished clip emits kind:'end' and we advance to the next entry;
// wrap-around at the tail. The ONE exception is a single-entry list — we set the player's own
// loop=true and let the host repeat it, which is cleaner than re-issuing play() on every 'end'.

const STORAGE_KEY = 'bg-looper.playlist'; // per-app, project-independent list of file paths

const log = document.querySelector('#log');
function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// Playlist entries: { path, name, missing }. `current` is an index into entries (or -1 when idle).
const state = {
  player: null,
  entries: [],
  current: -1,
  playing: false
};

const el = {
  playlist: document.querySelector('#playlist'),
  emptyHint: document.querySelector('#emptyHint'),
  nowTitle: document.querySelector('#nowTitle'),
  playpause: document.querySelector('#playpause'),
  preview: document.querySelector('#preview')
};

function baseName(path) {
  return path.split(/[\\/]/).pop() || path;
}

// ---- persistence -------------------------------------------------------------------------------
// Only paths are durable; `missing` is recomputed on load (a file present last run may be gone now),
// so we persist a bare string[] of paths. storage is project-independent — the playlist follows the
// app, not the project.
async function persist() {
  await window.synapse.storage.set(STORAGE_KEY, state.entries.map((e) => e.path));
}

// ---- rendering ---------------------------------------------------------------------------------
function render() {
  el.playlist.innerHTML = '';
  state.entries.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'entry';
    if (index === state.current) li.classList.add('active');
    if (entry.missing) li.classList.add('missing');

    const title = document.createElement('button');
    title.className = 'entry-title';
    title.type = 'button';
    title.textContent = entry.name + (entry.missing ? '  (missing)' : '');
    title.title = entry.path;
    // Click an entry to jump to it (skips the play() for a missing file — jumpTo re-imports).
    title.addEventListener('click', () => jumpTo(index));

    const controls = document.createElement('div');
    controls.className = 'entry-controls';
    controls.append(
      iconButton('▲', 'Move up', index === 0, () => move(index, -1)),
      iconButton('▼', 'Move down', index === state.entries.length - 1, () => move(index, 1)),
      iconButton('✕', 'Remove', false, () => remove(index))
    );

    li.append(title, controls);
    el.playlist.append(li);
  });

  el.emptyHint.style.display = state.entries.length ? 'none' : '';
  el.playpause.textContent = state.playing ? '⏸' : '▶';
  const cur = state.entries[state.current];
  el.nowTitle.textContent = cur ? cur.name + (cur.missing ? '  (missing)' : '') : '—';
}

function iconButton(glyph, title, disabled, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon';
  b.textContent = glyph;
  b.title = title;
  b.disabled = disabled;
  if (!disabled) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

// ---- playlist mutation -------------------------------------------------------------------------
async function addFromPicker() {
  const picked = await window.synapse.assets.pickFile({
    title: 'Add video to BG Looper',
    extensions: ['mp4', 'mov', 'm4v', 'hap', 'avi', 'mkv', 'webm']
  });
  if (!picked.picked) return;

  state.entries.push({ path: picked.path, name: baseName(picked.path), missing: false });
  await persist();
  render();
  write(`added: ${picked.path}`);

  // Auto-start the loop the moment the first clip lands (an empty→non-empty transition).
  if (state.entries.length === 1) await playIndex(0);
}

async function move(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.entries.length) return;
  const [entry] = state.entries.splice(index, 1);
  state.entries.splice(target, 0, entry);
  // Keep `current` pointing at the same clip after the reorder.
  if (state.current === index) state.current = target;
  else if (state.current === target) state.current = index;
  await persist();
  render();
}

async function remove(index) {
  const wasCurrent = index === state.current;
  state.entries.splice(index, 1);
  await persist();

  if (state.entries.length === 0) {
    state.current = -1;
    state.playing = false;
    if (state.player) await state.player.pause();
    render();
    return;
  }
  // Removing the playing clip advances to whatever now occupies its slot (wrap to 0 at the tail);
  // removing an earlier clip shifts `current` down so it still points at the same playing clip.
  if (wasCurrent) {
    await playIndex(index % state.entries.length);
  } else {
    if (index < state.current) state.current -= 1;
    render();
  }
}

// ---- playback ----------------------------------------------------------------------------------
// A single entry loops via the player's own loop flag; a multi-entry list uses loop=false + the
// end event to advance. We re-apply this whenever the effective mode could change (load / list size).
async function applyLoopMode() {
  if (!state.player) return;
  await state.player.setLoop(state.entries.length === 1);
}

// Load + play the clip at `index`. On a missing/import failure, mark the entry and skip forward so
// the loop never stalls on a dead file. Guarded against an all-missing list (no infinite recursion).
async function playIndex(index, attempts) {
  if (!state.player || state.entries.length === 0) return;
  const tries = attempts || 0;
  if (tries >= state.entries.length) {
    state.playing = false;
    state.current = index;
    render();
    write('every playlist entry is missing — nothing to play.');
    return;
  }

  const entry = state.entries[index];
  try {
    const asset = await window.synapse.assets.importPath(entry.path);
    entry.missing = false;
    await state.player.load(asset.id);
    await applyLoopMode();
    const s = await state.player.play();
    state.playing = !!s.playing;
    state.current = index;
    render();
    write(`▶ ${entry.name}`);
  } catch (error) {
    // Missing file: importPath rejects (not_found). Mark it, surface it, skip to the next entry.
    entry.missing = true;
    render();
    write(`skipping missing file: ${entry.path}`);
    await playIndex((index + 1) % state.entries.length, tries + 1);
  }
}

async function jumpTo(index) {
  await playIndex(index);
}

async function advance(delta) {
  if (state.entries.length === 0) return;
  const from = state.current < 0 ? 0 : state.current;
  const next = ((from + delta) % state.entries.length + state.entries.length) % state.entries.length;
  await playIndex(next);
}

async function togglePlay() {
  if (!state.player || state.entries.length === 0) return;
  if (state.current < 0) { await playIndex(0); return; } // first press with nothing loaded yet
  const s = state.playing ? await state.player.pause() : await state.player.play();
  state.playing = !!s.playing;
  render();
}

// ---- boot --------------------------------------------------------------------------------------
async function boot() {
  const app = await SynapseSDK.connect();

  // One offscreen player (muted by default per docs) is the only texture producer. Keyed id so a hot
  // reload reconciles to the same node instead of spawning a duplicate.
  state.player = await window.synapse.render.createPlayer({ id: 'bg-player' });

  // Publish the player's output ONCE with a stable keyed id, so user wiring from "BG Looper" survives
  // reloads and project round-trips.
  await window.synapse.output.publish({
    id: 'bg-looper-out',
    source: state.player.output,
    name: 'BG Looper'
  });

  // In-app monitor of the live output (player textures have no owning webview → click-through).
  await window.synapse.surface.attach(el.preview, {
    surfaceId: 'bg-preview', type: 'texture', textureId: state.player.output, pointer: 'passthrough'
  });

  // THE end-event mechanism: on a non-looping clip's end (kind:'end') advance to the next entry and
  // wrap around. A single-entry list is loop=true, so it emits kind:'loop' and we intentionally do
  // nothing (the host repeats it). This is the one recurring signal that drives the whole playlist.
  state.player.onEnd(({ kind }) => {
    if (kind === 'end' && state.entries.length > 1) advance(1);
  });

  // Restore the persisted playlist (bare paths). Re-import happens lazily at play time via
  // assets.importPath, which also detects a now-missing file — so restore itself just rebuilds the
  // list; the first playIndex marks anything that has since disappeared.
  const stored = await window.synapse.storage.get(STORAGE_KEY);
  if (stored.exists && Array.isArray(stored.value)) {
    state.entries = stored.value
      .filter((p) => typeof p === 'string' && p)
      .map((path) => ({ path, name: baseName(path), missing: false }));
  }
  render();

  document.querySelector('#add').addEventListener('click', addFromPicker);
  document.querySelector('#prev').addEventListener('click', () => advance(-1));
  document.querySelector('#next').addEventListener('click', () => advance(1));
  document.querySelector('#playpause').addEventListener('click', togglePlay);

  // An empty playlist is a valid ready state — ready() before any clip exists.
  await app.ready();

  // Kick off the restored playlist (if any) after ready, so the output starts producing immediately.
  if (state.entries.length > 0) await playIndex(0);

  write('Ready. Output is MediaOut "BG Looper" — wire it behind your layer stack.');
}

boot().catch((error) => write(String(error && error.synapse ? JSON.stringify(error.synapse) : error)));

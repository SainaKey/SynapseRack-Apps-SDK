# BG Looper

A set-and-forget background video looper. Build a playlist of video files; the app plays them in
order forever and publishes one `BG Looper` MediaOut you wire behind everything else.

- **Playlist**: **+ Add video…** opens the native picker (`synapse.assets.pickFile`); reorder with
  ▲/▼, remove with ✕, click an entry to jump to it.
- **One offscreen player** (`synapse.render.createPlayer`, muted by default) is the only texture
  producer; its output is published once with a stable id (`synapse.output.publish`, name
  `BG Looper`) so user wiring survives reloads.
- **End-event-driven advance** — the point of this sample. The player runs with **loop OFF**, and
  `player.onEnd(({ kind }) => …)` fires when a clip finishes: `kind: 'end'` advances to the next
  entry, wrapping at the tail. A **single-entry** list is the one exception — it sets the player's
  own `setLoop(true)`, so it emits `kind: 'loop'` and the host repeats it (cleaner than re-issuing
  `play()` on every end).
- **Persistence** — the playlist (bare file paths) is stored in `synapse.storage` and restored on
  startup. Paths are re-imported lazily via `synapse.assets.importPath` at play time; a file that has
  since gone missing makes `importPath` reject, and the entry is marked *(missing)* and skipped so
  the loop never stalls.
- **Transport**: play/pause, prev/next, and a "now playing" display.

No per-frame bridge calls: the only recurring signal is the host's end event.

## API surface demonstrated

- `SynapseSDK.connect()` / `app.ready()`
- `synapse.render.createPlayer({ id })` — the single looping player
- `player.load(assetId)` / `player.play()` / `player.pause()` / `player.setLoop(loop)` / `player.status()`
- **`player.onEnd(({ kind }) => …)`** — end-event-driven playlist advance (`kind` is `'end'` or `'loop'`)
- `synapse.assets.pickFile({ title, extensions })` — native file picker
- `synapse.assets.importPath(path)` — re-import on load; rejects for a missing file
- `synapse.output.publish({ id, source, name })` — the keyed `BG Looper` output
- `synapse.storage.get / set` — persist and restore the playlist
- `synapse.surface.attach(...)` — in-app monitor of the live output

## Install

Copy this folder into your Apps folder (**Apps → Open Apps Folder**).

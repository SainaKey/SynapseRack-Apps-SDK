# Color Pad

A VJ color-flash instrument. A grid of color pads (palette + white/black/strobe cells);
tapping a pad cuts or holds that color on a published texture output you wire into your
mix as a blend/strobe layer.

- **Instant cut** on press.
- **Momentary mode** (optional): hold = color, release = black.
- **Fade-out** slider (0–2000 ms): releasing/retriggering fades on a page-local canvas.

## Publish pattern

The color output is a **child web window** created with
`web.createWindow({ publish: true, width, height })`. Per SYNAPSE_API.md: *"`publish: true`
also calls `output.publish` for you in the same round trip … `width`/`height` fix the
output texture's resolution."* The whole instrument (pad grid + full-bleed color canvas +
fade animation) lives inside that window and is driven by its own in-window pointer events
and a page-local `requestAnimationFrame` loop, so **no bridge call runs per frame**.

Because v0 has no window-to-window messaging and forbids per-frame bridge calls, the pads
have to live in the same window as the color surface (a main-window pad grid could not
drive the child every frame). So the **pad strip is part of the published pixels** — the
layout is a full-bleed color area with a slim pad strip pinned to the bottom edge, which is
acceptable for a blend/strobe layer. The main app window is a thin host: it creates and
publishes the color window, mirrors its pixels as an in-app preview, and owns the
mode/fade settings the pad reads (on each discrete tap) through `synapse.storage`.

## API surface demonstrated

- `SynapseSDK.connect()`
- `synapse.web.createWindow({ id, html, publish, outputName, width, height })` — creates the
  color surface and publishes it as MediaOut in one call
- `synapse.surface.attach(target, { textureId, pointer })` — in-app preview of the output
- `synapse.storage.get` / `synapse.storage.set` — cross-window + persisted mode/fade settings
- `synapse.app.onRestore` / `synapse.app.setState` — save/restore UI state with the project
- `synapse.app.ready()` — called once after wiring

## Install

Copy this folder into your SynapseRack Apps folder.

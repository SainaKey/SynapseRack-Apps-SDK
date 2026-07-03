# VJ Notepad

Live text overlays for shows — type a message, it renders as a transparent texture you wire over
your mix (shoutouts, track IDs, warnings, lyrics).

- **Compose**: type in the box, press **Enter** (Shift+Enter for a newline) or **Send** — the overlay
  updates. **Clear** blanks it. **Flash** shows the text for N seconds then blanks it (page-side
  `setTimeout`, no host timers).
- **Style**: font-size slider, a color picker (`<input type="color">` hex mapped to the doc'd
  `{r,g,b,a}` 0..1 shape), and left / center / right alignment buttons — all applied live.
- **Presets**: an 8-slot bank. **Shift+click** a slot to save the current text + style; **click** to
  fire it instantly — the live-performance move. The bank persists in `synapse.storage` and restores
  on startup.
- **Output**: one `render.createText` overlay (keyed id `notepad`), published once as a MediaOut
  named **Notepad** (`output.publish`, keyed id `notepad-out`) — wire it over your layer stack or mix.

API surface demonstrated:

- **`synapse.render.createText`** — the keyed text overlay, and its handle methods `text.set({ text,
  size, color, align })` / `text.setText(t)`. Color is `{r,g,b,a}` 0..1, align is
  `'left'|'center'|'right'`.
- **`synapse.output.publish`** — publishes the overlay's `output` textureId once, with a stable id so
  the node and any user wiring survive reloads.
- **`synapse.storage`** — the preset bank (`get`/`set` under key `vj-notepad.presets`).
- **`synapse.app.ready`** — called once after the overlay + publish are wired.

Install: copy this folder into your Apps folder (**Apps → Open Apps Folder**).

# Reactive Pad

A performance surface that makes your **inputs visible**. MIDI and audio drive things you can
**see** in the published output — v0 has no value read-back, so the moving pixels *are* the display.
The output publishes as MediaOut `Reactive Pad`; wire it into your mix as an overlay/blend layer.

## What it shows

A published stack (`render.createStack`) with two slots:

- **slot 0 (bottom)** — an animated background rendered on a canvas inside a child web window
  (`web.createWindow`). Its `requestAnimationFrame` loop is page-local: no bridge call runs per frame.
- **slot 1 (top)** — the word **REACTIVE** (`render.createText`), screened over the background.

Three parameters, each MIDI-learnable and/or audio-followable:

| Parameter | Bindable target | Doc proof |
| --- | --- | --- |
| **Text size** | `text.fontSize` | SYNAPSE_API.md, *Text render*: "Bindable member paths … `fontSize` (float-writable)". |
| **Word opacity** | `stack.opacity2` (slot 1 = text) | SYNAPSE_API.md, *Stack mixer*: "Bindable member paths … `opacity1`..`opacity8` (float-writable). Slot _n_ maps to member index _n_." |
| **Pulse glow** | a registered control's `onChange` → page-local canvas | SYNAPSE_API.md, *controls*: `controls.register` + `controls.onChange`; bindable via `{ controlId }`. |

## MIDI (learn mode)

Each parameter has a **MIDI** button that creates a host-side binding on that target
(`synapse.bindings.midi`). **There is no direct CC-number parameter in v0** — you assign a physical
control the same way you would any SR parameter:

1. Click **MIDI** on a parameter (it turns on; the parameter now appears in SR's MIDI-learn mode).
2. In SynapseRack, enter **MIDI-learn mode** — a blue learn overlay appears **on the app's MIDI
   button itself** (the binding passes `anchor`, so the target sits on this UI, not at the screen
   edge). Click it (turns red = selected).
3. Move the fader/knob (or hit the pad — firmly) you want to map. Done; the mapping runs host-side.

The mapping runs **natively in the host** — no per-frame JS. Text size and word opacity bind
directly to their module members (`{ moduleId, path }`). The **Pulse glow** binds to a control that
lives *inside the background window* (control registries are per-window in v0), so its `onChange`
drives the canvas glow with zero cross-window per-frame traffic; the main-window MIDI button flips a
`synapse.storage` flag the child reads to arm/disarm that binding.

## Audio (host-side follow)

Text size and word opacity each have an **AUDIO** toggle that swaps the binding to
`synapse.bindings.follow`, pulsing the parameter with a selectable band (`audio.level` / `audio.bass`
/ `audio.mid` / `audio.high`). MIDI and AUDIO are mutually exclusive per parameter — one host-side
binding drives each target at a time. Zero per-frame JS: the host updates the value every frame.

## Audio out

**Skipped.** The optional "play a clip audibly" bonus needs a player mute control, but
`render.player.*` in v0 exposes **no `setMuted` method** — the playback controls table lists only
`play` / `pause` / `seek` / `setRate` / `setLoop` / `status` / `onEnd`, and the spec states offscreen
players are "MUTED by default" with no opt-in documented. So this row is omitted per the "do not
invent methods" rule.

## Persistence

Which binding kind each parameter uses (and the selected audio band) is stored in `synapse.storage`
(`reactivePad.bindings`), so a reload restores the same wiring, and mirrored to `app.setState` so it
travels with the project. **v0 limitations** (from SYNAPSE_API.md, *Parameter bindings*): a learned
MIDI mapping *"survives a reload … it does not survive a full Stop or a project round-trip in v0."*
This app re-arms `bindings.midi` on reload from stored state, but the CC you physically assigned must
be re-learned after a Stop or project re-open. There are **no raw MIDI events delivered to JS** in
v0 — only the registry + host-side bindings.

## API surface demonstrated

- `SynapseSDK.connect()`
- `synapse.web.createWindow({ id, html, width, height })` — animated background window
- `synapse.render.createText({ id, text, size, color, align })` — the "REACTIVE" word
- `synapse.render.createStack({ id, inputs })` — composites text over background
- `synapse.output.publish({ id, source, name })` — publishes the stack as MediaOut
- `synapse.surface.attach(target, { textureId, pointer })` — in-app preview
- `synapse.bindings.midi` / `synapse.bindings.follow` / `synapse.bindings.remove` — host-side modulation
- `synapse.controls.register` / `synapse.controls.onChange` — the pulse control (page-local visual)
- `synapse.storage.get` / `synapse.storage.set` — persisted binding kinds + cross-window flag
- `synapse.app.setState` / `synapse.app.onRestore` — save/restore with the project
- `synapse.app.ready()` — called once after wiring

## Install

Copy this folder into your SynapseRack Apps folder (**Apps → Open Apps Folder**).

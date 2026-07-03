# Control Surface

A performance panel for the layers you **already have**. It enumerates the visible layer
stack and renders one control strip per layer — no nodes are created on the canvas; the app
only drives what's there.

- **Per-layer strip**: layer name + type, an **opacity** fader, and a **rotation Z** fader.
- **Live**: moving a fader calls the documented per-layer setter (`synapse.layers.setOpacity`,
  `synapse.layers.setRotationZ`). Slider `input` is throttled to ~30 Hz in page JS and the final
  value is flushed on `change` — the bridge is never driven per frame.
- **Ground truth is the layer**: initial fader positions are read **from** `synapse.layers.list()`
  (`opacity`, `rotation.z`), not from stored state. Nothing is persisted.
- **Refresh**: re-enumerates the stack (`synapse.layers.list()`) to pick up added/removed/renamed
  layers.

## API surface demonstrated

- `SynapseSDK.connect()` / `app.ready()` — connect once, mark setup complete once (zero layers is a
  valid ready state, shown as an empty message).
- `synapse.layers.list()` — enumerate the visible layer stack.
- `synapse.layers.setOpacity(layerId, value)` — opacity fader (0..1).
- `synapse.layers.setRotationZ(layerId, z)` — rotation-Z fader (degrees).

## What was deliberately left out, and why

**Per-layer MIDI / LFO binding (like ab-deck-mixer's crossfader row).** Left out — v0 does not
support it for layer properties, and faking it would be dishonest.

Host-side bindings (`synapse.bindings.midi` / `.lfo`) require a target that is either a module
member `{ moduleId, path }` or a control `{ controlId }`. A **visible** layer from `layers.list()`
exposes **no `moduleId`** (the `SynapseLayer` shape is `{ id, name, type, exists, opacity, rotation,
position, scale, texture }`), and its setters are keyed by `layerId`, not a bindable module path.
So there is no documented `{ moduleId, path }` for a specific layer to point a MIDI/LFO binding at.
(The `LayerOpacity` / `LayerRotation` catalog nodes address "the selected layer" by an int
`selectedLayerIndex`, not a specific layer GUID, and instantiating them would create nodes on the
canvas — which this app explicitly does not do.) Routing through a registered control would only
write the control's own value, not the layer, and an LFO on it could not drive the layer host-side
without a per-frame JS bridge call — exactly what the SDK forbids. **Bindable layer properties are a
v1 item; there is nothing honest to wire here in v0.**

**Other per-layer setters not surfaced as faders.** `synapse.layers.setRotation({x,y,z})` (full
3-axis) is covered by the single-axis Z fader for a compact strip; `synapse.layers.play(layerId,
assetId)` and `createTextureSource` are content/texture operations, not the performance controls
this panel is about, so they're out of scope.

**No layer-change event.** v0 documents none, so re-enumeration is the manual **Refresh** button.
If such an event is added, subscribe to it in `enumerateLayers()` alongside the button.

## Install

Copy this folder into your Apps folder (**Apps → Open Apps Folder**).

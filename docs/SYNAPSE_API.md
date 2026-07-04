# SynapseRack Apps API — apiVersion 0

This is the API reference of the **SynapseRack Apps SDK** (the official name of this platform).
This file is the complete reference for building a SynapseRack App. It is written so an AI
assistant, given only this file, can write a working `index.html` on the first try. If you are
that assistant: everything you need is below, plus `synapse.d.ts` in this same folder for exact
types. Do not invent methods that are not listed here.

A SynapseRack App is a folder with a `synapse-app.json` manifest and an `index.html` entry point,
opened inside SynapseRack (SR) in a WebView. Your JS talks to the SR host through `window.synapse`
(injected automatically before your scripts run) and, optionally, through the convenience layer in
`synapse-sdk.js` (also bundled in this folder — include it with a single `<script>` tag).

## Quick start

Minimal complete app that renders a solid color to a web window and publishes it to MediaOut:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>My App</title>
</head>
<body>
  <script src="./synapse-sdk.js"></script>
  <script>
    async function boot() {
      const app = await SynapseSDK.connect();

      const canvas = await app.webWindow('preview', {
        title: 'Preview',
        html: '<body style="margin:0;background:hsl(200 70% 50%)"></body>'
      });

      await app.publishMedia('main-out', { source: canvas, name: 'My App Output' });

      await app.ready(); // required — see "app.ready" below
    }

    boot().catch(console.error);
  </script>
</body>
</html>
```

That's it: no build step, one file (plus the bundled SDK file next to it). SynapseRack now shows
"My App Output" as a MediaOut source any other node/output in the project can pick up.

## Core concepts

**`textureId` is the universal texture currency.** Every visual thing in SR — a Layer's live
output, a media player, a mixer's result, a web window's rendered frame — is represented the same
way: an opaque string `textureId`. Every method that accepts a "source" (mixers, MediaOut, Spout)
accepts a `textureId`, whether it came from `layers.createTextureSource`, `web.createWindow`,
`render.createMixer`, or (with the SDK) any handle's `.textureId` property directly. The SDK
accepts a raw `textureId` string OR a handle object anywhere a source is expected.

**`id` is the idempotency key — get-or-create, safe re-run.** Every creation call that takes an
`id` option behaves as get-or-create, scoped to your app instance: call it once, get a resource;
call it again with the same `id`, get the SAME resource back (same underlying SR module, same
`moduleId`), updated in place if the options changed. This means your `boot()` function can run
more than once — on a hot reload, or because you re-ran setup defensively — without creating
duplicate nodes, duplicate Spout senders, or duplicate windows. **Always pass an explicit `id`**
for anything you expect to be stable (outputs especially — see below). Omitting `id` still works,
but the resource is treated as one-shot and gets cleaned up on the next reload instead of reused.

Not everything is get-or-create yet in v0 — see "Limits and gotchas" below for the exception
(`controls.register`).

**Published outputs keep their identity across reloads.** If a user wires your app's MediaOut node
into their own graph (e.g. into a compositor), and your app reloads (because you edited
`main.js`), the SAME MediaOut node is reused — the user's wiring is not disturbed. This only works
if you pass a stable `id` to `output.publish` / `output.publishSyphon` / `output.publishSpout`.

**`app.ready()` — call it once, at the end of boot.** It marks your setup as complete. This
matters for reload reconciliation: when your app reloads, previously-created keyed resources are
kept alive as "unclaimed" until either (a) your new `boot()` re-creates them with the same `id`
(which "claims" them), or (b) `app.ready()` fires, or (c) a host-side timeout elapses — at which
point anything still unclaimed is torn down. In one sentence: **finish creating every keyed
resource you want to keep, then call `app.ready()`**, and reloads will not leak or duplicate
resources as long as you keep using the same `id`s.

**Errors are structured and meant to be pasted back to an AI.** Every rejected call throws/rejects
with an `Error` whose `.message` is a readable one-liner and whose `.synapse` property is
`{ code, message, method, hint }`:

```js
try {
  await synapse.layers.setOpacity('bad-id', 0.5);
} catch (err) {
  console.error(err.message);       // "synapse layers.setOpacity failed [not_found]: Layer not found"
  console.error(err.synapse);       // { code: 'not_found', message: 'Layer not found', method: 'layers.setOpacity', hint: null }
}
```

`code` is one of `unknown_method`, `invalid_params`, `not_found`, `internal`. If you are an AI
debugging a failure, ask the user to paste the full `err.synapse` object (or the console line SR
logs, formatted the same way) — it tells you exactly which call failed and why.

## Method reference

Two ways to call these: the raw bridge (`window.synapse.<group>.<method>(...)`, always available,
documented per group below) or the SDK (`window.SynapseSDK`, a thin convenience layer — see "The
SDK layer" section after the raw reference). The SDK covers the common path (texture sources, web
windows, mixers, outputs, controls) with handle objects; drop to the raw bridge for anything else
(`layers`, `assets`, `modules`, `surface`).

### `synapse.app`

| Method | Params | Returns |
|---|---|---|
| `app.ping()` | — | `{ message: 'pong', unityVersion, platform, hostApiVersion, manifestApiVersion, appId, instanceId, slot }` |
| `app.ready()` | — | `{ ready: true }` |

```js
const info = await synapse.app.ping();
await synapse.app.ready();
```

### `synapse.layers`

Reads/writes SR's visible Layer stack and wraps a layer's output as a `textureId`.

| Method | Params | Returns |
|---|---|---|
| `layers.list()` | — | `SynapseLayer[]` |
| `layers.selected()` | — | `SynapseLayer` |
| `layers.setOpacity(layerId, value)` | `value: 0..1` | `SynapseLayer` |
| `layers.setRotation(layerId, rotation)` | `rotation: {x?,y?,z?}` | `SynapseLayer` |
| `layers.setRotationZ(layerId, z)` | `z: number` | `SynapseLayer` |
| `layers.play(layerId, assetId)` | `assetId` from `assets.importPath`/`download` | `SynapseLayer` |
| `layers.createTextureSource(layerId, {id?, name?})` | `layerId` or `'selected'` | `{ id, textureId, source, type: 'layer', layer, moduleId, nodeId, nodeType: 'AppTextureSource' }` |

`SynapseLayer` shape: `{ id, name, type, exists, opacity, rotation: {x,y,z}, position: {x,y,z},
scale: {x,y}, texture: {width,height} }`. `layers.selected()` falls back to the FIRST layer when
none is explicitly selected; you only get `{ id: '', name: '', exists: false }` when the project
has no layers at all (`layers.list()` with an unknown id behaves the same way).

```js
const selected = await synapse.layers.selected();
const deckA = await synapse.layers.createTextureSource(selected.id, { id: 'deck-a' });
// deckA.textureId can now be passed to render.createMixer / output.publish / surface.attach.
```

### `synapse.assets`

| Method | Params | Returns |
|---|---|---|
| `assets.importPath(path)` | local filesystem path | `{ id, name, type, path }` |
| `assets.download(url)` | URL, saved under a Downloads cache shared by all apps | `{ id, name, type, path }` |
| `assets.pickFile({title?, extensions?})` | opens the NATIVE OS file dialog; `extensions` e.g. `['mp4','hap']` | `{ picked, path }` — `picked: false` when cancelled |

The returned `id` is what you pass to `layers.play(layerId, assetId)` or
`render.player.load`/`playerHandle.load(assetId)`.

Use `assets.pickFile` for "click to load a file" UI: a web `<input type="file">` cannot expose the
absolute filesystem path to JS, but the host needs one to read media directly. Pick, then import:

```js
const { picked, path } = await synapse.assets.pickFile({ title: 'Load Deck A' });
if (picked) {
  const asset = await synapse.assets.importPath(path);
  await player.load(asset.id);
}
```

### `synapse.render`

Offscreen media players, mixers, and layers — SR nodes your app owns, not tied to a visible Layer.
Create them directly; there is no setup object to manage:

```js
const deckA = await synapse.render.createPlayer({ id: 'deckA' });
const mix = await synapse.render.createMixer({ id: 'mix', type: 'crossfade', inputs: [a, b], value: 0.5 });
```

(`sessionId` is optional everywhere and defaults to a shared namespace. `render.createSession`
still exists as a DEPRECATED compat shim from v0 — it was never an engine object and its
`output`/`exposeOutput` options do nothing. New apps should not call it.)

**`render.createPlayer({id?, sessionId?})`** → a media player
handle `{ id, sessionId, assetId, moduleId, nodeId, nodeType: 'AppMediaPlayer', output: textureId,
load(assetId), play(), pause(), seek(position), setRate(rate), setLoop(loop), status(), onEnd(fn) }`.
`id` scoped to the session is get-or-create. The player is backed by the product's real playback core
(`ContentPlayer`), so it decodes **HAP / VLC / H.264 video / images / shaders / NDI** through the same
switch the visible Layers use — you do not special-case formats.

**Playback controls** (all return a status object `{ playerId, playing, position, duration, rate, loop,
muted, path, type }`):

| Method | Params | Notes |
|---|---|---|
| `player.play()` | — | Resume the active backend (`isPlayback = true`). |
| `player.pause()` | — | Pause in place. |
| `player.seek(position)` | `position`: 0..1 normalized | `ContentPlayer.SeekTo`; clamped host-side. |
| `player.setRate(rate)` | `rate`: speed multiplier (1 = normal) | Per-controller `videoSpeed`. |
| `player.setLoop(loop)` | `loop`: boolean | **Simple loop only** — `VideoPlayer.isLooping` / `HapPlayer.loop`. VLC has no native loop toggle here (no-op). The product's beat-synced crossfade looping is not exposed by the SDK. |
| `player.status()` | — | Current snapshot (same shape as above). `type` is one of `video`/`hap`/`vlc`/`image`/`shader`/`ndi`/`spout`/`node`/`none`. |
| `player.onEnd(handler)` | `handler({ playerId, kind })` | Fires when playback reaches the loop point / end. `kind` is `'loop'` (looped back to start) or `'end'` (stopped at the end, non-looping). Returns an unsubscribe function. |

> **Audio is MUTED by default.** Offscreen SDK players start muted; only the UnityVideo backend exposes
> audio at all (HAP/VLC/image ignore mute/volume). This matches the low-layer spec decision — offscreen
> texture producers do not play sound unless the app opts in.

```js
const player = await synapse.render.createPlayer({ id: 'deckA' });
await player.load(clip.id);
await player.play();
await player.seek(0.25);      // jump to 25%
await player.setRate(1.5);    // 1.5x speed
await player.setLoop(true);   // simple loop
const off = player.onEnd(({ kind }) => console.log('reached', kind)); // 'loop' | 'end'
const s = await player.status(); // { playing, position, duration, rate, loop, muted, path, type }
```

**`render.createMixer({id?, type: 'crossfade', inputs: [textureId, textureId], value, sessionId?})`**
→ a mixer handle `{ id, sessionId, type, value, moduleId, nodeId, nodeType: 'CrossFade', output:
textureId, inputs: [...], setValue(value) }`. `id` is get-or-create; re-creating with a different
`value` or `inputs` updates the live mixer in place (changed inputs are re-wired, the old edge is
removed). Only `type: 'crossfade'` (2 inputs) exists in v0.

```js
const deckA = await synapse.render.createPlayer({ id: 'deckA' });
const deckB = await synapse.render.createPlayer({ id: 'deckB' });
const mixer = await synapse.render.createMixer({
  id: 'abMixer', type: 'crossfade', inputs: [deckA.output, deckB.output], value: 0.5
});
await mixer.setValue(0.8); // bound convenience method; equivalent to synapse.request('render.mixer.setValue', {mixerId: mixer.id, value: 0.8})
```

#### Offscreen layer

**`render.createLayer({id?, width?, height?})`** → an offscreen-layer handle `{ id, moduleId, nodeId,
nodeType: 'AppOffscreenLayer', output: textureId, width, height, play(assetId), setOpacity(v),
setRotationZ(v), setPosition({x,y}), setScale({x,y}), status() }`. Session-independent; `id` is
get-or-create (same `id` → same module GUID + `output` textureId across reloads). `width`/`height` fix
the output resolution at creation (a keyed re-claim keeps the original size); they default to the global
project resolution.

An offscreen layer is a **real Layer** running headless — its own camera/canvas/RT/ContentPlayer render
every frame — but it is **never registered in the layer tree and never composited on screen**: it does
not appear in `layers.list`, and it produces sound-free, blend-free texture only (spec decision: mixing
and blending are the mixer's job, not the layer's). `bg.output` (the textureId) feeds mixer inputs,
FxChain, `output.publish`, and `surface.attach` like any other source.

| Method | Params | Notes |
|---|---|---|
| `layer.play(assetId)` | `assetId` from `assets.importPath`/`download` | Plays through the same `ContentPlayer` switch the visible Layers use — HAP / VLC / H.264 video / image / shader / NDI, no format special-casing. |
| `layer.setOpacity(v)` | `v`: 0..1 (clamped host-side) | Writes the module's `opacity` member (→ `Layer.SetOpacity`). |
| `layer.setRotationZ(v)` | `v`: degrees | Writes `rotationZ` (→ `Layer.SetRotation` about Z). |
| `layer.setPosition({x,y})` | pixels, partial (either axis) | Writes `positionX` / `positionY` (→ `Layer.SetPosition`). |
| `layer.setScale({x,y})` | multipliers, partial (either axis) | Writes `scaleX` / `scaleY` (→ `Layer.SetScale`). |
| `layer.status()` | — | `{ layerId, moduleId, opacity, rotationZ, position:{x,y}, scale:{x,y}, width, height, output }`. |

**Bindable member paths** (drive them with `synapse.bindings.*` against `{ moduleId: bg.moduleId, path }`):
`opacity`, `rotationZ`, `positionX`, `positionY`, `scaleX`, `scaleY` — each a float-writable target.
`setPosition`/`setScale` and the bindings share the same members, so an explicit set and a host binding
are one path (a running binding will keep overwriting your explicit set — bind OR set a given axis, not
both).

```js
const bg = await synapse.render.createLayer({ id: 'bg', width: 1920, height: 1080 });
await bg.play(clip.id);                    // same ContentPlayer path as visible layers
await bg.setOpacity(0.8);
await bg.setRotationZ(45);
await bg.setPosition({ x: 0, y: 120 });
await bg.setScale({ x: 1.2, y: 1.2 });
// bg.output (textureId) → mixer inputs, FxChain, output.publish, surface.attach
// Modulate opacity with an LFO (host-side binding against the module's bindable member):
await synapse.bindings.lfo({ target: { moduleId: bg.moduleId, path: 'opacity' }, rate: '1/2' });
```

#### Stack mixer (MixerN)

**`render.createStack({id?, sessionId?, inputs: [{source, opacity?, blend?}, ...]})`** → a stack handle
`{ id, sessionId, type: 'stack', moduleId, nodeId, nodeType: 'AppStackMixer', output: textureId,
inputs: [{source, opacity, blend}, ...], setInput(index, {...}) }`. Composites **up to 8** texture
sources **bottom-up** — `inputs[0]` is the bottom slot, higher indices layer on top. `id` is get-or-
create (same `id` → same module GUID + `output` textureId across reloads); a re-create with changed
`inputs` updates opacity/blend/wiring in place. Unlike `render.createMixer` (a fixed 2-input crossfade),
this is the general N-source compositor; CrossFade is unchanged and still available.

Per slot: `source` (a textureId — a player/layer/mixer output, or any published source), `opacity`
(0..1, default 1), and `blend` (one of `'normal'` | `'add'` | `'multiply'` | `'screen'`, default
`'normal'`; a raw integer code 0..3 is also accepted). An unknown blend name is a structured
`INVALID_PARAMS` error listing the valid names.

| Method | Params | Notes |
|---|---|---|
| `stack.setInput(index, {source?, opacity?, blend?})` | `index`: 0-based slot (0..7, 0 = bottom) | Partial per-slot update. A changed `source` is re-wired (old edge removed first); `opacity`/`blend` write through the module's bindable members. Resolves to the full stack JSON. |

**Bindable member paths** (drive with `synapse.bindings.*` against `{ moduleId: stack.moduleId, path }`):
`opacity1`..`opacity8` (float-writable) and `blend1`..`blend8` (int; settable via `modules.set`, not a
continuous binding target). Slot _n_ maps to member index _n_ (slot 0 → `opacity1`/`blend1`).

```js
const a = await synapse.render.createPlayer({ id: 'a' });
const b = await synapse.render.createLayer({ id: 'b' });
const c = await synapse.render.createPlayer({ id: 'c' });
// Bottom-up: a (normal), b added, c screened on top.
const stack = await synapse.render.createStack({
  id: 'wall',
  inputs: [
    { source: a.output },                          // slot 0, bottom, normal
    { source: b.output, opacity: 0.7, blend: 'add' },     // slot 1
    { source: c.output, opacity: 0.5, blend: 'screen' }   // slot 2, top
  ]
});
// stack.output (textureId) → output.publish / surface.attach / another mixer input
await stack.setInput(1, { opacity: 0.4 });         // tweak slot 1 opacity live
// Modulate slot 2's opacity with an LFO (bindable member is opacity2, i.e. slot index 1):
await synapse.bindings.lfo({ target: { moduleId: stack.moduleId, path: 'opacity2' }, rate: '1/2' });
```

#### Text render

**`render.createText({id?, sessionId?, text?, size?, color?: {r,g,b,a}?, align?, width?, height?})`** →
a text handle `{ id, sessionId, type: 'text', moduleId, nodeId, nodeType: 'AppTextRender', output:
textureId, text, size, color: {r,g,b,a}, align, width, height, set({...}), setText(t) }`. Renders a
single text string into a **transparent** output RenderTexture. `id` is get-or-create (same `id` → same
module GUID + `output` textureId across reloads); a re-create updates text/size/color/align in place.
`width`/`height` fix the output resolution at creation (keyed re-claim keeps the original size); they
default to the global project resolution.

The render is **dirty-flag driven, not per-frame**: a dedicated offscreen camera + canvas + TMP label
re-render once whenever a property changes and stay idle otherwise (allocation- and GPU-free while
static). Colors are 0..1 per channel. `align` is one of `'left'` | `'center'` | `'right'` (default
`'center'`; a raw code 0..2 is also accepted). An unknown align name is a structured `INVALID_PARAMS`
error listing the valid names. `text.output` (the textureId) feeds mixer/stack inputs, FxChain,
`output.publish`, and `surface.attach` like any other source.

| Method | Params | Notes |
|---|---|---|
| `text.set({text?, size?, color?, align?})` | partial | Writes through the module's bindable members and re-renders once. `color` is a partial `{r,g,b,a}` (any subset). Resolves to the full text JSON. |
| `text.setText(t)` | `t`: string | Sugar for `text.set({ text: t })`. |

**Bindable member paths** (drive with `synapse.bindings.*` against `{ moduleId: text.moduleId, path }`):
`fontSize` (float-writable), `colorR`/`colorG`/`colorB`/`colorA` (0..1, float-writable). `text` (string)
and `alignment` (int) are set via `text.set` / `modules.set`, not continuous binding targets.

```js
// Live BPM readout composited over a mixer via a stack (createStack), pulsing on an LFO.
const clipA = await synapse.render.createPlayer({ id: 'a' });
const clipB = await synapse.render.createPlayer({ id: 'b' });
const mix = await synapse.render.createMixer({ id: 'mix', inputs: [clipA.output, clipB.output], value: 0.5 });

const bpm = await synapse.render.createText({
  id: 'bpm', text: '120 BPM', size: 96, color: { r: 1, g: 1, b: 1, a: 1 }, align: 'center'
});

// Stack the readout ON TOP of the mixer output (slot 0 = mixer, slot 1 = text, screened).
const wall = await synapse.render.createStack({
  id: 'wall',
  inputs: [
    { source: mix.output },                               // slot 0, bottom
    { source: bpm.output, blend: 'screen' }               // slot 1, text on top
  ]
});
await synapse.output.publish(wall.output);                // wall.output → main output

// Update the readout when the tempo changes:
await bpm.setText('128 BPM');
// Pulse the font size with an LFO (bindable member is fontSize):
await synapse.bindings.lfo({ target: { moduleId: bpm.moduleId, path: 'fontSize' }, rate: '1/4', min: 88, max: 104 });
```

#### Fx chain

**`render.createChain({id?, sessionId?, source, effects: [{fx, params?}, ...]})`** → a chain handle
`{ id, sessionId, type: 'chain', moduleId, nodeId, nodeType: 'AppFxChain', output: textureId, source,
effects: [{fx, moduleId, nodeId}, ...], set(index, params) }`. FxChain is **keyed sugar, not a new
renderer**: it instantiates a series of the product's **existing FxShader effect nodes** in your app's
hidden scope, wires them `source → fx1 → fx2 → … → output`, and exposes the chain's `output` textureId
plus **each effect's `moduleId`**. Each effect applies its shader to the running texture; the last
effect's result is the chain `output`.

- `source` is any textureId (a player/layer/stack/text `output`, a `layers.createTextureSource`, another
  chain's `output`). `output` is a real texture: feed it to mixer/stack inputs, `output.publish`,
  `surface.attach`, or another chain's `source`.
- `effects` is an ordered array. Each entry is `{ fx: '<effect id>', params?: { '<shaderProp>': value } }`
  (a bare `'fx.blur'` string is shorthand for `{ fx: 'fx.blur' }`). **Effect ids and their param names
  come from `modules.types()` / `NODE_CATALOG.md`** — an fx id is an FxShader catalog id (e.g. `fx.blur`,
  `fx.glitch`); a param key is a shader property name (e.g. `_Amount`), a float, or `{r,g,b,a}` for a
  color property.
- **Structure is not update-in-place.** On a keyed re-claim (same `id`): if the effects list is
  **unchanged** (same fx ids, same order, same length) the modules are reused in place and their `params`
  are re-applied; if the effects list **changed** (different ids/order/length) the old chain — the host
  module and every effect — is torn down and rebuilt. A changed `source` is rewired in place either way.
- An **unknown fx id** is a structured `NOT_FOUND` hinting you to call `modules.types()` / read
  `NODE_CATALOG.md`; an **unknown param name** is `INVALID_PARAMS` listing the effect's settable
  properties.

| Method | Params | Notes |
|---|---|---|
| `chain.set(index, params)` | `index`: 0-based effect index; `params`: `{ '<shaderProp>': value }` | Updates **one** effect's shader params (sugar over `modules.set` on that effect's module). Structure is immutable here — re-call `createChain` to change which effects run. Resolves to the full chain JSON. |

Each effect's `moduleId` is exposed so you can address the effect for host bindings (`synapse.bindings.*`
against `{ moduleId: fx.effects[i].moduleId, path: '<shaderProp>' }`) — the same property names `chain.set`
takes — driving a shader param audio-reactively / on an LFO the same way you'd drive any other module member.

```js
// A player blurred then glitched.
const clip = await synapse.render.createPlayer({ id: 'clip' });
await clip.load('some-asset-id'); clip.play();

const fx = await synapse.render.createChain({
  id: 'fx',
  source: clip.output,
  effects: [
    { fx: 'fx.blur',   params: { _Amount: 0.2 } },   // fx1
    { fx: 'fx.glitch', params: { _Strength: 0.4 } }  // fx2 (ids/params: modules.types() / NODE_CATALOG.md)
  ]
});
await synapse.output.publish({ id: 'fx-out', source: fx.output, name: 'FX Chain' });

// Update one effect's params later (index 0 = the blur):
await fx.set(0, { _Amount: 0.6 });
```

Note: FX shader properties are set through `chain.set` — they are dynamic shader params, not
module members, so they are NOT valid `bindings.*` targets in v0 (making them bindable is a v1
item). For audio-reactive FX today, drive the param from discrete events, or bind a bindable
member elsewhere in the graph instead (e.g. a stack slot's `opacityN`).

### `synapse.modules`

Low-level, generic module access — an escape hatch for anything not covered by `layers`/`render`/
`output`/`web`. Prefer the higher-level groups when they fit.

| Method | Params | Returns |
|---|---|---|
| `modules.create({type, label?, position?, values?})` | `type`: node type id or class name | `SynapseModule` |
| `modules.get(moduleId)` | — | `SynapseModule` |
| `modules.set(moduleId, path, value)` | `path`: a single member name (no dots); wrappers with a writable `Value` (FloatInput, ReactiveProperty) are written through | `SynapseModule` |
| `modules.types()` | — | the full node-type catalog: `[{ id, title, category, description, inputs, outputs, settable: [{path, type}] }]` — `id` is what `modules.create` accepts, `settable` paths are what `modules.set`/bindings can drive (float paths are bindable). The same data ships as `NODE_CATALOG.md` next to this file — read it before inventing node types. |
| `modules.connect(fromModuleId, fromPort, toModuleId, toPort)` | port names default `'Out'`/`'In'` | `{connected, fromModuleId, fromPort, toModuleId, toPort}` |
| `modules.list()` | — | `SynapseModule[]` |

`SynapseModule` shape: `{ id, moduleId, nodeId, nodeType, typeName, title, label, inputs: Port[],
outputs: Port[] }` where `Port = { id, name, direction, type }`.

Modules created here are owned by your app (cleaned up on stop/reload) but are NOT keyed/get-or-
create — calling `modules.create` twice makes two modules. If you need idempotency, track the
returned `moduleId` yourself, or prefer `render`/`web`/`output`/`layers` which are keyed.

### `synapse.output`

Publishes a `textureId` to a real SR output sink.

| Method | Params | Returns |
|---|---|---|
| `output.publish({id?, source, name?})` | `source`: textureId | `{ id, source, name, moduleId, nodeId, nodeType: 'MediaOut', textureId, publishedAt }` |
| `output.publishSyphon({id?, source, name?})` | macOS Syphon / Windows Spout | `{ id, source, name, serverName, moduleId, nodeId, nodeType: 'SpoutSender', protocol }` |
| `output.publishSpout({id?, source, name?})` | alias of `publishSyphon` | same as above |

`protocol` is `'Spout'` on Windows, `'Syphon'` on macOS, `'Unsupported'` elsewhere. Pass a stable
`id` if you want the output node (and any user wiring from it) to survive reloads — see "Core
concepts" above.

```js
await synapse.output.publish({ id: 'main-out', source: mixer.output, name: 'My Output' });
await synapse.output.publishSyphon({ id: 'main-syphon', source: mixer.output, name: 'My Output' });
```

### `synapse.web`

Secondary WebView windows, exposed as texture sources. Use this for offscreen canvas/WebGL/
Three.js rendering that becomes an SR texture.

**`web.createWindow({id?, title?, html?, url?, publish?, outputName?, width?, height?})`** →
`{ id, windowId, title, textureId, moduleId, nodeId, nodeType: 'AppTextureSource', width, height,
output? }`. Get-or-create when `id` is passed: re-running with the same `id` and unchanged
`html`/`url` reuses the window without reloading it (no flicker); changed content reloads just that
window in place. `publish: true` also calls `output.publish` for you in the same round trip (result
attached as `.output`). `width`/`height` fix the output texture's resolution — pass e.g. `960, 540`
for a clean 16:9 source instead of the host default; applied at creation only (a keyed re-claim
keeps the original size).

```js
const win = await synapse.web.createWindow({
  id: 'my-canvas',
  title: 'My Canvas',
  html: '<canvas id="c"></canvas><script>/* draw with requestAnimationFrame */</script>',
  publish: true,
  outputName: 'My Canvas Output',
  width: 960,
  height: 540
});
// win.textureId is also usable directly, e.g. as a mixer input or surface.attach source.
```

**Child windows have the full bridge too.** The page inside a `web.createWindow` window gets its own
`window.synapse`, same as your main window. Use this to trigger host effects from events that
happen INSIDE the window (a game's jump, a canvas interaction), rather than trying to observe them
from the main window via pointer events on a preview overlay. Input can reach a child window from
several places at once — the window itself, a forwarded surface click, its own keyboard handlers —
so hang host side-effects off the in-window event, the single point they all converge on:

```js
// Inside the child window's html — NOT the main app window:
async function jump() {
  bird.vy = -6.4;                                   // the game event itself...
  const { value: layerId } = await synapse.storage.get('kickLayerId');
  if (layerId) await synapse.layers.setRotationZ(layerId, nextAngle());  // ...drives the host
}
```

**Cross-window state goes through `synapse.storage`.** There is no direct window-to-window
messaging in v0. To pass settings from your main window's UI into a child window (like `layerId`
above), write them to `synapse.storage` in one window and read them in the other — a per-click
`storage.get` is a normal discrete call, not a per-frame loop.

**Per-window registries.** Each window's bridge keeps its OWN lookup tables for imported assets,
registered controls, render sessions, and published-output keys. An `assetId` imported in the main
window is `not_found` from a child window; a control registered in one window cannot be
`setValue`'d or observed from another. Shared, app-wide state is exactly what `synapse.storage` is
for; keyed resources (windows, outputs, texture sources) are instance-wide and safe to reference by
`textureId` across windows.

### `synapse.surface` / `synapse.preview`

Overlays a live SR texture or Layer preview on top of a DOM element in YOUR app window (for
in-app monitoring UI, not for publishing).

| Method | Params | Returns |
|---|---|---|
| `surface.attach(target, {surfaceId?, type?, textureId?, layerId?, pointer?})` | `target`: CSS selector or Element | handle `{ surfaceId, detach(), ... }` |
| `surface.update(target, options)` | re-syncs layout manually (rarely needed) | surface JSON (same as `attach`) |
| `surface.onPointer(surfaceId, handler)` | subscribes to pointer events on the overlay | unsubscribe fn |
| `surface.detach(surfaceId)` | — | — |
| `preview.attach(target, options)` | sugar for `surface.attach` with `type: 'layer-preview'` | same as `surface.attach` |

`attach()` auto-tracks the target element's layout (resize/scroll/mutation) and keeps the overlay
in sync; you generally don't need to call `update()` yourself.

**The `pointer` option** decides what pointer events on the overlay do:

- `'web'` (default) — forwarded into the webview that renders the surfaced texture (texture
  surfaces whose `textureId` came from `web.createWindow`), so clicking the overlay clicks the
  surfaced page. The overlay renders ScaleToFit; clicks on letterbox bars are swallowed. When the
  texture has no owning webview (layer previews, mixer/player outputs), there is nothing to
  forward to and the overlay stays click-through, like `'passthrough'`.
- `'surface'` (alias `'sr'`) — emitted to your `surface.onPointer(surfaceId, handler)` handlers
  only. The event is `{ phase: 'down'|'move'|'up'|'wheel', normalized: {x, y}, position, ... }`
  (see `SynapseSurfacePointerEvent` in `synapse.d.ts`).
- `'both'` — forwarded AND emitted (interactive preview + your own handling in one).
- `'none'` — captured and discarded; `'passthrough'` — the overlay ignores events entirely and the
  DOM element underneath receives them.

```js
// An interactive game/canvas preview: clicks reach the window behind the texture, and the app
// also observes them (e.g. to trigger host-side effects per click).
const surface = await synapse.surface.attach('#preview', {
  type: 'texture', textureId: win.textureId, pointer: 'both'
});
synapse.surface.onPointer(surface.surfaceId, (event) => {
  if (event.phase === 'down') { /* react to the click app-side */ }
});
```

### `synapse.controls`

A registry that makes Web UI controls visible to the SR host — and, with `midi: true` plus an
associated element, **automatically MIDI-learnable on your own UI**: in SR's learn mode the
click-to-select overlay appears right on your control, exactly like a native SR slider. No separate
`bindings.midi` call, no "arm MIDI" button.

| Method | Params | Returns |
|---|---|---|
| `controls.register({id, label?, type?, value?, min?, max?, step?, midi?, anchor?, group?, path?})` | `id` required | handle `{ ...control fields..., setValue(value), onChange(handler) }` |
| `controls.setValue(controlId, value)` | — | `SynapseControl` |
| `controls.list()` | — | `SynapseControl[]` |
| `controls.onChange(controlId, handler)` | `handler(value, control)` — client-side subscription to `control.update` events, not a host round trip | unsubscribe fn |

The element association for `midi: true` comes from either the `anchor` option (CSS selector or
Element) or a DOM node carrying `data-synapse-control="<id>"`. `midi: true` with NO associated
element registers metadata only (arm explicitly via `bindings.midi` if you want the edge-chip
fallback). The auto-armed binding uses the control's `min`/`max` and routes through the control, so
your `onChange` fires and the Web UI stays in sync with the physical fader.

```js
// <input type="range" id="fader" data-synapse-control="crossfade">  ← that attribute is enough
const fader = await synapse.controls.register({
  id: 'crossfade', label: 'Crossfade', type: 'float', min: 0, max: 1, value: 0, midi: true
});
fader.onChange((value) => mixer.setValue(value));
slider.addEventListener('input', (e) => fader.setValue(Number(e.target.value)));
// (equivalently, pass it explicitly: { midi: true, anchor: '#fader' })
```

Note: `setValue` also echoes back to YOUR OWN `onChange` handlers (the `control.update` event is
emitted unconditionally). Keep handlers idempotent — like the example above, where re-applying the
same mixer value is harmless — and don't call `setValue` from inside `onChange`, which would loop.

## The SDK layer (`synapse-sdk.js`)

Include it once: `<script src="./synapse-sdk.js"></script>` (before your own script). It attaches
`window.SynapseSDK` and wraps the raw bridge in small handle objects. It adds no new capability —
everything it does is expressible via `window.synapse` directly — it just removes boilerplate for
the common path (texture-or-handle normalization, cached `.value.get()`).

```js
const app = await SynapseSDK.connect();       // waits for window.synapse, pings once

const deckA = await app.textureSource('deck-a', { layer: 'selected' });
const canvas = await app.webWindow('canvas', { title: 'Canvas', html: '...' });
const mixer = await app.mixer('mix', { type: 'crossfade', inputs: [deckA, canvas], value: 0.5 });

await mixer.value.set(0.8);
mixer.value.get(); // 0.8, no round trip

await app.publishMedia('main-out', { source: mixer, name: 'My Output' });
await app.publishSpout('main-spout', { source: mixer, name: 'My Output' });

const fader = await app.control('fade', { label: 'Fade', min: 0, max: 1, value: 0.5, midi: true });
fader.onChange((value) => mixer.value.set(value));
fader.value.set(0.2);

await app.ready();
```

Every SDK method that takes a `source`/`inputs` entry accepts either a raw `textureId` string or
any handle returned by the SDK (it reads `.textureId` or `.id` off the object). All SDK creation
methods (`textureSource`, `webWindow`, `mixer`, `publishMedia`, `publishSpout`, `control`) are
get-or-create by the `key` you pass as the first argument — same rules as the raw bridge's `id`.

Host-side parameter bindings are available on value handles: `mixer.value` and `control.value` gain
`.bindMidi(opts)`, `.lfo(opts)`, `.follow(opts)`, and `.unbind(id)`. These declare modulation that
runs NATIVELY in the host — JS is never called per frame. This is the intended way to do continuous
control; see "Parameter bindings" below.

## Complete worked example: A/B crossfader with MediaOut + Spout/Syphon

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>A/B Crossfader</title>
  <style>
    body { margin: 0; background: #101114; color: #f4f5f7; font-family: sans-serif; }
    main { padding: 16px; display: grid; gap: 12px; }
    input[type="range"] { width: 100%; }
  </style>
</head>
<body>
  <main>
    <h1>A/B Crossfader</h1>
    <label>Deck A path <input id="pathA" type="text" placeholder="/path/to/a.mov"></label>
    <button id="loadA">Load A</button>
    <label>Deck B path <input id="pathB" type="text" placeholder="/path/to/b.mov"></label>
    <button id="loadB">Load B</button>
    <input id="crossfade" type="range" min="0" max="1" step="0.001" value="0.5">
  </main>

  <script src="./synapse-sdk.js"></script>
  <script>
    async function boot() {
      const app = await SynapseSDK.connect();

      // The SDK's own methods cover texture sources/windows/mixers/outputs/controls, but media
      // players (with .load(assetId)) are only on the raw bridge in v0 — use synapse.render
      // directly for the two decks, and the SDK for the mixer + outputs built on top of them.
      const deckA = await synapse.render.createPlayer({ id: 'deckA' });
      const deckB = await synapse.render.createPlayer({ id: 'deckB' });

      const mixer = await app.mixer('ab-mix', {
        type: 'crossfade',
        inputs: [deckA.output, deckB.output],
        value: 0.5
      });

      await app.publishMedia('ab-main-out', { source: mixer, name: 'A/B Crossfader' });
      await app.publishSpout('ab-main-spout', { source: mixer, name: 'A/B Crossfader' });

      // Make the crossfade MIDI-learnable (assign a fader in SR's MIDI learn mode). Runs host-side —
      // no per-frame JS. Swap for `mixer.value.lfo({ rate: '1' })` to auto-sweep it instead.
      await mixer.value.bindMidi({ min: 0, max: 1 });

      const slider = document.querySelector('#crossfade');
      slider.addEventListener('input', (e) => mixer.value.set(Number(e.target.value)));

      document.querySelector('#loadA').onclick = async () => {
        const asset = await synapse.assets.importPath(document.querySelector('#pathA').value);
        await deckA.load(asset.id);
      };
      document.querySelector('#loadB').onclick = async () => {
        const asset = await synapse.assets.importPath(document.querySelector('#pathB').value);
        await deckB.load(asset.id);
      };

      await app.ready();
    }

    boot().catch(console.error);
  </script>
</body>
</html>
```

(This mixes raw bridge and SDK calls deliberately, to show both are safe to combine — the SDK is a
convenience wrapper, not a separate state model. See `Samples/SdkCrossfaderSample.html` in the SR
repo for a version written entirely against the SDK's session-free `app.mixer` player pattern.)

## Parameter bindings (host-side modulation)

Continuous control runs in the host, not in JS. A **binding** declares how a target parameter is
driven — from MIDI, an LFO, or an audio band — and the host updates it every frame natively. Your JS
just declares the binding once and then idles; there is no per-frame bridge traffic.

Bindings live on **value handles**: `mixer.value` and `control.value` (SDK), or address any module
member directly via the raw bridge with a `{moduleId, path}` target.

```js
// Auto-sweep the crossfade on a tempo-synced LFO (one bar per cycle), synced to the global BPM /
// Ableton Link. The JS crossfader UI can sit completely idle — the mix keeps moving.
await mixer.value.lfo({ rate: '1', shape: 'sine', min: 0, max: 1 });

// Or follow the bass band:
await mixer.value.follow({ source: 'audio.bass', min: 0, max: 1, smooth: 0.5 });

// Make a control MIDI-learnable (it appears in SR's MIDI learn mode; assign a fader/knob). A
// control-targeted binding also fires the control's onChange, so your Web UI stays in sync:
await crossfade.value.bindMidi({ min: 0, max: 1 });

// Remove a binding by the id it returned (or an explicit id you passed):
const lfo = await mixer.value.lfo({ id: 'sweep', rate: '1' });
await mixer.value.unbind(lfo.id);
```

Raw bridge equivalent (no SDK):

```js
await synapse.bindings.lfo({ target: { moduleId: mixerModuleId, path: 'mixValue' }, rate: '1' });
await synapse.bindings.midi({ target: { controlId: 'fade' }, min: 0, max: 1 });

// anchor (recommended): pin the MIDI-learn overlay onto YOUR page control. Pass a CSS selector or
// an Element; in SR's learn mode the click-to-select overlay then sits exactly over that button and
// follows it through resizes/layout changes. Without `anchor`, the learn target appears as a
// labeled chip docked at the right edge of the SR window instead — functional, but users look for
// it on your UI, so pass the anchor whenever the binding corresponds to a visible control.
await synapse.bindings.midi({ target: { controlId: 'fade' }, min: 0, max: 1, anchor: '#fadeMidiBtn' });
```

- **Rate** is a musical division in **bars**: `"1/4"`, `"1/2"`, `"1"` (= one bar = 4 beats), `"2"`,
  `"4"`. Pass `{ hz: n }` instead for a free-running (non-tempo) rate.
- **Shape** is `sine` | `triangle` | `saw` | `square`. **source** for `follow` is `audio.level` |
  `audio.bass` | `audio.mid` | `audio.high`.
- All three are **keyed get-or-create**: the host derives a default id from the target (e.g.
  `lfo:{moduleId}.mixValue`), so re-running `boot()` re-uses the same binding rather than stacking
  duplicates. Pass your own `id` to manage several bindings on one target.
- **A learned MIDI mapping survives a reload** (the binding is host-side and re-claimed by id, so it
  is not re-registered — the CC you assigned keeps working). It does not survive a full Stop or a
  project round-trip in v0.
- **`anchor`** (MIDI only, optional): a CSS selector or Element for the page control this binding
  belongs to. The MIDI-learn overlay is then rendered IN YOUR PAGE, exactly on that element (the SDK
  draws it during SR's learn mode; clicking it selects the binding) instead of as a chip at the SR
  window's edge. The anchor must live in the SAME window that calls `bindings.midi`.
- **`bindings.badge(handle, host?)`** (anchored bindings only): a small always-visible chip rendered
  into `host` (selector/Element; defaults to the anchor's parent) that reads `MIDI` until a signal
  is learned, then the assignment (e.g. `CC 7 ch1`). In learn mode clicking it selects the binding,
  same as the overlay. Place it to make your app visibly MIDI-capable at a glance.

### MIDI learn UI — the natural model

Design rule: **a control that has an associated element IS a MIDI-learn target.** Do not build "arm
MIDI" buttons; associate the element and you are done. Three tiers, cheapest first:

1. `controls.register({ ..., midi: true })` with a DOM node carrying
   `data-synapse-control="<id>"` — fully automatic, zero extra code.
2. `controls.register({ ..., midi: true, anchor: '#el' })` — same, explicit element.
3. `bindings.midi({ target, anchor })` — for module-member targets (`{moduleId, path}`) or when you
   want the returned handle (e.g. to place a `bindings.badge`).

In SR's learn mode the SDK renders a click-to-select overlay **inside your page, exactly on each
associated element** — pixel-perfect through scrolling, window drags and resizes, because the page
owns the geometry. Values learned via MIDI route through the control, so your `onChange` fires and
your UI follows the physical fader.

Your page can also react to learn-mode state directly — the bridge dispatches window events:

```js
// {active, selectedTargetId} — learn mode toggled / selection changed
window.addEventListener('synapse:midi-learn', (e) => showLearnBanner(e.detail.active));
// {targetId, signal, removed} — a mapping was assigned or removed; signal is the normalized
// key ("midi:cc:0:7" = CC7 ch1, "midi:note:8:41" = note 41 ch9)
window.addEventListener('synapse:midi-mapped', (e) => updateAssignmentCounter(e.detail));
```

The `midi-gallery` sample is the reference implementation: 42 controls (buttons, toggles, vertical
faders, sliders, rotary knobs, pads) across six layouts, exercising every tier plus the events.

## Persistence: your app belongs to the project

A running app is saved WITH the SynapseRack project (like a Max for Live device saved with a set).
When the user reopens the project, SR **auto-restarts your app** from its folder — you do not need
to do anything for the restart itself. Two things you *can* opt into make the round-trip seamless:

### `app.setState` / `app.onRestore` — save-with-project state

Push your app's UI state to the host with `app.setState(state)`; it is saved when the *project* is
saved (not on every call, so calling it on every change is cheap). On reopen, after your `boot()`
runs and calls `app.ready()`, the host delivers that state back through `app.onRestore(fn)`.

```js
// Persist the crossfade position:
slider.addEventListener('input', (e) => {
  const value = Number(e.target.value);
  mixer.value.set(value);
  synapse.app.setState({ fade: value });   // saved with the project
});

// Restore it when the project reopens (register any time — if the event already fired, your handler
// still gets the cached state immediately, so ordering never makes you miss it):
synapse.app.onRestore((state) => {
  if (state && typeof state.fade === 'number') {
    slider.value = state.fade;
    mixer.value.set(state.fade);
  }
});

await synapse.app.ready();   // onRestore fires right after this, if there was saved state
```

- **What is saved:** the latest value you passed to `setState`, captured at project-save time.
- **When restored:** once, per restored run, right after `app.ready()` — never before your setup ran.
- With the SDK: `app.setState(obj)` and `app.onRestore(fn)` are the same calls on the `app` handle.

### Your outputs and user wiring survive the round-trip

If you pass a **stable `id`** to `output.publish` / `output.publishSyphon` / `output.publishSpout`
(you should — see "Core concepts"), the MediaOut/Spout node keeps its identity across a project
round-trip: SR records its node id, recreates it with the same id on restart, and **reconnects any
wiring the user drew from your output into their own graph**. Unkeyed outputs do not get this.

### `synapse.storage` — per-app storage, independent of projects

For data that should NOT be tied to a single project — presets, caches, last-used settings — use
`synapse.storage`. It is a per-app key-value store persisted in the OS user-data folder; values
survive Start/Stop/Reload and are shared across every project the app runs in.

| Method | Params | Returns |
|---|---|---|
| `storage.get(key)` | — | `{ key, value, exists }` |
| `storage.set(key, value)` | `value`: any JSON | `{ key, value, ok: true }` |
| `storage.delete(key)` | — | `{ key, removed }` |
| `storage.list()` | — | `{ keys: string[] }` |

```js
await synapse.storage.set('lastDeckA', '/path/to/a.mov');
const { value, exists } = await synapse.storage.get('lastDeckA');
```

**setState vs storage:** `app.setState` saves WITH the current project (per-project state); `storage`
is project-independent (global to the app). Use setState for "what this project's instance was doing",
storage for "this app's presets/caches regardless of project".

## Multi-instance apps (`multiInstance: true`)

By default an app is **single-instance**: launching it again just focuses the one window, and its
identity everywhere is exactly its `appId`. Add `"multiInstance": true` to `synapse-app.json` to let
the app run as **many concurrent copies (slots)** at once — each Start/click in the AppHub or Apps
menu launches a new slot.

```json
{
  "id": "local.per-layer-tool",
  "name": "Per-Layer Tool",
  "entry": "index.html",
  "apiVersion": 0,
  "multiInstance": true
}
```

What is per-slot vs shared:

- **Per-slot (isolated):** `instanceId` (= `appId#slot` for slot > 1, just `appId` for slot 1), the
  hidden graph scope, published outputs (their display names get a ` (2)` suffix so they are
  distinguishable), MIDI scoping, window title, **and `app.setState` / `app.onRestore`** — each slot
  carries its own saved state, and reopening a project restores every slot into the same slot number.
- **Shared across slots:** `synapse.storage` (keyed by the plain `appId`) — so presets/caches are
  common to every copy.

Read `slot` from `app.ping()` to know which copy you are — a natural default for "act on the Nth
thing". Motivating pattern — launch the same app once per Layer, each slot remembering its target:

```js
const { slot } = await synapse.app.ping();
const layers = await synapse.layers.list();

// Restore the slot's own remembered target layer, or default to the slot-th layer.
let targetLayerId = null;
synapse.app.onRestore((state) => { targetLayerId = state?.layerId ?? null; });
await synapse.app.ready();

if (!targetLayerId) {
  targetLayerId = layers[Math.min(slot - 1, layers.length - 1)]?.id;
  synapse.app.setState({ layerId: targetLayerId });   // remember it with the project
}

// This slot now drives ITS layer; a second slot launched onto another layer keeps its own target.
await synapse.layers.setOpacity(targetLayerId, 0.5);
```

For a single-instance app all of the above collapses to the v0 behavior: `slot` is always `1`,
`instanceId === appId`, and nothing is suffixed.

## Limits and gotchas

- **No per-frame JS control loops.** The bridge is not a render/animation loop — do not
  `requestAnimationFrame` and call `mixer.setValue`/`.value.set` every frame from JS; that adds
  bridge round-trip overhead SR is designed to avoid. For continuous modulation use host-side
  parameter bindings (`.value.lfo()`, `.value.follow()`, `.value.bindMidi()`) — they update the value
  natively with no JS round trip (see "Parameter bindings"). Drive one-off changes from discrete user
  input (slider `input`/`change` events, button clicks).
- **`render.createSession` is a deprecated no-op shim.** Sessions were never engine objects; do not
  call it in new code — `createPlayer`/`createMixer` work directly (optional `sessionId` defaults to
  a shared namespace).
- **`controls.register` is not strictly get-or-create** — re-registering the same `id`
  overwrites the previous control's metadata under the same id (which is fine for idempotent
  `boot()` re-runs), but there is no in-place-update distinction the way mixers/outputs have.
- **No direct window-to-window messaging.** Each window (main and `web.createWindow` children) has
  its own bridge; share state between them via `synapse.storage`, and put host side-effects in the
  window where the triggering event actually happens (see "Child windows have the full bridge too").
- **Only one mixer type exists:** `'crossfade'`, exactly 2 inputs.
- **`app.ready()` is required**, not optional, if you want reloads to reconcile cleanly. Always
  call it once at the end of `boot()`.
- **Single-file apps still work with zero SDK.** `synapse-sdk.js` is optional sugar; everything is
  reachable through `window.synapse` directly, and the raw bridge keeps working even if you never
  include the SDK script.
- **Samples that ship as a single `.html` file (no adjacent project files)** must inline
  `synapse-sdk.js`'s contents directly in a `<script>` tag rather than `<script src="...">`, since
  such files may be loaded as standalone content without their sibling files. Real projects (a
  folder with `synapse-app.json`) can use `<script src="./synapse-sdk.js">` normally.

## Developing against a live rack (MCP server)

If you are an AI assistant building an app: SynapseRack ships a **dev-mode MCP server** you may be
connected to (Streamable HTTP on `http://127.0.0.1:8765/`, off by default — the user enables it via
*SynapseRack > Synapse Apps > MCP Server* or the AppHub toolbar). It turns "write code blind" into a
verify loop against the LIVE rack:

- `list_apps` — running app instances (address the others by `instanceId`)
- `invoke { appId, method, params }` — call ANY method in this document on a running app and see
  the real result (e.g. `bindings.list` to confirm your bindings actually armed)
- `read_console { appId, severity? }` — the app's console; check `severity: "error"` after edits
- `reload_app { appId }` — hot-reload after editing `main.js`, then re-verify
- `graph_state` / `graph_node_types` / `graph_create_node` / `graph_delete_node` / `graph_connect` /
  `graph_disconnect` — operate on the USER'S visible node graph (not your app's hidden scope);
  changes are undoable by the user, so be conservative and `graph_state` before mutating

Recommended loop: edit → `reload_app` → `read_console` for errors → `invoke` to assert the resulting
state — instead of asking the user to eyeball every change. Full setup and security notes live in
the SDK repository's `docs/MCP_SERVER.md`.

# SynapseRack Apps SDK

[日本語](README.md)

> **How to read these docs**
>
> Most of the documentation here is written **for AI assistants**, not for humans. To build something, hand this README and the [`docs/`](docs/) folder to your AI and describe what you want — that's really all it takes.
>
> The parts meant for you, the human: [installing an app](#install-an-app) (it's just dropping a folder) and the App Hub steps under [creating an app](#create-an-app). Everything beyond that is optional reading, if you're curious.

Build windowed JavaScript apps that run **inside [SynapseRack](https://github.com/SainaKey/SynapseRack)** — the node-based VJ environment. An app is a plain HTML/JS folder: no build step, no toolchain, hot-reloaded on save. Apps talk to the host through the `window.synapse` bridge to play media, composite offscreen layers, publish textures into the user's node graph, and bind parameters to MIDI / LFO / audio.

> **Status: v0 preview.** The API surface is documented in [`docs/SYNAPSE_API.md`](docs/SYNAPSE_API.md) and may change before v1.

## What an app can do

- **Open windows** with your own HTML UI (`synapse.web.createWindow`), including texture surfaces that display live host textures with pointer forwarding.
- **Render offscreen**: media players, real compositor layers, an 8-input stack mixer, text rendering, and FX shader chains (`synapse.render.*`) — all running the same engine code as the product, invisible to the user's layer stack until you publish.
- **Publish outputs**: `synapse.output.publish` turns any texture you own into a `MediaOut` node the user can wire anywhere in their graph. Wiring survives app reloads and project save/load.
- **Bind parameters** host-side (`synapse.bindings`): MIDI CC, tempo-synced LFOs, audio-follow — no per-frame JavaScript involved.
- **Drive the node graph** (`synapse.modules`): create nodes, set members, connect ports. `synapse.modules.types()` returns the full machine-readable node catalog ([human-readable version](docs/NODE_CATALOG.md)).
- **Import assets** (`synapse.assets`): native file picker, path import with automatic format classification (HAP / VLC / video / image / shader), URL download.
- **Persist state**: `synapse.storage` (per-app, machine-level) plus per-instance state that restores with the user's project.
- **Run multiple instances**: opt in with `"multiInstance": true` and each launch gets its own slot (`appId`, `appId#2`, …) with isolated windows and outputs.

## Install an app

1. In SynapseRack: **Apps → Open Apps Folder** (defaults to `C:\SainaWorks\SynapseRack\Apps\`).
2. Copy an app folder in (e.g. `samples/ab-deck-mixer/`).
3. It appears in the **Apps** menu and the **App Hub**. Click to launch.

Install *is* the file drop — no packaging, no registration.

## Create an app

Fastest path: **Apps → App Hub → New Project**. This scaffolds the [template](template/) plus a copy of the API docs next to your code, and dev-links the folder: every save hot-reloads the running app (~1 s), and keyed resources (windows, outputs, user wiring into your MediaOuts) survive the reload.

Or start by hand: copy [`template/`](template/) anywhere, edit `synapse-app.json` (`id`, `name`), and add the folder via App Hub → Add Project.

### Manifest (`synapse-app.json`)

```json
{
    "id": "yourname.your-app",
    "name": "Your App",
    "version": "0.1.0",
    "entry": "index.html",
    "apiVersion": 0,
    "capabilities": [],
    "multiInstance": false
}
```

`id` must be unique per installed app. `multiInstance` is optional (default `false`).

## Building with an AI assistant

The docs are designed to be the prompt:

- [`docs/SYNAPSE_API.md`](docs/SYNAPSE_API.md) — the complete bridge/SDK reference. Paste it (or attach it) and ask for the app you want; a competent model can produce a working app one-shot.
- [`docs/synapse.d.ts`](docs/synapse.d.ts) — exact TypeScript shapes for every call.
- [`docs/NODE_CATALOG.md`](docs/NODE_CATALOG.md) — every node type `synapse.modules` can create, with ports and settable members. Auto-generated from the live node registry.

For an agentic loop, SynapseRack ships a **dev-mode MCP server** (off by default, loopback-only, per-session opt-in). A single `invoke` tool reaches every bridge API of a running app, so an assistant can drive and debug a live SynapseRack while you watch. Setup, the full tool list, and example workflows: [`docs/MCP_SERVER.en.md`](docs/MCP_SERVER.en.md).

## Samples

| Sample | Shows |
| --- | --- |
| [`ab-deck-mixer`](samples/ab-deck-mixer/) | Two media decks with native file picking, transport controls, an A/B crossfader with MIDI bind + auto-LFO, published as a `Deck Mixer` output. Multi-instance enabled — launch several independent mixers. |
| [`flappy-fx`](samples/flappy-fx/) | A playable game whose jumps kick FX on a user-chosen layer and whose tap rhythm drives the global BPM — apps as instruments, not just panels. |
| [`color-pad`](samples/color-pad/) | A color-flash instrument on a published window (`web.createWindow` with `publish`): pads + full-bleed color, cut/momentary modes, fade — all page-local animation, zero per-frame bridge calls. |
| [`bg-looper`](samples/bg-looper/) | A set-and-forget background video playlist: auto-advance driven by the player's `onEnd` event, playlist persisted in `storage`, missing files skipped without stalling. |
| [`control-surface`](samples/control-surface/) | A performance panel for the user's existing layers (`layers.list` → opacity / rotation-Z faders) — and an honest note on what v0 bindings can't target yet. |
| [`vj-notepad`](samples/vj-notepad/) | Live text overlays (`render.createText`): size/color/align on the fly, an 8-slot preset bank persisted in `storage`, flash mode. |
| [`spout-ndi-bridge`](samples/spout-ndi-bridge/) | External texture I/O: the app creates Spout/NDI receiver nodes (`modules.create/set/connect`), composites them on a stack, and sends the result out three ways — MediaOut, Spout/Syphon, NDI. |
| [`reactive-pad`](samples/reactive-pad/) | A performance surface where MIDI learn + audio-follow are VISIBLE: host-side bindings drive text size/opacity — the moving pixels are the input display. |
| [`osc-midi-sender`](samples/osc-midi-sender/) | App UI → OSC/MIDI out, built entirely from catalog nodes with a wiring diagram in the UI — doubles as a `modules` API teaching aid, with v0's inbound limitations documented honestly. |
| [`midi-gallery`](samples/midi-gallery/) | A MIDI-learn benchmark: 38 controls (buttons / toggles / vertical faders / sliders / pads) across five layouts, every one always learnable. Demonstrates both auto-arm (`midi: true` + `anchor`) and explicit arm + badge. |

Each sample folder is a complete app: copy it into your Apps folder as-is.

## Repository layout

```
docs/       API reference, node catalog, TypeScript definitions (snapshots generated from the product)
template/   what App Hub's "New Project" scaffolds — a minimal working app
samples/    complete example apps, one folder each
```

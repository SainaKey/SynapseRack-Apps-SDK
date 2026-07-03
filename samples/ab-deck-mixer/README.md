# AB Deck Mixer

Two media decks, one crossfader — the "hello world" of VJ apps.

- **Deck A / Deck B**: pick any media file with the native picker (`synapse.assets.pickFile`); the file is classified automatically (HAP / video / VLC / image) and played on an offscreen player (`synapse.render.createPlayer`).
- **Transport** per deck: play / pause / loop.
- **Crossfader**: an offscreen A/B mixer (`app.mixer()`), published to the node graph as a `Deck Mixer` MediaOut (`synapse.output.publish`) — wire it into your layer stack, master out, or anything else.
- **MIDI**: bind the crossfader to any CC (`synapse.bindings.midi`), or press **AUTO** for a tempo-synced LFO sweep (`synapse.bindings.lfo`). Both run host-side — no per-frame JS.
- **Multi-instance**: the manifest sets `"multiInstance": true`, so every launch from the Apps menu opens another independent mixer (its own decks, its own published output).

Install: copy this folder into your Apps folder (**Apps → Open Apps Folder**).

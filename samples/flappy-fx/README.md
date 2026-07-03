# Flappy FX

A playable Flappy-Bird-like game that treats SynapseRack as its instrument:

- **Jump = FX kick**: every flap fires an FX kick on a layer you choose from a dropdown (`synapse.layers` + host-side FX control) — the visuals pulse with your play.
- **Tap tempo = global BPM**: your flap rhythm is measured as a tap tempo and pushed to SynapseRack's Global BPM node (`synapse.modules`), so the whole project follows the game. The current BPM is shown in the game HUD.
- Score UI, collision, the usual — all plain HTML/JS in one file, no build step.

It demonstrates that an app is not just a control panel: it can be an interactive source of musical/visual events.

Install: copy this folder into your Apps folder (**Apps → Open Apps Folder**).

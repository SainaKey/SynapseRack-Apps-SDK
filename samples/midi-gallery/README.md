# MIDI Gallery

A **control-surface benchmark for the MIDI learn system**: 42 controls across six different
layouts, every single one always MIDI-learnable — no "arm MIDI" buttons anywhere (the natural
model: registering a control with an associated element IS what makes it a learn target).

| Section | Controls | Layout | Wiring pattern |
| --- | --- | --- | --- |
| Momentary | 4 buttons | horizontal row | `controls.register({ midi: true, anchor })` — auto |
| Toggles | 8 switches | 4×2 grid | auto |
| Mixer | 6 vertical faders | fader strip | explicit `bindings.midi` + `bindings.badge` |
| Trims | 4 compact sliders | dense rows | explicit + badge |
| Knobs | 4 rotary knobs | knob row | explicit + badge — same wiring as a slider, different skin (drag vertically) |
| Pads | 16 pads | 4×4 grid | auto |

## What to benchmark

1. Enter **MIDI-learn mode** in SynapseRack. All 42 overlays must appear exactly on their controls.
2. **Scroll the page, drag and resize the window** while learn mode is on — overlays must stay glued
   (they are rendered in-page, repositioned per animation frame while learn mode is active).
3. Click any overlay (turns red), move a fader / hit a pad **hard** (the host gates NoteOn velocity
   ≤ 60%). The badge on mixer/trim rows switches from `MIDI` to the learned signal (`CC 7 ch1`).
4. The header counter tracks assignments live (via the bridge's `synapse:midi-mapped` window event);
   the LEARN MODE banner tracks `synapse:midi-learn`.

## Behavior notes

- **Momentary** (buttons/pads): a mapped NoteOn drives the value with its velocity; NoteOff routes 0
  back, so hardware pads release exactly like the mouse. Pads flash with velocity.
- **Toggles** display `value >= 0.5` — a mapped CC acts as a threshold switch. Latching from
  momentary notes is app policy, deliberately not built in here.
- This app is UI-only (no render pipeline) — it isolates the controls/bindings path, which is what
  makes it a clean benchmark.

## APIs exercised

`controls.register` (`midi: true` + `anchor` auto-arm), `controls.setValue` / `onChange`,
`bindings.midi` (`anchor`), `bindings.badge`, and the `synapse:midi-learn` / `synapse:midi-mapped`
window events.

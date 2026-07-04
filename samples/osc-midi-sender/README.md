# OSC / MIDI Sender

Outbound control — the app's UI drives **OSC** messages and **MIDI CC** out, built **entirely from catalog nodes the app creates in its own hidden scope**. This sample exists to demonstrate the low-level `synapse.modules.create / set / connect` pattern for I/O nodes, so the on-screen wiring diagram mirrors the graph the app actually builds.

## What it builds

Two independent lanes, each a `float` value source wired into an output node:

```
OSC lane:   float ──Out──▶ In ──  OSCFloatOutput   (currentOSCAddress)
MIDI lane:  float ──Out──▶ Val ── midi_output      (currentDeviceName / currentChannel / currentNumber)
```

- **OSC lane** — an address field (written to `OSCFloatOutput.currentOSCAddress` via `modules.set`) and a value slider. The slider writes the `float` node's `currentValue`; the wired edge carries it to `OSCFloatOutput.In`.
- **MIDI lane** — device-name / channel / CC-number fields (each a `modules.set` on the `midi_output` node) and a value slider through a `float` node into `Val`.
- Settings (address, device, channel, number) persist in `synapse.storage`, so they survive Start/Stop/Reload and are shared across projects.

Copy this folder into your Apps folder (**Apps → Open Apps Folder**) to install.

## How emission actually fires (read this — it shapes the app)

Verified against the module source, not assumed:

- **`OSCFloatOutput` sends when its `In` float *changes*** (`floatInput.OnFloatChanged` → `SendOSCMessage`). Its `Trigger` port exists on the node type but this module does not act on it.
- **`midi_output` sends when its `Val` float changes** (or on a `Trig` edge).
- **The `float` node pushes its `Out` whenever `currentValue` changes.**

So writing the `float` node's `currentValue` with `modules.set` propagates the new value across the connected edge and the output node emits — **no explicit trigger call is needed for a value that changed.** That is the whole mechanism this app relies on, and it works today.

**Constraint — re-sending the same value does nothing.** `currentValue` is a distinct-until-changed `ReactiveProperty`, so writing the *same* number twice does not re-emit. The nodes' `Trigger` / `Trig` ports are the intended "re-emit this value now" path — but see below.

## Honest limitations (apiVersion 0)

This section is the point of the sample: it shows exactly where v0 outbound I/O stops.

1. **No way to fire a trigger port from JS.** The bridge registers only `modules.create / get / set / connect / list / types` — there is **no `modules.trigger`**. So the `Trigger`/`Trig` ports on the output nodes cannot be pulsed from an app. Practically: you can send *changing* values, but you cannot force a re-send of an unchanged value, and you cannot send a bang/note with no value change. Firing trigger ports (`modules.trigger(moduleId, port)`) is a **v1 roadmap item**.
2. **No value read-back.** There is no `modules.get`-style live value read that returns a running float. The app is write-only into the graph; it cannot confirm the emitted value except by having written it.
3. **Inbound is graph-only.** v0 apps **cannot receive OSC or MIDI events in JS.** The catalog has `OSCFloatInput` / `OSCBoolInput` / `OSCIntInput` (and MIDI-in) nodes, but their outputs can only be **wired onward inside the SR graph** — there is no callback delivering an incoming OSC/MIDI message to app JavaScript. Bidirectional app I/O (JS-visible inbound events) is a **v1 roadmap item**.

## MIDI note: CC vs NoteOn

`midi_output` defaults to **NoteOn**. Its message type (`NoteOn` / `NoteOff` / `ControlChange`) is a node-side dropdown that is **not** in the node's `settable` list, so this app cannot switch it via `modules.set`. To send true CC, set **Type = ControlChange** on the `midi_output` node in the SR graph. The velocity/CC value is `round(value × 127)`.

## Reload idempotency

`modules.create` is **not** keyed / get-or-create (unlike `render.*` / `output.*`), so calling it twice makes two nodes. Unkeyed modules the app created are swept on reload. This sample therefore:

- **rebuilds both node chains fresh on every `boot()`** (the previous run's nodes were swept), and
- **persists only user settings** (address / device / channel / number) in `synapse.storage`, never module ids — a swept module id is meaningless on the next run.

If a `modules.set` ever hits `not_found` mid-session (the node was swept out from under us), the lane is rebuilt once and the write retried — the pattern the docs recommend for unkeyed modules.

## Every `synapse.*` call used

| Call | Where | Purpose |
|---|---|---|
| `SynapseSDK.connect()` | boot | wait for the bridge, ping once |
| `synapse.storage.get / set` | boot + field changes | persist address / device / channel / number |
| `synapse.modules.create({ type: 'float' })` | `buildLane` | value-source node per lane |
| `synapse.modules.create({ type: 'OSCFloatOutput' })` | `buildOscLane` | OSC output node |
| `synapse.modules.create({ type: 'midi_output' })` | `buildMidiLane` | MIDI output node |
| `synapse.modules.connect(floatId, 'Out', outId, 'In'/'Val')` | `buildLane` | wire float `Out` → output `In`/`Val` |
| `synapse.modules.set(outId, 'currentOSCAddress', …)` | OSC | set OSC address |
| `synapse.modules.set(outId, 'currentDeviceName'/'currentChannel'/'currentNumber', …)` | MIDI | set device / channel / CC number |
| `synapse.modules.set(floatId, 'currentValue', v)` | slider | emit — value flows across the wire |
| `app.ready()` | boot | mark setup complete (reload reconciliation) |

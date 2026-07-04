# Spout / NDI Bridge

External texture I/O in one SynapseRack App panel: pull external **Spout** and **NDI** sources in,
composite them, and push the result back out three ways.

## What it shows

- **IN** — a `SpoutReceiver` and an `NDIReceiver`, created via `synapse.modules.create`, living in
  the app's hidden scope. Two text fields set the Spout source name / NDI source name on the
  receivers' settable members (applied on **Enter** or the **Apply** button — never per keystroke).
- **COMPOSITE** — a keyed `render.createStack` composites the two receiver outputs (Spout on the
  bottom slot, NDI on top). The receiver outputs are wired into the stack's input ports with
  `synapse.modules.connect`, and each input has an opacity slider driven through the stack handle.
- **OUT** — the stack output is published three ways at once:
  - **MediaOut** named `Bridge` (`output.publish`) — any node/output in the project can pick it up.
  - **Spout/Syphon** named `Bridge` (`output.publishSpout`) — Spout on Windows, Syphon on macOS.
  - **NDI** — an `NDISender` (`modules.create` + `modules.connect` from the stack output), with a
    text field for the send name.
- **Persistence** — the entered Spout source, NDI source, and NDI send names are saved in
  `synapse.storage` and restored (and re-applied to the live modules) on boot.

## Exact API surface used

| Call | Purpose |
|---|---|
| `SynapseSDK.connect()` | wait for the bridge, ping once |
| `synapse.modules.create({ type, label })` | create `SpoutReceiver`, `NDIReceiver`, `NDISender` |
| `synapse.modules.set(moduleId, path, value)` | set source/send names (positional args) |
| `synapse.modules.connect(fromModuleId, fromPort, toModuleId, toPort)` | wire receivers → stack, stack → NDISender (positional args) |
| `synapse.render.createStack({ id, inputs })` | keyed compositor; `stack.output`, `stack.setInput(i, {opacity})` |
| `synapse.output.publish({ id, source, name })` | MediaOut `Bridge` |
| `synapse.output.publishSpout({ id, source, name })` | Spout/Syphon `Bridge` (documented alias of `publishSyphon`) |
| `synapse.surface.attach(target, { textureId, pointer })` | in-app previews |
| `synapse.storage.get/set(key, value)` | persist/restore the typed names |
| `synapse.app.ready()` | called once, after all wiring |

### Catalog rows used (NODE_CATALOG.md, verbatim)

- `SpoutReceiver` — out `RenderTexture Output` (RenderTexture); settable `currentSourceName` (string)
- `NDIReceiver` — out `RenderTexture Output` (RenderTexture); settable `currentNDIName` (string)
- `NDISender` — in `RenderTexture Input` (RenderTexture); settable `currentSendNDIName` (string)
- `AppStackMixer` — in `Texture 1`..`Texture 8` (RenderTexture); out `Out` (RenderTexture)

## v0 limitations

- **No source enumeration.** v0 exposes no API to list available Spout/NDI senders on the machine.
  You must **type the exact source name** the sender advertises. The input placeholders say so.
- **No JS read-back of external values.** `modules.get(moduleId)` returns module *metadata* (ports,
  type, label) — not whether a receiver is currently locked onto a live source. This app therefore
  reflects the name it **set**, not what the host resolved. If a source name is wrong or the sender
  is offline, the receiver simply produces nothing; there is no error to surface from the set call.
- **NDI/Spout availability is machine-dependent.** Spout is Windows-only, Syphon is macOS-only;
  `output.publishSpout` reports `protocol: 'Unsupported'` on other platforms (surfaced in the UI).
  NDI requires the NDI runtime installed on the machine.
- **`modules.create` is not get-or-create.** Unlike `render.createStack`/`output.publish` (keyed),
  each `modules.create` call makes a new module. This app creates the three modules exactly once per
  boot and relies on `app.ready()` reconciliation to clean up unclaimed modules on reload.

## Deviations from the docs

- **`modules.connect` / `modules.set` argument shape.** `NODE_CATALOG.md`'s "How to use" section
  shows an *object* form (`connect({ fromModuleId, fromPort, toModuleId, toPort })`). The
  authoritative type file `synapse.d.ts` and the `SYNAPSE_API.md` method table both show
  **positional** args: `connect(fromModuleId, fromPort, toModuleId, toPort)` and
  `set(moduleId, path, value)`. This app uses the **positional** form (the .d.ts is canonical).
- **Belt-and-suspenders stack wiring.** The stack's slots are fed *both* by passing the receiver
  outputs as `createStack({ inputs: [...] })` (a stack `source` accepts any textureId) *and* by an
  explicit `modules.connect` of each receiver's output port into the stack's `Texture n` input port.
  Re-wiring the same edge is idempotent, so this is safe; it satisfies the brief's explicit-connect
  requirement while remaining robust if a receiver textureId weren't resolvable as a stack input on
  some host.

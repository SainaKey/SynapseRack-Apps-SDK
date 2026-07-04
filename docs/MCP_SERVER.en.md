# SynapseRack MCP Server (dev mode)

*日本語版: [MCP_SERVER.md](MCP_SERVER.md)*

SynapseRack ships with an **MCP server that lets an AI assistant drive a live SynapseRack directly**. Connect an MCP-capable assistant (Claude Code etc.) and, instead of writing app code blind and eyeballing the result, it can inspect running apps, call any bridge API, read app consoles, and trigger hot reloads — **against the live rack**.

> **Status: prototype (dev mode only).** Not intended to be enabled in a live show environment.

## What it can do

Four app-facing tools (`invoke` reaches **every `window.synapse` bridge method**, so effectively anything an app can do can be done from outside), plus six `graph_*` tools that operate directly on **the user's visible node graph**.

| Tool | Arguments | What it does |
| --- | --- | --- |
| `list_apps` | *(none)* | Lists every running app (per slot): `appId` / `instanceId` / `slot` / display name / lifecycle state / `isReady` / project folder / window id / owned-resource counts |
| `invoke` | `{ appId, method, params? }` | Calls **any bridge method** on a running app's host API. `method` is the dotted name exactly as in JS (e.g. `app.ping`, `render.createText`, `bindings.midi`). The catalog is [`SYNAPSE_API.md`](SYNAPSE_API.md) |
| `read_console` | `{ appId, tail?=50, severity? }` | Reads the tail of the app's console buffer (the same one the AppHub Console shows). Filter with `severity: "error"` etc. |
| `reload_app` | `{ appId }` | Hot-reloads the app (re-reads HTML/JS in place, keeping keyed resources and user wiring), waits for settle (`app.ready` or timeout), returns the new state |

**Graph tools (`graph_*`)** — these target **the user's ACTIVE graph as seen in the node editor**, not an app's hidden scope. They use the same primitives as GUI edits, so nodes an AI builds are undoable by the user like their own:

| Tool | Arguments | What it does |
| --- | --- | --- |
| `graph_state` | *(none)* | Snapshot of every node (module id, type, display name, position, input/output ports) and every connection. **Always call before mutating** so you reference real ids |
| `graph_node_types` | *(none)* | Every creatable node type (from the same NodeLibrary the GUI node browser shows). Details in [`NODE_CATALOG.md`](NODE_CATALOG.md) |
| `graph_create_node` | `{ type, x?, y? }` | Create a node (`type` = name / id / C# type name, case-insensitive) |
| `graph_delete_node` | `{ nodeId }` | Delete a node and every connection touching it. **Destructive — ask the user before deleting nodes you did not create** |
| `graph_connect` | `{ fromNode, fromPort, toNode, toPort }` | Connect an output port to an input port (same type validation as GUI drag-connect) |
| `graph_disconnect` | same | Remove a connection |

Examples of what `invoke` covers (an excerpt — it is the whole bridge):

- **Graph building**: `modules.create / set / connect`, `render.createPlayer / createStack / createText / createLayer`, `output.publish`
- **Performance control**: `layers.list / setOpacity`, `controls.setValue`, `bindings.midi / lfo / follow / list / remove`
- **Inspection & debugging**: `app.ping`, `storage.get / set`, checking the handles of freshly created resources

Errors come back structured (`{ code, message, hint }`). Mistype a method name and `hint` contains "Did you mean: …?" — paste it straight back to the AI and it self-corrects.

## What it cannot do (the honest list)

- **Start / stop / install apps** — it only reaches apps that are *already running*. Start them from the Apps menu / AppHub
- **v0 read-back limits still apply** — anything not on the bridge is not reachable via MCP either
- **Event subscriptions** — request/response only (no SSE; `GET` returns 405). Events like `control.onChange` live in the app's own JS
- **Driving the Unity editor itself** — it cannot enter Play Mode or run menus
- **Screen capture** — visually confirming the video output is still a human job

## Turning it on

**Off by default; enabling it is an explicit per-session choice** (the port number is remembered; the *enabled* state never is).

- **Editor**: menu `SynapseRack > Synapse Apps > MCP Server > Start / Stop / Status`
- **Editor and player builds**: in the AppHub toolbar, tick **MCP Server (dev)** (the port field is there too; default `8765`)

Once running, the Console / status label shows the endpoint (`http://127.0.0.1:8765/`).

## Connecting from an AI assistant

For Claude Code:

```
claude mcp add --transport http synapserack http://127.0.0.1:8765/
```

The tools then appear under the `synapserack` server in your sessions. Any client that speaks the MCP Streamable HTTP transport (request/response subset) can connect.

## Typical workflows

**1. The app-dev loop (the intended use)**

1. The AI edits `main.js`
2. `reload_app` → check the settled `state` / `isReady`
3. `read_console { severity: "error" }` to catch failures
4. `invoke` to poke the resulting graph (e.g. `bindings.list` to confirm a binding landed)

The "write → save → look" loop becomes "write → reload → verify by machine".

**2. Debugging a live rack**

Real example: while investigating "MIDI isn't working", the AI used `invoke` to plant `render.createText` → `bindings.midi` into a running app and checked `read_console` for warnings — isolating "registration up to the learn target is healthy" in under a minute, before anyone touched hardware.

**3. Driving demos / smoke tests**

Collect state with `list_apps`, fire a sequence of `invoke` calls, and compare against expectations — a lightweight acceptance check.

## Multi-instance addressing

When a `multiInstance` app has several slots running, address them by the **`instanceId`** that `list_apps` returns (`appId#slot`; slot 1 stays plain `appId`). A bare `appId` works only while a single slot is running; with several it errors with the candidate list.

## Security — read this

- **Loopback only**: binds `127.0.0.1` exclusively, never a routable interface
- **No authentication**: any local process that can reach the port can drive your rack. **Do not port-forward it, do not expose it beyond loopback, turn it off when done**
- **Off by default**: enabling is an explicit per-session choice

## Known behavior / troubleshooting

- **An editor domain reload (script recompile) stops the server, and it does not come back by itself** (by design — being on is always an explicit choice). Start it / tick the toggle again
- If a request is not serviced by the Unity main thread within 30 seconds, it returns a timeout error (editor paused, reloading, etc.)
- `GET` returns 405; JSON-RPC notifications (no id) return 202 with no body

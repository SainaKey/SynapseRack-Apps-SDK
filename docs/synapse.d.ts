// synapse.d.ts — generated for apiVersion 0.
//
// TypeScript definitions for the SynapseRack Apps host bridge (`window.synapse`) and the userland
// SDK (`window.SynapseSDK`, from synapse-sdk.js). This file documents the REAL implemented wire
// surface — every method here has a registered host handler; nothing here is aspirational. See
// SYNAPSE_API.md for prose docs, examples, and the "core concepts" you need to use this correctly
// (textureId, keyed get-or-create, app.ready).
//
// apiVersion is echoed by app.ping() as hostApiVersion; your project's synapse-app.json pins the
// apiVersion it was written against. A mismatch only logs a warning in v0 — it does not block.

// ---------------------------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------------------------

/** A texture reference. Every SR-backed visual (layer, media player, mixer, web window output,
 * MediaOut/Spout/Syphon input) is identified the same way: an opaque, app-qualified string. Pass it
 * anywhere a `source` or `textureId` parameter is expected. */
type SynapseTextureId = string;

/** The structured error every rejected bridge call carries as `err.synapse` (in addition to
 * `err.message`, which is a human-readable one-liner built from the same fields). Paste this whole
 * object back to an AI assistant when debugging — it is designed for that. */
interface SynapseErrorInfo {
  /** Machine-readable failure category. */
  code: 'unknown_method' | 'invalid_params' | 'not_found' | 'internal';
  /** Human-readable summary of what went wrong. */
  message: string;
  /** The bridge method that was invoked, e.g. "layers.setOpacity". */
  method: string | null;
  /** Optional likely-fix hint. May be null. */
  hint: string | null;
}

/** Every rejected `window.synapse.*` call rejects with a standard `Error` whose `.message` is a
 * formatted one-liner and whose `.synapse` property is the structured `SynapseErrorInfo`. */
interface SynapseError extends Error {
  synapse: SynapseErrorInfo;
}

interface Vector3Json {
  x: number;
  y: number;
  z: number;
}

interface SynapseLayer {
  id: string;
  name: string;
  /** Empty string / defaults when the layer does not exist (e.g. no selection). */
  type?: string;
  exists: boolean;
  opacity?: number;
  rotation?: Vector3Json;
  position?: Vector3Json;
  scale?: { x: number; y: number };
  texture?: { width: number; height: number };
}

interface SynapsePort {
  id: string;
  name: string;
  direction: 'Input' | 'Output' | string;
  type: string;
}

interface SynapseModule {
  id: string;
  moduleId: string;
  nodeId: string;
  nodeType: string;
  typeName: string;
  title: string;
  label: string;
  inputs: SynapsePort[];
  outputs: SynapsePort[];
}

interface SynapseAsset {
  id: string;
  name: string;
  type: string;
  path: string;
}

// ---------------------------------------------------------------------------------------------
// synapse.app
// ---------------------------------------------------------------------------------------------

interface SynapsePingResult {
  message: 'pong';
  unityVersion: string;
  platform: string;
  /** The bridge contract version this build of SynapseRack implements. */
  hostApiVersion: number;
  /** The apiVersion this app's manifest declares (defaults to hostApiVersion if unset). */
  manifestApiVersion: number;
  /** The app's stable id (manifest id). Shared across all slots of a multi-instance app. */
  appId: string;
  /**
   * This instance's identity key. For a single-instance app (the default) it EQUALS appId; for a
   * multi-instance app (manifest `multiInstance: true`) the first slot is still appId and extra slots
   * are `appId#slot`. Published outputs, MIDI scoping, and the app's hidden graph are all qualified by
   * this, so two slots never collide.
   */
  instanceId: string;
  /**
   * This instance's 1-based slot number. Always 1 for a single-instance app; for a multi-instance app
   * it is the slot this copy launched into (smallest free positive integer at launch). Handy as a
   * natural default — e.g. slot N → target the Nth layer.
   */
  slot: number;
}

interface SynapseAppApi {
  /** Round-trips to the host; useful as a liveness check and to read version info. */
  ping(): Promise<SynapsePingResult>;
  /**
   * Marks this app instance's setup as complete. Idempotent — safe to call more than once.
   * Call this once, after your boot() has created every resource it needs for this run.
   *
   * Why it matters: on a reload, keyed resources from the previous run are only reclaimed AFTER
   * either app.ready() fires or a host-side timeout elapses. Until then, unclaimed-but-not-yet-swept
   * resources are kept around so a slow boot doesn't lose them. Always call this at the end of boot().
   *
   * M9: on a restored start (the project was reopened with this app running), the host emits the
   * app.restore event carrying saved state right after ready() resolves — see onRestore.
   */
  ready(): Promise<{ ready: true }>;
  /**
   * M9: pushes the app's latest state to the host. It is saved WITH the project (the moment the
   * project is saved — NOT on every call, so this is cheap to call often), and delivered back via
   * onRestore when the project is reopened and this app auto-restarts. Only the latest value is kept.
   * `state` may be any JSON-serializable value; pass null/undefined to clear.
   */
  setState(state: unknown): Promise<{ ok: true }>;
  /**
   * M9: registers a handler for state restored after a project round-trip. Fires once per run, AFTER
   * app.ready(), only when the app was reopened with saved state. If you register the handler AFTER
   * the event already fired, it is invoked immediately with the cached state — so ordering never
   * causes you to miss it. Returns an unsubscribe function.
   */
  onRestore(handler: (state: unknown) => void): () => void;
}

// ---------------------------------------------------------------------------------------------
// synapse.layers
// ---------------------------------------------------------------------------------------------

interface SynapseCreateTextureSourceOptions {
  /** Idempotency key. Omit to get a fresh id derived from the layer's guid (still stable per layer
   * across reloads); pass your own to control the key explicitly. */
  id?: string;
  name?: string;
}

interface SynapseLayerTextureSourceResult {
  id: string;
  textureId: SynapseTextureId;
  source: SynapseTextureId;
  type: 'layer';
  layer: SynapseLayer;
  moduleId: string;
  nodeId: string;
  nodeType: 'AppTextureSource';
}

interface SynapseLayersApi {
  list(): Promise<SynapseLayer[]>;
  selected(): Promise<SynapseLayer>;
  setOpacity(layerId: string, value: number): Promise<SynapseLayer>;
  setRotation(layerId: string, rotation: Partial<Vector3Json>): Promise<SynapseLayer>;
  setRotationZ(layerId: string, z: number): Promise<SynapseLayer>;
  /** Renders a previously-imported asset (see synapse.assets.importPath) into a layer. */
  play(layerId: string, assetId: string): Promise<SynapseLayer>;
  /**
   * Get-or-create: wraps a Layer's live output as a textureId your app can pass to mixers/outputs.
   * `layerId` may be a real layer id or the literal "selected" for the currently selected layer.
   */
  createTextureSource(
    layerId: string | 'selected',
    options?: SynapseCreateTextureSourceOptions
  ): Promise<SynapseLayerTextureSourceResult>;
}

// ---------------------------------------------------------------------------------------------
// synapse.assets
// ---------------------------------------------------------------------------------------------

interface SynapseAssetsApi {
  /** Imports a local file path (image/.hap/video) as an asset usable by layers.play /
   * render.player.load. Does not copy the file; keeps a reference to `path`. */
  importPath(path: string): Promise<SynapseAsset>;
  /** Downloads a URL into the app's Downloads cache folder, then imports it the same way. */
  download(url: string): Promise<SynapseAsset>;
  /** Opens the NATIVE OS file dialog and resolves with the chosen absolute path (a web
   * <input type="file"> cannot expose paths to JS). `picked` is false when the user cancelled.
   * Only one picker can be open at a time. Feed the path to importPath. */
  pickFile(options?: { title?: string; extensions?: string[] }): Promise<{ picked: boolean; path: string }>;
}

// ---------------------------------------------------------------------------------------------
// synapse.render
// ---------------------------------------------------------------------------------------------

/** @deprecated Sessions were never engine objects (the options below do nothing); createPlayer /
 * createMixer work directly with an optional sessionId defaulting to a shared namespace. Kept only
 * so v0 apps don't break. */
interface SynapseCreateSessionOptions {
  id?: string;
  /** @deprecated Ignored. */
  output?: { width?: number; height?: number };
  /** @deprecated Ignored. */
  exposeOutput?: boolean;
}

/** @deprecated See SynapseCreateSessionOptions — prefer synapse.render.createPlayer/createMixer. */
interface SynapseRenderSession {
  id: string;
  width: number;
  height: number;
  exposeOutput: boolean;
  /** Convenience method bound by the bootstrap script; calls render.createPlayer with this
   * session's id filled in. */
  createPlayer(options?: SynapseCreatePlayerOptions): Promise<SynapseRenderPlayer>;
  /** Convenience method bound by the bootstrap script; calls render.createMixer with this
   * session's id filled in. */
  createMixer(options?: SynapseCreateMixerOptions): Promise<SynapseRenderMixer>;
  /** Convenience method bound by the bootstrap script; calls render.createStack with this
   * session's id filled in. */
  createStack(options?: SynapseCreateStackOptions): Promise<SynapseRenderStack>;
  /** Convenience method bound by the bootstrap script; calls render.createText with this
   * session's id filled in. */
  createText(options?: SynapseCreateTextOptions): Promise<SynapseRenderText>;
  /** Convenience method bound by the bootstrap script; calls render.createChain with this
   * session's id filled in. */
  createChain(options: SynapseCreateChainOptions): Promise<SynapseRenderChain>;
}

interface SynapseCreatePlayerOptions {
  /** Idempotency key ("{sessionId}:player:{id}", sessionId defaults to "session"). Omit for a
   * non-idempotent (GUID-keyed, reload-reclaimed) player. */
  id?: string;
  /** Optional key namespace; defaults to the shared "session". */
  sessionId?: string;
}

/** Snapshot returned by every playback control call and by player.status(). */
interface SynapseRenderPlayerStatus {
  playerId: string;
  playing: boolean;
  /** Normalized playback position, 0..1. */
  position: number;
  /** Duration in seconds (0 when unknown / not playing). */
  duration: number;
  /** Playback speed multiplier (1 = normal). */
  rate: number;
  /** Simple-loop state (VideoPlayer.isLooping / HapPlayer.loop). */
  loop: boolean;
  /** Audio mute state. Players are MUTED by default; only the UnityVideo backend has audio. */
  muted: boolean;
  /** File path of the currently playing content (empty when nothing is loaded). */
  path: string;
  /** Active backend: 'video' | 'hap' | 'vlc' | 'image' | 'shader' | 'ndi' | 'spout' | 'node' | 'none'. */
  type: string;
}

/** Event payload for player.onEnd. `kind` is 'loop' (looped back to start) or 'end' (stopped at the
 * end without looping). */
interface SynapseRenderPlayerEnd {
  playerId: string;
  kind: 'loop' | 'end';
}

interface SynapseRenderPlayer {
  id: string;
  sessionId: string;
  assetId: string;
  moduleId: string;
  nodeId: string;
  nodeType: 'AppMediaPlayer';
  /** This player's output textureId. */
  output: SynapseTextureId;
  /** Convenience method bound by the bootstrap script; calls render.player.load. */
  load(assetId: string): Promise<SynapseRenderPlayer>;
  /** Resume playback (isPlayback = true on the active backend). */
  play(): Promise<SynapseRenderPlayerStatus>;
  /** Pause playback in place. */
  pause(): Promise<SynapseRenderPlayerStatus>;
  /** Seek to a normalized position 0..1 (clamped host-side; ContentPlayer.SeekTo). */
  seek(position: number): Promise<SynapseRenderPlayerStatus>;
  /** Set the playback speed multiplier (per-controller videoSpeed). */
  setRate(rate: number): Promise<SynapseRenderPlayerStatus>;
  /** Toggle SIMPLE looping (VideoPlayer.isLooping / HapPlayer.loop). VLC has no native loop toggle
   * here (no-op). The product's beat-synced crossfade looping is not exposed by the SDK. */
  setLoop(loop: boolean): Promise<SynapseRenderPlayerStatus>;
  /** Current playback snapshot. */
  status(): Promise<SynapseRenderPlayerStatus>;
  /** Register a handler for the loop-point / end event. Returns an unsubscribe function. Dispatched
   * client-side keyed by this player's id. */
  onEnd(handler: (event: SynapseRenderPlayerEnd) => void): () => void;
}

interface SynapseCreateMixerOptions {
  /** Idempotency key, scoped to the session ("{sessionId}:mixer:{id}"). Omit for a non-idempotent
   * (GUID-keyed, reload-reclaimed) mixer. */
  id?: string;
  /** Only "crossfade" is implemented in v0. */
  type?: 'crossfade';
  /** Up to 2 textureIds (or texture-bearing handles from the SDK); extra entries are ignored. */
  inputs?: SynapseTextureId[];
  /** 0..1, clamped host-side. */
  value?: number;
  /** Optional key namespace; defaults to the shared "session". */
  sessionId?: string;
}

interface SynapseRenderMixer {
  id: string;
  sessionId: string;
  type: string;
  value: number;
  moduleId: string;
  nodeId: string;
  nodeType: 'CrossFade';
  /** This mixer's output textureId. */
  output: SynapseTextureId;
  inputs: SynapseTextureId[];
  /** Convenience method bound by the bootstrap script; calls render.mixer.setValue. */
  setValue(value: number): Promise<SynapseRenderMixer>;
}

interface SynapseCreateLayerOptions {
  /** Idempotency key ("layer:{id}"). Session-independent. Omit for a non-idempotent (GUID-keyed,
   * reload-reclaimed) offscreen layer. */
  id?: string;
  /** Output resolution, fixed at creation (a keyed re-claim keeps the original size). Defaults to the
   * global project resolution. */
  width?: number;
  height?: number;
}

/** Snapshot returned by layer.setX / layer.status(). */
interface SynapseRenderLayerStatus {
  layerId: string;
  moduleId: string;
  opacity: number;
  rotationZ: number;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  width: number;
  height: number;
  output: SynapseTextureId;
}

/**
 * An app-owned OFFSCREEN layer: a real Layer running headless (its own camera/canvas/RT/ContentPlayer),
 * but never registered in the layer tree and never composited on screen — it does not appear in
 * layers.list. Texture-only and blend-free (mixing/blending is the mixer's job). `output` feeds mixer
 * inputs / FxChain / output.publish / surface.attach.
 */
interface SynapseRenderLayer {
  id: string;
  moduleId: string;
  nodeId: string;
  nodeType: 'AppOffscreenLayer';
  /** This layer's output textureId. */
  output: SynapseTextureId;
  width: number;
  height: number;
  /** Play an asset through the same ContentPlayer switch the visible Layers use (HAP/VLC/video/image/
   * shader/NDI, no format special-casing). */
  play(assetId: string): Promise<SynapseRenderLayer>;
  /** 0..1, clamped host-side. Writes the module's `opacity` member. */
  setOpacity(value: number): Promise<SynapseRenderLayerStatus>;
  /** Degrees. Writes `rotationZ` (rotation about Z). */
  setRotationZ(value: number): Promise<SynapseRenderLayerStatus>;
  /** Pixels; partial (pass either axis). Writes `positionX` / `positionY`. */
  setPosition(position: { x?: number; y?: number }): Promise<SynapseRenderLayerStatus>;
  /** Multipliers; partial (pass either axis). Writes `scaleX` / `scaleY`. */
  setScale(scale: { x?: number; y?: number }): Promise<SynapseRenderLayerStatus>;
  /** Current transform/opacity snapshot. */
  status(): Promise<SynapseRenderLayerStatus>;
}

/** Blend mode for a stack-mixer slot. Raw integer codes 0..3 are also accepted where a blend is set. */
type SynapseBlendMode = 'normal' | 'add' | 'multiply' | 'screen';

/** One composited slot of a stack mixer. */
interface SynapseStackInput {
  /** Source textureId (a player/layer/mixer output, or any published source). */
  source: SynapseTextureId;
  /** 0..1, clamped host-side. Default 1. */
  opacity?: number;
  /** Blend mode name (default 'normal') or raw code 0..3. */
  blend?: SynapseBlendMode | number;
}

interface SynapseCreateStackOptions {
  /** Idempotency key, scoped to the session ("{sessionId}:stack:{id}"). Omit for a non-idempotent
   * (GUID-keyed, reload-reclaimed) stack. */
  id?: string;
  /** Up to 8 slots, composited BOTTOM-UP (inputs[0] is the bottom). Extra entries are ignored. A bare
   * textureId string is shorthand for { source, opacity: 1, blend: 'normal' }. */
  inputs?: Array<SynapseStackInput | SynapseTextureId>;
  /** Optional key namespace; defaults to the shared "session". */
  sessionId?: string;
}

/**
 * An app-owned MixerN: composites up to 8 texture sources bottom-up with per-slot opacity + blend mode.
 * Unlike SynapseRenderMixer (a fixed 2-input crossfade), this is the general N-source compositor.
 * `output` feeds output.publish / surface.attach / FxChain / another mixer input.
 *
 * Bindable member paths on `.moduleId`: opacity1..opacity8 (float-writable) and blend1..blend8 (int;
 * set via modules.set, not a continuous binding target). Slot n → opacity{n+1}/blend{n+1}.
 */
interface SynapseRenderStack {
  id: string;
  sessionId: string;
  type: 'stack';
  moduleId: string;
  nodeId: string;
  nodeType: 'AppStackMixer';
  /** This stack's output textureId. */
  output: SynapseTextureId;
  /** Current per-slot state (source/opacity/blend), bottom-up. `blend` is echoed as its name. */
  inputs: Array<{ source: SynapseTextureId; opacity: number; blend: SynapseBlendMode }>;
  /** Partial per-slot update. `index` is 0-based (0..7, 0 = bottom). A changed `source` is re-wired
   * (old edge removed first). Resolves to the full stack. */
  setInput(index: number, options: { source?: SynapseTextureId; opacity?: number; blend?: SynapseBlendMode | number }): Promise<SynapseRenderStack>;
}

/** Text alignment for render.createText / text.set. */
type SynapseTextAlign = 'left' | 'center' | 'right';

/** An RGBA color, each channel 0..1. Any subset is accepted for a partial text.set update. */
interface SynapseTextColor {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
}

interface SynapseCreateTextOptions {
  /** Idempotency key, scoped to the session ("{sessionId}:text:{id}"). Omit for a non-idempotent
   * (GUID-keyed, reload-reclaimed) text. */
  id?: string;
  /** Optional key namespace; defaults to the shared "session". */
  sessionId?: string;
  /** The string to render. */
  text?: string;
  /** Font size (TMP points). Default 96. */
  size?: number;
  /** Text color, each channel 0..1 (clamped). Default opaque white. */
  color?: SynapseTextColor;
  /** Alignment name (default 'center') or raw code 0..2 (0 left / 1 center / 2 right). */
  align?: SynapseTextAlign | number;
  /** Output width in pixels; fixed at creation. Default global project width. */
  width?: number;
  /** Output height in pixels; fixed at creation. Default global project height. */
  height?: number;
}

/**
 * An app-owned TextRender: renders a text string to a TRANSPARENT output RenderTexture. The render is
 * dirty-flag driven (re-rendered only when a property changes, not per frame). `output` feeds
 * output.publish / surface.attach / FxChain / a mixer or stack input.
 *
 * Bindable member paths on `.moduleId`: fontSize, colorR, colorG, colorB, colorA (float-writable). `text`
 * (string) and `alignment` (int) are set via text.set / modules.set, not continuous binding targets.
 */
interface SynapseRenderText {
  id: string;
  sessionId: string;
  type: 'text';
  moduleId: string;
  nodeId: string;
  nodeType: 'AppTextRender';
  /** This text's output textureId. */
  output: SynapseTextureId;
  /** Current rendered string. */
  text: string;
  /** Current font size (TMP points). */
  size: number;
  /** Current color, each channel 0..1. */
  color: { r: number; g: number; b: number; a: number };
  /** Current alignment, echoed as its name. */
  align: SynapseTextAlign;
  /** Fixed output width. */
  width: number;
  /** Fixed output height. */
  height: number;
  /** Partial update: any of { text?, size?, color?, align? }. `color` is a partial {r,g,b,a}. Re-renders
   * once and resolves to the full text. */
  set(options: { text?: string; size?: number; color?: SynapseTextColor; align?: SynapseTextAlign | number }): Promise<SynapseRenderText>;
  /** Sugar for set({ text }). */
  setText(text: string): Promise<SynapseRenderText>;
}

/** One effect stage of a createChain call: an FxShader effect id plus its optional shader params.
 * `fx` is an FxShader catalog id (from modules.types() / NODE_CATALOG.md, e.g. 'fx.blur'); `params`
 * keys are shader property names (e.g. '_Amount'), values a float or an RGBA color {r,g,b,a}. */
interface SynapseChainEffectSpec {
  fx: string;
  params?: Record<string, number | SynapseTextColor>;
}

interface SynapseCreateChainOptions {
  /** Idempotency key, scoped to the session ("{sessionId}:chain:{id}"). Omit for a non-idempotent
   * (GUID-keyed, reload-reclaimed) chain. */
  id?: string;
  /** Optional key namespace; defaults to the shared "session". */
  sessionId?: string;
  /** The source textureId the chain applies its effects to (a player/layer/stack/text output, a
   * layers.createTextureSource, or another chain's output). */
  source: SynapseTextureId;
  /** Ordered effect stages: source → effects[0] → effects[1] → … → output. A bare fx-id string is
   * shorthand for { fx }. Must be non-empty. */
  effects: Array<SynapseChainEffectSpec | string>;
}

/**
 * An app-owned FxChain: applies a SERIES of the product's EXISTING FxShader effect nodes to a source
 * texture, source → fx1 → fx2 → … → output. NOT a new renderer — it hosts real FxShader nodes and blits
 * the source through each effect's material into one output RenderTexture. `output` feeds output.publish /
 * surface.attach / a mixer or stack input / another chain's source.
 *
 * `id` is get-or-create. Re-claim semantics: SAME effects list (same fx ids, order, length) → the effect
 * modules are reused in place and their params re-applied; CHANGED effects list → the whole chain (host +
 * effects) is torn down and rebuilt (structure is not update-in-place). A changed `source` is rewired.
 * Each effect's `moduleId` is a bindings target for that effect's shader params (same names as `set`).
 */
interface SynapseRenderChain {
  id: string;
  sessionId: string;
  type: 'chain';
  moduleId: string;
  nodeId: string;
  nodeType: 'AppFxChain';
  /** This chain's output textureId. */
  output: SynapseTextureId;
  /** The current source textureId wired into the chain. */
  source: SynapseTextureId;
  /** The ordered effects, each with its live module id (for bindings against its shader params). */
  effects: Array<{ fx: string; moduleId: string; nodeId: string }>;
  /** Update ONE effect's shader params (0-based `index`). `params` keys are shader property names, values
   * a float or {r,g,b,a}. Structure is immutable here — re-call createChain to change which effects run.
   * Resolves to the full chain. */
  set(index: number, params: Record<string, number | SynapseTextColor>): Promise<SynapseRenderChain>;
}

interface SynapseRenderApi {
  /** @deprecated Compat shim — sessions were never engine objects. Call createPlayer/createMixer
   * directly (sessionId optional, defaults to a shared namespace). Kept so v0 apps don't break;
   * now get-or-create on id, dead options ignored. */
  createSession(options?: SynapseCreateSessionOptions): Promise<SynapseRenderSession>;
  /**
   * Creates an app-owned OFFSCREEN layer (headless Layer, texture producer only; never on screen).
   * `id` is get-or-create (same id → same module GUID + output textureId across reloads). Bindable
   * member paths on `.moduleId`: opacity, rotationZ, positionX, positionY, scaleX, scaleY.
   */
  createLayer(options?: SynapseCreateLayerOptions): Promise<SynapseRenderLayer>;
  /**
   * Creates an app-owned MixerN (AppStackMixer): composites up to 8 texture sources bottom-up with
   * per-slot opacity + blend mode (normal/add/multiply/screen). `id` is get-or-create. Bindable member
   * paths on `.moduleId`: opacity1..opacity8, blend1..blend8.
   */
  createStack(options?: SynapseCreateStackOptions): Promise<SynapseRenderStack>;
  /**
   * Creates an app-owned TextRender (AppTextRender): renders a text string to a transparent output RT,
   * re-rendered only when a property changes. `id` is get-or-create. Bindable member paths on
   * `.moduleId`: fontSize, colorR, colorG, colorB, colorA.
   */
  createText(options?: SynapseCreateTextOptions): Promise<SynapseRenderText>;
  /**
   * Creates an app-owned FxChain (AppFxChain): applies a series of the product's EXISTING FxShader effects
   * to a source texture, source → fx1 → fx2 → … → output. `id` is get-or-create; a CHANGED effects list
   * rebuilds the chain, an unchanged one reuses it in place (params re-applied). Effect ids + their param
   * names come from modules.types() / NODE_CATALOG.md. Each effect's shader params are bindable via its
   * `effects[i].moduleId`.
   */
  createChain(options: SynapseCreateChainOptions): Promise<SynapseRenderChain>;
}

// ---------------------------------------------------------------------------------------------
// synapse.modules — low-level generic module access. Prefer layers/render/output/web for the common
// cases; use this to create/wire arbitrary SR node types by id/name.
// ---------------------------------------------------------------------------------------------

interface SynapseCreateModuleOptions {
  /** Node type id or class name, e.g. "CrossFade" or a NodeLibrary id. */
  type: string;
  label?: string;
  position?: { x: number; y: number };
  /** Initial member values to set after creation (by field/property/ReactiveProperty name). */
  values?: Record<string, unknown>;
}

interface SynapseModulesApi {
  /** Creates any SR module by type id/name. The app owns and cleans up whatever it creates here. */
  create(definition: SynapseCreateModuleOptions): Promise<SynapseModule>;
  /** Looks up a module by id. Modules the app did not create (e.g. user graph nodes) are resolved
   * read-only — the app never takes ownership of them via get(). */
  get(moduleId: string): Promise<SynapseModule>;
  /** Sets a field/property value on a module by member name (a single name, no dot traversal).
   * Members wrapping a writable Value (FloatInput, ReactiveProperty) are written through. */
  set(moduleId: string, path: string, value: unknown): Promise<SynapseModule>;
  /** Connects an output port on one module to an input port on another. Port names default to
   * "Out"/"In" if omitted. */
  connect(
    fromModuleId: string,
    fromPort: string | undefined,
    toModuleId: string,
    toPort: string | undefined
  ): Promise<{
    connected: true;
    fromModuleId: string;
    fromPort: string;
    toModuleId: string;
    toPort: string;
  }>;
  /** Lists every module handle this app instance currently owns/has looked up. */
  list(): Promise<SynapseModule[]>;
  /** The full node-type catalog: what modules.create accepts and what modules.set / bindings can
   * drive per type (float `settable` paths are bindable). The same data ships as NODE_CATALOG.md
   * in this folder — read that first instead of inventing node types. */
  types(): Promise<SynapseNodeType[]>;
}

interface SynapseNodeTypePort {
  /** Port id — what modules.connect matches on. */
  id: string;
  name: string;
  /** float | int | bool | string | trigger | Color | Rect | RenderTexture | ... (wrapper class
   * name when only resolvable at runtime). */
  type: string;
}

interface SynapseNodeType {
  /** Registry id — pass as modules.create({ type: id }). */
  id: string;
  title: string;
  category: string;
  description: string;
  inputs: SynapseNodeTypePort[];
  outputs: SynapseNodeTypePort[];
  /** Members ModuleSetterCache can write via modules.set(moduleId, path, value); entries with
   * type 'float' are also valid bindings targets ({ moduleId, path }). */
  settable: { path: string; type: string }[];
}

// ---------------------------------------------------------------------------------------------
// synapse.output
// ---------------------------------------------------------------------------------------------

interface SynapsePublishOptions {
  /** Required. A textureId (see layers/render/web results, or an SDK handle's .textureId). */
  source: SynapseTextureId;
  /** Idempotency key. Omit for a non-idempotent (reload-reclaimed) output. Pass a stable id to keep
   * the SAME MediaOut/Spout node (and any downstream wiring a user made) across reloads. */
  id?: string;
  name?: string;
}

interface SynapsePublishMediaResult {
  id: string;
  source: SynapseTextureId;
  name: string;
  moduleId: string;
  nodeId: string;
  nodeType: 'MediaOut';
  /** The MediaOut node's own output textureId (e.g. for chaining/preview). */
  textureId: SynapseTextureId;
  publishedAt: number;
}

interface SynapsePublishSpoutResult {
  id: string;
  source: SynapseTextureId;
  name: string;
  serverName: string;
  moduleId: string;
  nodeId: string;
  nodeType: 'SpoutSender';
  /** "Spout" on Windows, "Syphon" on macOS, "Unsupported" elsewhere. */
  protocol: 'Spout' | 'Syphon' | 'Unsupported';
}

interface SynapseOutputApi {
  /** Get-or-create (when `id` is passed): publishes a texture to a MediaOut node other SR users can
   * pick up like any other source. */
  publish(options: SynapsePublishOptions): Promise<SynapsePublishMediaResult>;
  /** Get-or-create (when `id` is passed): publishes a texture as a Spout sender (Windows) /
   * Syphon server (macOS). */
  publishSyphon(options: SynapsePublishOptions): Promise<SynapsePublishSpoutResult>;
  /** Alias of publishSyphon — same handler, same result shape, named for the Windows-side term. */
  publishSpout(options: SynapsePublishOptions): Promise<SynapsePublishSpoutResult>;
}

// ---------------------------------------------------------------------------------------------
// synapse.web
// ---------------------------------------------------------------------------------------------

interface SynapseCreateWebWindowOptions {
  /** Idempotency key. Omit for a non-idempotent (reload-reclaimed) window. */
  id?: string;
  title?: string;
  /** Inline HTML for the window. If neither html nor url is given, a blank black page loads. */
  html?: string;
  /** Alternative to html: a URL to load instead. */
  url?: string;
  /** Convenience: when true, also publishes this window's texture to MediaOut in the same call. */
  publish?: boolean;
  /** Name for the MediaOut node when publish is true. Defaults to `title`. */
  outputName?: string;
  /** Output texture width in pixels (pair with height; e.g. 960x540 for a clean 16:9 source).
   * Applied at creation only — a keyed re-claim keeps the original size. Default host-sized. */
  width?: number;
  /** Output texture height in pixels (see width). */
  height?: number;
}

interface SynapseWebWindowResult {
  id: string;
  windowId: string;
  title: string;
  /** This window's rendered-output textureId. */
  textureId: SynapseTextureId;
  moduleId: string;
  nodeId: string;
  nodeType: 'AppTextureSource';
  /** The requested output size (0 when the host default was used). */
  width: number;
  height: number;
  /** Present only when `options.publish` was true. */
  output?: SynapsePublishMediaResult;
}

interface SynapseWebApi {
  /**
   * Creates (or re-claims) a secondary WebView window and exposes its rendered output as a
   * textureId. Re-running with the same `id` and unchanged html/url reuses the window without a
   * reload; changed content reloads just that window in place.
   */
  createWindow(options: SynapseCreateWebWindowOptions): Promise<SynapseWebWindowResult>;
}

// ---------------------------------------------------------------------------------------------
// synapse.surface / synapse.preview — attach SR texture/layer previews to Web DOM rects
// ---------------------------------------------------------------------------------------------

interface SynapseSurfaceAttachOptions {
  /** Reusing the same surfaceId updates the existing attachment instead of creating a new one. */
  surfaceId?: string;
  previewId?: string;
  /** "texture" for an arbitrary textureId preview, "layer-preview" (default) for a live layer. */
  type?: 'texture' | 'layer-preview' | string;
  textureId?: SynapseTextureId;
  layerId?: string;
  /**
   * What pointer events on the overlay do:
   * - "web" (default): forwarded into the webview that renders the surfaced texture (texture
   *   surfaces whose textureId came from web.createWindow) — clicking the overlay clicks the
   *   surfaced page. Letterbox bars around the ScaleToFit-fitted texture swallow the event.
   *   Textures with no owning webview (layer previews, mixer/player outputs) have nothing to
   *   forward to; those overlays stay click-through, like "passthrough".
   * - "surface" (alias "sr"): emitted to synapse.surface.onPointer handlers only.
   * - "both": forwarded AND emitted.
   * - "none": captured and discarded (blocks the elements underneath).
   * - "passthrough": ignored by the overlay; the DOM element underneath receives them.
   */
  pointer?: 'web' | 'surface' | 'sr' | 'both' | 'none' | 'passthrough';
}

interface SynapseSurfacePointerEvent {
  phase: 'down' | 'move' | 'up' | 'wheel';
  surfaceId: string;
  surfaceType: 'texture' | 'layer-preview' | string;
  pointer: string;
  pointerId?: number;
  button?: number;
  pressedButtons?: number;
  /** Position local to the overlay rect, in panel units. */
  position: { x: number; y: number };
  /** Position normalized 0..1 across the overlay rect (top-left origin). */
  normalized: { x: number; y: number };
  panelPosition: { x: number; y: number };
  delta: { x: number; y: number; z?: number };
}

interface SynapseSurfaceHandle {
  surfaceId: string;
  /** Detaches this surface. Bound by the bootstrap script (in addition to synapse.surface.detach). */
  detach(): Promise<unknown>;
  [key: string]: unknown;
}

interface SynapseSurfaceApi {
  /**
   * Attaches a live SR texture/layer preview over a DOM element (CSS selector or Element). Tracks
   * the element's layout automatically (ResizeObserver/MutationObserver/scroll/resize) and re-syncs
   * the host-side overlay; call the returned handle's .detach() (or synapse.surface.detach) when
   * you're done, though app Stop/Reload also cleans it up.
   */
  attach(target: string | Element, options?: SynapseSurfaceAttachOptions): Promise<SynapseSurfaceHandle>;
  /** Forces a layout re-sync for an already-attached target (rarely needed — attach() self-syncs). */
  update(target: string | Element, options?: SynapseSurfaceAttachOptions): Promise<unknown>;
  /** Registers a pointer-event handler for a surfaceId. Only fires for surfaces attached with
   * pointer: "surface"/"sr"/"both". Returns an unsubscribe function. */
  onPointer(surfaceId: string, handler: (event: SynapseSurfacePointerEvent) => void): () => void;
  detach(surfaceId: string): Promise<unknown>;
}

interface SynapsePreviewApi {
  /** Sugar for surface.attach with type "layer-preview". (preview.create — a describe-only remnant
   * that attached nothing — was removed; attach directly.) */
  attach(target: string | Element, options?: SynapseSurfaceAttachOptions): Promise<SynapseSurfaceHandle>;
  detach(previewId: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------------------------
// synapse.controls
// ---------------------------------------------------------------------------------------------

interface SynapseControlDefinition {
  /** Idempotency key (the control's id). Required. */
  id: string;
  label?: string;
  /** Free-form type tag ("float" | "bool" | "string" | ...); not enforced host-side. */
  type?: string;
  value?: unknown;
  min?: number;
  max?: number;
  step?: number;
  /** Makes this control MIDI-learnable. With an associated element (the `anchor` option, or a DOM
   * node carrying data-synapse-control="<id>") a MIDI binding is auto-armed and SR's learn overlay
   * appears on that element — the app's UI is naturally the learn target, like a native SR slider.
   * Without an element this is registry metadata only (arm explicitly via bindings.midi). */
  midi?: boolean;
  /** Element association for `midi: true`: CSS selector or Element in this window. Client-side
   * only — never sent to the host registry. */
  anchor?: string | Element;
  group?: string;
  path?: string;
}

interface SynapseControl {
  id: string;
  label: string;
  type: string;
  value: unknown;
  midi: boolean;
  origin: 'register' | 'web' | 'host' | string;
  updatedAt: number;
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  path?: string;
}

interface SynapseControlHandle extends SynapseControl {
  /** Pushes a new value (origin "web") and updates the local handle fields. Bound by the bootstrap
   * script on the object returned from controls.register(). */
  setValue(value: unknown): Promise<SynapseControl>;
  /** Subscribes to updates from the host (or another client). Returns an unsubscribe function. Bound
   * by the bootstrap script. */
  onChange(handler: (value: unknown, control: SynapseControl) => void): () => void;
}

// ---------------------------------------------------------------------------------------------
// synapse.bindings — host-side parameter bindings (M8). Declare continuous (LFO/audio-follow) or
// event-driven (MIDI) modulation of a target parameter; it runs NATIVELY, JS is never called per
// frame. This is the intended way to do continuous control — do NOT drive values from a
// requestAnimationFrame loop over the bridge.
// ---------------------------------------------------------------------------------------------

/** A binding target: a module member ({moduleId, path} — same semantics as modules.set) or a control
 * ({controlId} — writes route through the control so control.update events fire and the Web UI stays
 * in sync). May be passed inline as `target`, or the group methods accept moduleId/path/controlId at
 * the top level too. */
type SynapseBindingTarget =
  | { moduleId: string; path: string }
  | { controlId: string };

interface SynapseBindMidiOptions {
  /** Idempotency key. Omit to derive a stable default from the target ("midi:{moduleId}.{path}"). */
  id?: string;
  target?: SynapseBindingTarget;
  /** Incoming MIDI value (0..1) is mapped through [min, max] (defaults 0..1). */
  min?: number;
  max?: number;
  /**
   * The page control this binding belongs to (CSS selector or Element, in the SAME window that
   * calls bindings.midi). SR's MIDI-learn overlay then renders on top of that element — tracked
   * through layout changes — instead of as a chip docked at the host window's edge. Recommended
   * whenever the binding corresponds to a visible control.
   */
  anchor?: string | Element;
}

interface SynapseLfoOptions {
  id?: string;
  target?: SynapseBindingTarget;
  /** Musical division in BARS ("1/4" | "1/2" | "1" | "2" | "4"; "1" = one bar = 4 beats), synced to
   * the global BPM (and thus Ableton Link). Ignored if `hz` is given. */
  rate?: '1/4' | '1/2' | '1' | '2' | '4' | string;
  /** Absolute rate in Hz (free-running, ignores tempo). */
  hz?: number;
  shape?: 'sine' | 'triangle' | 'saw' | 'square';
  min?: number;
  max?: number;
  /** Phase offset, 0..1 of a cycle. */
  phase?: number;
}

interface SynapseFollowOptions {
  id?: string;
  target?: SynapseBindingTarget;
  /** Audio band to follow. */
  source?: 'audio.level' | 'audio.bass' | 'audio.mid' | 'audio.high';
  min?: number;
  max?: number;
  /** Exponential smoothing amount, 0 (instant) .. 1 (heavy). */
  smooth?: number;
}

interface SynapseBinding {
  id: string;
  kind: 'midi' | 'lfo' | 'follow';
  target: string;
  [key: string]: unknown;
}

interface SynapseBindingsApi {
  /** Makes a target MIDI-mappable (visible in SR's MIDI learn mode). Keyed get-or-create; a same-id
   * re-claim keeps the learned mapping (it survives a reload). With `anchor`, the learn overlay is
   * rendered in-page on that element during learn mode (click to select). */
  midi(options: SynapseBindMidiOptions): Promise<SynapseBinding>;
  /** Tempo-synced (rate) or free-running ({hz}) LFO. Keyed get-or-create. */
  lfo(options: SynapseLfoOptions): Promise<SynapseBinding>;
  /** Audio-follow (band level → target). Keyed get-or-create. */
  follow(options: SynapseFollowOptions): Promise<SynapseBinding>;
  /** Removes a binding by id. */
  remove(id: string): Promise<{ id: string; removed: boolean }>;
  /** Lists this app's active bindings. */
  list(): Promise<SynapseBinding[]>;
  /**
   * Always-visible MIDI chip for an ANCHORED binding: reads `MIDI` until a signal is learned, then
   * the assignment (e.g. `CC 7 ch1`). In learn mode clicking it selects the binding, same as the
   * overlay. Appended to `host` (selector/Element; defaults to the anchor's parent). Returns the
   * badge element. Throws if the binding id has no anchored element in this window.
   */
  badge(handleOrId: SynapseBinding | string, host?: string | Element): HTMLElement;
}

interface SynapseControlsApi {
  /** Get-or-create is NOT implemented for controls in v0 — re-registering the same id overwrites the
   * previous entry's metadata but keeps the same id, which is the common desired behavior for
   * idempotent boot() re-runs. */
  register(definition: SynapseControlDefinition): Promise<SynapseControlHandle>;
  setValue(controlId: string, value: unknown): Promise<SynapseControl>;
  list(): Promise<SynapseControl[]>;
  /** Registers a raw change handler for a controlId (used internally by the handle's .onChange, and
   * available directly). Returns an unsubscribe function. */
  onChange(controlId: string, handler: (value: unknown, control: SynapseControl) => void): () => void;
}

// ---------------------------------------------------------------------------------------------
// synapse.storage — per-app key-value storage (M9)
// ---------------------------------------------------------------------------------------------

interface SynapseStorageGetResult {
  key: string;
  /** The stored JSON value, or null if the key does not exist (see `exists`). */
  value: unknown;
  exists: boolean;
}

interface SynapseStorageApi {
  /**
   * Per-app key-value storage persisted OUTSIDE any project (presets, caches — independent of the
   * open project). Values survive Start/Stop/Reload and are shared across every project this app is
   * used in. This is different from app.setState: setState saves WITH the project; storage does not.
   * Backed by one JSON file per app under the OS user-data folder; writes are immediate (write-through).
   */
  get(key: string): Promise<SynapseStorageGetResult>;
  /** Stores any JSON-serializable value. Overwrites an existing key. */
  set(key: string, value: unknown): Promise<{ key: string; value: unknown; ok: true }>;
  delete(key: string): Promise<{ key: string; removed: boolean }>;
  /** Lists the stored keys (sorted). */
  list(): Promise<{ keys: string[] }>;
}

// ---------------------------------------------------------------------------------------------
// window.synapse — the full host bridge
// ---------------------------------------------------------------------------------------------

interface SynapseBridge {
  /** Low-level escape hatch: sends `{method, params}` directly and returns the raw result promise.
   * Every group method above is implemented in terms of this. */
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  app: SynapseAppApi;
  layers: SynapseLayersApi;
  assets: SynapseAssetsApi;
  render: SynapseRenderApi;
  modules: SynapseModulesApi;
  output: SynapseOutputApi;
  web: SynapseWebApi;
  surface: SynapseSurfaceApi;
  preview: SynapsePreviewApi;
  controls: SynapseControlsApi;
  bindings: SynapseBindingsApi;
  storage: SynapseStorageApi;
}

// ---------------------------------------------------------------------------------------------
// Bridge window events — the bootstrap re-dispatches every host push as a window CustomEvent, so
// pages can react without registering per-id handlers.
// ---------------------------------------------------------------------------------------------

/** detail of 'synapse:midi-learn' — SR's MIDI-learn mode toggled or the selected target changed. */
interface SynapseMidiLearnDetail {
  active: boolean;
  selectedTargetId: string | null;
}

/** detail of 'synapse:midi-mapped' — a MIDI mapping was assigned to / removed from some learn
 * target. `signal` is the normalized key ("midi:cc:0:7" = CC7 ch1, "midi:note:8:41" = note 41
 * ch9, "key:32", "osc:/fader:0"). Filter by the targetIds of your own bindings. */
interface SynapseMidiMappedDetail {
  targetId: string;
  signal: string;
  removed: boolean;
}

declare global {
  interface Window {
    /** The host bridge, injected by SynapseRack before your app's scripts run. */
    synapse: SynapseBridge;
    /** The userland SDK, attached by synapse-sdk.js if that script is included. */
    SynapseSDK: SynapseSDKNamespace;
  }

  interface WindowEventMap {
    'synapse:midi-learn': CustomEvent<SynapseMidiLearnDetail>;
    'synapse:midi-mapped': CustomEvent<SynapseMidiMappedDetail>;
    /** {type, surfaceId, event} — pointer forwarded from a captured surface overlay. */
    'synapse:surface-pointer': CustomEvent<{ surfaceId: string; event: Record<string, unknown> }>;
    /** {type, playerId, kind} — render.player loop point / final end. */
    'synapse:render-player-end': CustomEvent<{ playerId: string; kind: string }>;
    /** {type, controlId, value, origin, control} — any control value change. */
    'synapse:control-update': CustomEvent<{ controlId: string; value: unknown; origin: string; control: SynapseControl }>;
    /** {type, state} — saved app state delivered after a project round-trip. */
    'synapse:app-restore': CustomEvent<{ state: unknown }>;
  }
}

// ---------------------------------------------------------------------------------------------
// window.SynapseSDK — the userland convenience layer (synapse-sdk.js)
// ---------------------------------------------------------------------------------------------

/** A resource handle carrying enough identity to be passed as a `source` anywhere the SDK or raw
 * bridge expects one (SDK methods accept either a handle or a raw textureId string). */
interface SynapseHandleLike {
  id: string;
  textureId?: string;
}

interface SynapseSdkTextureSourceHandle extends SynapseHandleLike {
  textureId: string;
  raw: SynapseLayerTextureSourceResult;
}

interface SynapseSdkWebWindowHandle extends SynapseHandleLike {
  textureId: string;
  title: string;
  raw: SynapseWebWindowResult;
}

interface SynapseSdkValueHandle<T> {
  set(value: T): Promise<T>;
  get(): T;
  /** Host-side MIDI binding for this value (MIDI-learnable in SR). Runs natively; JS is never called
   * per frame. */
  bindMidi(options?: Omit<SynapseBindMidiOptions, 'target'>): Promise<SynapseBinding>;
  /** Host-side tempo-synced/free-running LFO on this value. */
  lfo(options?: Omit<SynapseLfoOptions, 'target'>): Promise<SynapseBinding>;
  /** Host-side audio-follow on this value. */
  follow(options?: Omit<SynapseFollowOptions, 'target'>): Promise<SynapseBinding>;
  /** Removes a binding by id. */
  unbind(id: string): Promise<{ id: string; removed: boolean }>;
}

interface SynapseSdkMixerHandle extends SynapseHandleLike {
  textureId: string;
  sessionId: string;
  /** The underlying CrossFade module id, so `value` bindings can address {moduleId, path:'mixValue'}. */
  moduleId: string;
  raw: SynapseRenderMixer;
  value: SynapseSdkValueHandle<number>;
}

interface SynapseSdkControlHandle extends SynapseHandleLike {
  raw: SynapseControlHandle;
  value: SynapseSdkValueHandle<unknown>;
  onChange(handler: (value: unknown) => void): () => void;
}

interface SynapseSdkPublishResult extends SynapseHandleLike {
  textureId: string;
  raw: SynapsePublishMediaResult;
}

interface SynapseSdkPublishSpoutResult extends SynapseHandleLike {
  raw: SynapsePublishSpoutResult;
}

interface SynapseApp {
  /** Result of the initial app.ping() call made by SynapseSDK.connect(). */
  pingResult: SynapsePingResult;
  /** Marks setup complete. See SynapseAppApi.ready — same host call. */
  ready(): Promise<void>;
  /** M9: pushes the app's latest state, saved WITH the project. See SynapseAppApi.setState. */
  setState(state: unknown): Promise<void>;
  /** M9: registers a restore handler for saved state after a project round-trip (fires once, after
   * ready; late registration still receives cached state). See SynapseAppApi.onRestore. */
  onRestore(handler: (state: unknown) => void): () => void;
  /** M9: per-app, project-independent key-value storage — a passthrough to synapse.storage. */
  readonly storage: SynapseStorageApi;
  /** Get-or-create wrapper over layers.createTextureSource. */
  textureSource(key: string, options?: { layer?: string; name?: string }): Promise<SynapseSdkTextureSourceHandle>;
  /** Get-or-create wrapper over web.createWindow. width/height fix the output texture size
   * (creation only — see SynapseCreateWebWindowOptions). */
  webWindow(
    key: string,
    options?: { title?: string; html?: string; url?: string; width?: number; height?: number }
  ): Promise<SynapseSdkWebWindowHandle>;
  /** Get-or-create wrapper over render.createSession (shared lazily per app) + render.createMixer. */
  mixer(
    key: string,
    options?: { type?: 'crossfade'; inputs?: Array<string | SynapseHandleLike>; value?: number }
  ): Promise<SynapseSdkMixerHandle>;
  /** Get-or-create wrapper over output.publish. Accepts a handle or raw textureId as `source`. */
  publishMedia(
    key: string,
    options: { source: string | SynapseHandleLike; name?: string }
  ): Promise<SynapseSdkPublishResult>;
  /** Get-or-create wrapper over output.publishSpout. Accepts a handle or raw textureId as `source`. */
  publishSpout(
    key: string,
    options: { source: string | SynapseHandleLike; name?: string }
  ): Promise<SynapseSdkPublishSpoutResult>;
  /** Wrapper over controls.register + controls.onChange with a `.value.set/get` handle shape. */
  control(
    key: string,
    options?: {
      label?: string;
      type?: string;
      min?: number;
      max?: number;
      step?: number;
      value?: unknown;
      midi?: boolean;
    }
  ): Promise<SynapseSdkControlHandle>;
}

interface SynapseSDKNamespace {
  /** Waits for window.synapse and pings the host once. Call this first. */
  connect(): Promise<SynapseApp>;
}

export {};

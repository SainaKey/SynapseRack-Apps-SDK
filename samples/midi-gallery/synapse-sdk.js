/**
 * synapse-sdk.js — userland convenience layer over window.synapse (the host bridge).
 *
 * Plain script, no ES modules: include it with a single <script src="./synapse-sdk.js"> (or inline
 * it, e.g. for a single-file sample) and it attaches `window.SynapseSDK`. See SYNAPSE_API.md for the
 * full method reference of the underlying bridge this wraps, and synapse.d.ts for types.
 *
 * What this layer adds over the raw bridge:
 *  - a single `SynapseSDK.connect()` that waits for window.synapse and pings the host once;
 *  - handle-based creation helpers (`textureSource`, `webWindow`, `mixer`, `publishMedia`,
 *    `publishSpout`, `control`) that return small objects instead of raw JSON, and accept either a
 *    handle or a raw textureId anywhere a "source" is expected;
 *  - `.value.set(v)` / `.value.get()` on mixer handles, mapped to render.mixer.setValue;
 *  - `.value.bindMidi()/.lfo()/.follow()/.unbind()` on mixer and control handles — host-side parameter
 *    bindings (MIDI learn, tempo-synced LFO, audio follow) that run natively while JS idles;
 *  - `.onChange(fn)` on control handles, mapped to the bridge's control-update event.
 *
 * Everything here is a thin wrapper: it creates no state the bridge does not already own. Re-running
 * boot() with the same keys is safe (get-or-create), same as calling window.synapse directly.
 */
(function () {
  'use strict';

  /** Waits until window.synapse exists (the bootstrap script runs before the WebView finishes
   * attaching event listeners in some load orders). @returns {Promise<void>} */
  function waitForBridge() {
    if (window.synapse) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (window.synapse) resolve();
        else setTimeout(check, 30);
      };
      check();
    });
  }

  /** Accepts a handle (anything with a `.textureId`, `.output` or `.id`) or a raw string and returns
   * the string the bridge expects as a `source`/`textureId` param. Raw bridge handles
   * (render.createPlayer/createText/createChain results) carry the texture id in `output` while
   * their `id` is a session resource id — so `output` must win over `id`.
   * @param {*} value @returns {string|undefined} */
  function normalizeSource(value) {
    if (value == null) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value.textureId === 'string') return value.textureId;
    if (typeof value.output === 'string') return value.output;
    if (typeof value.id === 'string') return value.id;
    return undefined;
  }

  /**
   * Adds host-side binding methods to a value handle. `target` is the bridge binding target this value
   * resolves to ({moduleId, path} for a module member, {controlId} for a control). The binding runs
   * natively — JS is never called per frame. All are keyed get-or-create on the (optional) `id`; the
   * host derives a stable default id from the target so re-running setup is idempotent.
   * @param {Object} valueHandle @param {Object} target @returns {Object} the same valueHandle
   */
  function attachBindings(valueHandle, target) {
    /** MIDI-learnable: shows up in SR's MIDI learn mode; maps an incoming CC (0..1) through optional
     * {min,max}. nchor (selector/Element) pins SR's learn overlay onto that page control.
     * @param {{id?: string, min?: number, max?: number, anchor?: (string|Element)}} [options] */
    valueHandle.bindMidi = (options) =>
      window.synapse.bindings.midi(Object.assign({ target }, options || {}));
    /** Tempo-synced (or {hz}) LFO. @param {{id?: string, rate?: string, hz?: number,
     * shape?: 'sine'|'triangle'|'saw'|'square', min?: number, max?: number, phase?: number}} [options] */
    valueHandle.lfo = (options) =>
      window.synapse.bindings.lfo(Object.assign({ target }, options || {}));
    /** Audio follow. @param {{id?: string, source?: 'audio.level'|'audio.bass'|'audio.mid'|'audio.high',
     * min?: number, max?: number, smooth?: number}} [options] */
    valueHandle.follow = (options) =>
      window.synapse.bindings.follow(Object.assign({ target }, options || {}));
    /** Removes a binding by id (the id returned from bindMidi/lfo/follow, or your explicit one).
     * @param {string} id */
    valueHandle.unbind = (id) => window.synapse.bindings.remove(id);
    return valueHandle;
  }

  /**
   * A live handle for a render.mixer (crossfade). `.value.set/get` drive render.mixer.setValue;
   * `.get()` returns the last value set (or the value from the creating/last bridge response) without
   * a round trip.
   * @typedef {Object} MixerHandle
   * @property {string} id
   * @property {string} textureId - alias of `.output`, so a MixerHandle can be passed anywhere a
   *   texture source is expected (see normalizeSource).
   * @property {string} sessionId
   * @property {{set: function(number): Promise<MixerHandle>, get: function(): number}} value
   */

  /**
   * @typedef {Object} WebWindowHandle
   * @property {string} id
   * @property {string} textureId
   * @property {string} title
   */

  /**
   * @typedef {Object} TextureSourceHandle
   * @property {string} id
   * @property {string} textureId
   */

  /**
   * @typedef {Object} ControlHandle
   * @property {string} id
   * @property {{set: function(*): Promise<void>, get: function(): *}} value
   * @property {function(function(*): void): function(): void} onChange - registers a handler for
   *   host/other-client updates (e.g. a future MIDI binding); returns an unsubscribe function.
   */

  /**
   * The connected app handle returned by SynapseSDK.connect(). Every creation method is keyed and
   * idempotent: calling it again with the same key returns/updates the same resource (see
   * SYNAPSE_API.md, "core concepts").
   * @typedef {Object} SynapseApp
   */

  class SynapseApp {
    constructor(pingResult) {
      /** Result of the initial app.ping() call (host version info). @type {Object} */
      this.pingResult = pingResult;
      this._sessionId = null;
      this._sessionPromise = null;
    }

    // ---- lifecycle ----------------------------------------------------------------------------

    /** Marks setup complete. Call once, after your app has created the resources it needs. Required
     * for reload reconciliation: unclaimed keyed resources are only reclaimed after ready() fires (or
     * a timeout). @returns {Promise<void>} */
    async ready() {
      await window.synapse.app.ready();
    }

    // ---- persistence: save-with-project state (M9) ---------------------------------------------

    /** Pushes the app's latest state to the host. It is saved WITH the project (not immediately) and
     * delivered back via onRestore when the project is reopened. Call it whenever your state changes;
     * only the latest value is kept. @param {*} state any JSON-serializable value @returns {Promise<void>} */
    async setState(state) {
      await window.synapse.app.setState(state);
    }

    /** Registers a handler for state restored after a project round-trip. Fires once, after ready();
     * if you register late it still receives the cached state immediately, so you never miss it.
     * @param {function(*): void} handler @returns {function(): void} unsubscribe */
    onRestore(handler) {
      return window.synapse.app.onRestore(handler);
    }

    // ---- per-app storage, project-independent (M9) ---------------------------------------------

    /** Per-app key-value storage persisted OUTSIDE any project (presets, caches). Survives
     * Start/Stop/Reload and is shared across projects. Thin passthrough to synapse.storage.
     * @type {{get: function(string): Promise<Object>, set: function(string, *): Promise<Object>,
     *   delete: function(string): Promise<Object>, list: function(): Promise<{keys: string[]}>}} */
    get storage() {
      return window.synapse.storage;
    }

    // ---- session id -----------------------------------------------------------------------------
    // Sessions are deprecated bookkeeping (a key prefix, not an engine object). The host defaults
    // sessionId to "session" when omitted; keep sending it explicitly for old-host compatibility.

    async _session() {
      return 'session';
    }

    // ---- texture sources ------------------------------------------------------------------------

    /**
     * Wraps an SR Layer's output as a textureId. Get-or-create by `key`.
     * @param {string} key - stable idempotency key.
     * @param {{layer?: string}} [options] - layer id, or omit/"selected" for the selected layer.
     * @returns {Promise<TextureSourceHandle>}
     */
    async textureSource(key, options) {
      const opts = options || {};
      const result = await window.synapse.layers.createTextureSource(opts.layer || 'selected', {
        id: key,
        name: opts.name
      });
      return { id: result.id, textureId: result.textureId, raw: result };
    }

    // ---- web windows ----------------------------------------------------------------------------

    /**
     * Creates (or re-claims) a secondary WebView window and exposes its rendered output as a
     * textureId. Re-running with the same key and unchanged html/url reuses the window without
     * reloading it; changed content reloads it in place.
     * @param {string} key - stable idempotency key.
     * @param {{title?: string, html?: string, url?: string, width?: number, height?: number}} [options]
     * @returns {Promise<WebWindowHandle>}
     */
    async webWindow(key, options) {
      const opts = options || {};
      const result = await window.synapse.web.createWindow({
        id: key,
        title: opts.title,
        html: opts.html,
        url: opts.url,
        width: opts.width,
        height: opts.height
      });
      return { id: result.id, textureId: result.textureId, title: result.title, raw: result };
    }

    // ---- mixers ---------------------------------------------------------------------------------

    /**
     * Creates (or re-claims) a mixer. v0 supports `type: "crossfade"` with up to two inputs. Get-or-
     * create by `key`; re-running with a changed `value` updates it in place.
     * @param {string} key - stable idempotency key.
     * @param {{type?: string, inputs?: Array<string|Object>, value?: number}} [options]
     * @returns {Promise<MixerHandle>}
     */
    async mixer(key, options) {
      const opts = options || {};
      const sessionId = await this._session();
      const inputs = (opts.inputs || []).map(normalizeSource).filter(Boolean);
      const result = await window.synapse.render.createMixer({
        sessionId,
        id: key,
        type: opts.type || 'crossfade',
        inputs,
        value: opts.value
      });

      const self = this;
      let cached = result.value;
      // Bindings address the CrossFade module's mix parameter directly ({moduleId, path:'mixValue'}),
      // so host-side MIDI/LFO/follow drive the mix even while the JS crossfader UI sits idle.
      const bindingTarget = { moduleId: result.moduleId, path: 'mixValue' };
      return {
        id: result.id,
        textureId: result.output,
        sessionId: result.sessionId,
        moduleId: result.moduleId,
        raw: result,
        value: attachBindings({
          /** Sets the mix value (0..1) and pushes it to the host immediately.
           * @param {number} v @returns {Promise<number>} */
          async set(v) {
            const applied = await self._setMixerValue(result.id, v);
            cached = applied.value;
            return cached;
          },
          /** Returns the last value set (or the value from creation), no round trip.
           * @returns {number} */
          get() {
            return cached;
          }
        }, bindingTarget)
      };
    }

    async _setMixerValue(mixerId, value) {
      // render.mixer.setValue is exposed on the mixer handle returned by the raw bridge's
      // render.createSession().createMixer() chain. The SDK tracks mixers by id (not by that handle),
      // so it calls the same underlying method directly via window.synapse.request.
      return window.synapse.request('render.mixer.setValue', { mixerId, value });
    }

    // ---- outputs --------------------------------------------------------------------------------

    /**
     * Publishes a texture source to MediaOut. Get-or-create by `key`: re-running reuses the same
     * MediaOut node (so any wiring a user made from it survives) and only re-wires it when the
     * source changed.
     * @param {string} key - stable idempotency key.
     * @param {{source: string|Object, name?: string}} options
     * @returns {Promise<{id: string, textureId: string}>}
     */
    async publishMedia(key, options) {
      const source = normalizeSource(options && options.source);
      const result = await window.synapse.output.publish({
        id: key,
        source,
        name: options && options.name
      });
      return { id: result.id, textureId: result.textureId, raw: result };
    }

    /**
     * Publishes a texture source to Spout (Windows) or Syphon (macOS). Get-or-create by `key`, same
     * rules as publishMedia.
     * @param {string} key - stable idempotency key.
     * @param {{source: string|Object, name?: string}} options
     * @returns {Promise<{id: string, raw: Object}>}
     */
    async publishSpout(key, options) {
      const source = normalizeSource(options && options.source);
      const result = await window.synapse.output.publishSpout({
        id: key,
        source,
        name: options && options.name
      });
      return { id: result.id, raw: result };
    }

    // ---- controls -------------------------------------------------------------------------------

    /**
     * Registers (or re-registers) a Web control. Controls are how Web UI becomes visible to the host
     * for future MIDI mapping (`midi: true`).
     * @param {string} key - stable idempotency key (the control id).
     * @param {{label?: string, type?: string, min?: number, max?: number, step?: number, value?: *,
     *   midi?: boolean}} [options]
     * @returns {Promise<ControlHandle>}
     */
    async control(key, options) {
      const opts = options || {};
      const result = await window.synapse.controls.register(Object.assign({}, opts, { id: key }));
      let cached = result.value;
      const handlers = new Set();

      const unsubscribeBridge = window.synapse.controls.onChange(key, (value) => {
        cached = value;
        handlers.forEach((handler) => {
          try {
            handler(value);
          } catch (error) {
            console.error(error);
          }
        });
      });
      void unsubscribeBridge; // kept alive for the app's lifetime; the bridge itself is torn down on stop.

      return {
        id: result.id,
        raw: result,
        // A control value can also be host-bound; a MIDI/LFO/follow write routes through the control so
        // your onChange handler fires and the Web UI stays in sync (target is {controlId}).
        value: attachBindings({
          /** Pushes a new value to the host (origin "web") and updates the local cache.
           * @param {*} v @returns {Promise<void>} */
          async set(v) {
            const updated = await window.synapse.controls.setValue(key, v);
            cached = updated.value;
          },
          /** Returns the last known value, no round trip. @returns {*} */
          get() {
            return cached;
          }
        }, { controlId: key }),
        /** Subscribes to value changes coming from the host (or another client). Returns an
         * unsubscribe function. @param {function(*): void} handler @returns {function(): void} */
        onChange(handler) {
          handlers.add(handler);
          return () => handlers.delete(handler);
        }
      };
    }
  }

  const SynapseSDK = {
    /**
     * Waits for the host bridge and pings it once. Call this first; everything else hangs off the
     * returned app handle.
     * @returns {Promise<SynapseApp>}
     */
    async connect() {
      await waitForBridge();
      const pingResult = await window.synapse.app.ping();
      return new SynapseApp(pingResult);
    }
  };

  window.SynapseSDK = SynapseSDK;
})();

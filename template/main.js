// New Project scaffold. See SYNAPSE_API.md for the full API reference and synapse.d.ts for types.
//
// This app:
//  1. connects to the host bridge via the SDK,
//  2. spawns a small offscreen web window that renders a solid color canvas,
//  3. publishes that texture to MediaOut so it shows up as a normal SR source,
//  4. registers a "Hue" control wired to the canvas color,
//  5. calls app.ready() once setup is done.

const log = document.querySelector('#log');
const hue = document.querySelector('#hue');
const hueReadout = document.querySelector('#hueReadout');

function write(value) {
  log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// The HTML that runs inside the offscreen web window. It just paints a solid HSL color full-frame;
// SynapseRack reads its rendered output as a RenderTexture. Changing the hue re-creates this HTML
// string and re-runs app.webWindow() with the same key ("color-canvas"): the host detects the content
// changed and reloads just that window in place (see SYNAPSE_API.md "core concepts: id / keying").
function colorWindowHtml(hueValue) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>html, body, canvas { margin: 0; width: 100%; height: 100%; overflow: hidden; }</style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');

    function paint() {
      canvas.width = Math.max(1, innerWidth);
      canvas.height = Math.max(1, innerHeight);
      ctx.fillStyle = 'hsl(${hueValue} 70% 50%)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    window.addEventListener('resize', paint);
    paint();
  <\/script>
</body>
</html>`;
}

async function boot() {
  const app = await SynapseSDK.connect();
  write('Connected to SynapseRack: ' + JSON.stringify(app.pingResult));

  // A web window whose canvas becomes a textureId, published straight to MediaOut.
  const canvasWindow = await app.webWindow('color-canvas', {
    title: 'Color Canvas',
    html: colorWindowHtml(Number(hue.value))
  });

  await app.publishMedia('color-out', {
    source: canvasWindow,
    name: 'Color Output'
  });

  // Show the same texture inline in this app's own window too.
  await window.synapse.surface.attach('#preview', {
    type: 'texture',
    textureId: canvasWindow.textureId,
    pointer: 'web'
  });

  // A MIDI-mappable control that drives the canvas color live.
  const hueControl = await app.control('hue', {
    label: 'Hue',
    type: 'float',
    min: 0,
    max: 360,
    value: Number(hue.value),
    midi: true
  });

  async function setHue(value) {
    hue.value = String(value);
    hueReadout.textContent = String(Math.round(value));
    // Re-run with the same key ("color-canvas"): get-or-create reuses the same window/module and
    // just reloads its content, so this is safe to call as often as the slider fires.
    await app.webWindow('color-canvas', {
      title: 'Color Canvas',
      html: colorWindowHtml(value)
    });
  }

  hue.addEventListener('change', (event) => {
    const value = Number(event.currentTarget.value);
    hueControl.value.set(value);
    setHue(value);
  });

  hueControl.onChange((value) => setHue(value));

  // Tell the host setup is complete. Required for reload reconciliation (see SYNAPSE_API.md).
  await app.ready();
  write('Ready. Drag the Hue slider to change the published color.');
}

boot().catch((error) => write(String(error)));

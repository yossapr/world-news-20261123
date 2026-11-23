// shot.mjs — renders tools/poster.html at exactly 1024x1024 and writes a PNG.
//
// It drives a Chrome that is already running with --remote-debugging-port (9223 by default):
// the page is opened as a file:// URL, the viewport is pinned to 1024, and the screenshot is
// taken only once the layout has settled and been checked for spill.
//
// Usage: node tools/shot.mjs <out.png> [poster.html] [port]

import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
if (!out) {
  console.error('usage: node tools/shot.mjs <out.png> [poster.html] [port]');
  process.exit(2);
}
const posterPath = process.argv[3] ?? fileURLToPath(new URL('./poster.html', import.meta.url));
const port = Number(process.argv[4] ?? 9223);
const PAGE = 1024;

// --- a very small CDP client ----------------------------------------------------------------
const cdp = await openBrowser(port);
const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
const session = (method, params = {}) => cdp.send(method, params, sessionId);

try {
  await session('Page.enable');
  await session('Emulation.setDeviceMetricsOverride', {
    width: PAGE, height: PAGE, deviceScaleFactor: 1, mobile: false,
  });
  const loaded = waitFor(cdp, 'Page.loadEventFired', sessionId);
  await session('Page.navigate', { url: pathToFileURL(posterPath).href });
  await loaded;
  await session('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });

  const measured = await session('Runtime.evaluate', {
    expression: `(() => {
      const doc = document.documentElement;
      const spill = [...document.querySelectorAll('body *')]
        .filter((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && (box.right > ${PAGE} + 0.4 || box.bottom > ${PAGE} + 0.4 || box.left < -0.4);
        })
        .slice(0, 12)
        .map((node) => node.className || node.tagName);
      const briefs = document.querySelector('.briefs');
      return JSON.stringify({
        width: doc.scrollWidth, height: doc.scrollHeight,
        briefs: briefs ? [Math.round(briefs.clientHeight), Math.round(briefs.scrollHeight)] : null,
        spill,
      });
    })()`,
    returnByValue: true,
  });
  const report = JSON.parse(measured.result.value);
  if (report.width > PAGE || report.height > PAGE) {
    throw new Error(`the page is ${report.width}x${report.height}, not ${PAGE}x${PAGE}`);
  }
  if (report.spill.length) {
    throw new Error(`content runs past the page: ${report.spill.join(', ')}`);
  }
  // The briefs block is allowed to sit a few pixels tight against the footer rule, as the
  // page it was designed on did; a whole line of overflow would be a different matter.
  if (report.briefs && report.briefs[1] > report.briefs[0] + 8) {
    throw new Error(`the briefs need ${report.briefs[1]}px and have ${report.briefs[0]}px`);
  }

  const shot = await session('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const png = Buffer.from(shot.data, 'base64');
  const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (width !== PAGE || height !== PAGE) throw new Error(`the PNG is ${width}x${height}`);
  if (png.length > 1024 * 1024) throw new Error(`the PNG is ${png.length} bytes, over 1 MiB`);
  writeFileSync(out, png);
  console.log(`${out}: ${png.length} bytes, ${width}x${height}, briefs ${report.briefs?.join('/') ?? 'n/a'}`);
} finally {
  await cdp.send('Target.closeTarget', { targetId: target.targetId }).catch(() => {});
  cdp.close();
}

// --- plumbing -------------------------------------------------------------------------------
async function openBrowser(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  const listeners = new Set();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} ${JSON.stringify(message.error.data ?? '')}`));
      else resolve(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { socket.close(); },
  };
}

function waitFor(cdp, method, sessionId) {
  return new Promise((resolve) => {
    const off = cdp.on((message) => {
      if (message.method === method && (!sessionId || message.sessionId === sessionId)) {
        off();
        resolve();
      }
    });
  });
}

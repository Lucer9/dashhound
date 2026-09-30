/**
 * dashhound background: keeps the record list (and runs the page scripts only there), receives page events
 * (clicks, fields, console, fetch/XHR with redacted bodies), adds page loads, takes a screenshot when something
 * worth seeing happens, and streams everything to the local `dashhound` host, which writes it to disk.
 * Nothing is sent anywhere else.
 */
const api = globalThis.browser || globalThis.chrome;
if (typeof redact === 'undefined' && typeof importScripts === 'function') importScripts('redact.js');
const DEFAULTS = {
  sites: ['http://localhost/*', 'http://127.0.0.1/*'],
  shots: true,
  bodies: true,
  maxBodyKB: 32,
  privateKeys: '',
  keepHours: 24,
  maxMB: 500,
};
const PATTERN = /^(\*|https?|file):\/\/(\*|\*\.[^/*]+|[^/*]+)\/.*$/;
const SAVE_WORDS = /\b(save|add|create|confirm|submit|delete|remove|apply|continue|approve|reject|send|pay|accept|publish|checkout|sign ?in|log ?in)\b/i;
const SHOT_GAP = 4000;
const QUEUE_MAX = 500;

let config = { ...DEFAULTS };
let matchers = [];
let extraKeys = [];
let port = null;
let lastShot = 0;
const queue = [];

/** Turns a match pattern like `https://*.example.com/*` into a RegExp. */
function toRegExp(pattern) {
  const esc = pattern.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${esc}$`);
}

/** Whether a URL is on the record list. Ports are ignored, as in browser match patterns. */
function recorded(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const bare = `${u.protocol}//${u.hostname}${u.pathname}${u.search}`;
    return matchers.some((r) => r.test(bare));
  } catch (e) {
    return false;
  }
}

/** Runs the page scripts only on listed sites, so dashhound never even loads anywhere else. */
async function registerScripts(patterns) {
  await api.scripting.unregisterContentScripts().catch(() => {});
  if (!patterns.length) return;
  await api.scripting.registerContentScripts([
    { id: 'dashhound-content', js: ['content.js'], matches: patterns, runAt: 'document_start' },
    { id: 'dashhound-page', js: ['page.js'], matches: patterns, runAt: 'document_start', world: 'MAIN' },
  ]).catch((e) => console.error('dashhound: could not register scripts', e));
}

async function loadConfig() {
  config = { ...DEFAULTS, ...(await api.storage.local.get(Object.keys(DEFAULTS))) };
  const patterns = config.sites.map((s) => s.trim()).filter((s) => PATTERN.test(s));
  matchers = patterns.map(toRegExp);
  extraKeys = compileKeys(config.privateKeys);
  await registerScripts(patterns);
  post({ config: { keepHours: config.keepHours, maxMB: config.maxMB } });
}

/** Sends to the host, queueing while it is not connected. */
function post(msg) {
  if (port) {
    try { port.postMessage(msg); return; } catch (e) { port = null; }
  }
  if (queue.push(msg) > QUEUE_MAX) queue.shift();
}

/** Records one event for a tab. */
const record = (tab, kind, data) => post({ event: { ts: Date.now(), tab, kind, ...data } });

/** Screenshot of the tab, only if it is the visible one in its window; at most one per SHOT_GAP. */
async function shot(tabId, reason, delay) {
  if (!config.shots || Date.now() - lastShot < SHOT_GAP) return;
  lastShot = Date.now();
  await new Promise((r) => setTimeout(r, delay));
  try {
    const tab = await api.tabs.get(tabId);
    if (!tab.active || !recorded(tab.url)) return;
    const dataUrl = await api.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 50 });
    post({ shot: { ts: Date.now(), tab: tabId, reason, url: tab.url, dataUrl } });
  } catch (e) {}
}

function connect() {
  try {
    port = api.runtime.connectNative('dashhound');
  } catch (e) {
    port = null;
    setTimeout(connect, 10000);
    return;
  }
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 10000);
  });
  queue.splice(0).forEach(post);
  post({ config: { keepHours: config.keepHours, maxMB: config.maxMB } });
}

api.runtime.onMessage.addListener((msg, sender) => {
  const tab = sender.tab;
  if (!msg || !msg.dashhound || !tab || !recorded(tab.url)) return;
  const ev = msg.dashhound;
  if (ev.kind === 'net') {
    const max = config.maxBodyKB * 1024;
    if (config.bodies) {
      ev.req = redact(ev.req, max, extraKeys);
      ev.res = redact(ev.res, max, extraKeys);
    } else {
      delete ev.req;
      delete ev.res;
    }
    if (ev.status >= 400) shot(tab.id, `HTTP ${ev.status} ${ev.method} ${new URL(ev.url).pathname}`, 900);
  }
  record(tab.id, ev.kind, ev);
  if (ev.kind === 'click' && SAVE_WORDS.test(ev.text)) shot(tab.id, `clicked ${ev.text}`, 900);
  if (ev.kind === 'submit') shot(tab.id, 'form submitted', 900);
  if (ev.kind === 'console') shot(tab.id, `console ${ev.level}`, 500);
});

api.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url) return;
  if (recorded(info.url)) record(tabId, 'page', { url: info.url, title: tab.title });
});

api.storage.onChanged.addListener(loadConfig);
loadConfig().then(connect);

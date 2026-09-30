/**
 * dashhound background: keeps the record list, receives page events, adds page loads and API calls, takes a
 * screenshot when something worth seeing happens, and streams everything to the local `dashhound` host, which
 * writes it to disk. Nothing is sent anywhere else.
 */
const api = globalThis.browser || globalThis.chrome;
const DEFAULTS = {
  sites: ['http://localhost/*', 'http://127.0.0.1/*'],
  shots: true,
  keepHours: 24,
};
const SAVE_WORDS = /\b(save|add|create|confirm|submit|delete|remove|apply|continue|approve|reject|send|pay|accept|publish|checkout|sign ?in|log ?in)\b/i;
const SHOT_GAP = 4000;
const QUEUE_MAX = 500;

let config = { ...DEFAULTS };
let matchers = [];
let port = null;
let lastShot = 0;
const queue = [];
const tabUrls = new Map();

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

async function loadConfig() {
  config = { ...DEFAULTS, ...(await api.storage.local.get(Object.keys(DEFAULTS))) };
  matchers = config.sites.filter(Boolean).map(toRegExp);
  post({ config: { keepHours: config.keepHours } });
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
  post({ config: { keepHours: config.keepHours } });
}

api.runtime.onMessage.addListener((msg, sender) => {
  const tab = sender.tab;
  if (!msg || !msg.dashhound || !tab || !recorded(tab.url)) return;
  const ev = msg.dashhound;
  record(tab.id, ev.kind, ev);
  if (ev.kind === 'click' && SAVE_WORDS.test(ev.text)) shot(tab.id, `clicked ${ev.text}`, 900);
  if (ev.kind === 'submit') shot(tab.id, 'form submitted', 900);
  if (ev.kind === 'console') shot(tab.id, `console ${ev.level}`, 500);
});

api.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url) return;
  tabUrls.set(tabId, info.url);
  if (recorded(info.url)) record(tabId, 'page', { url: info.url, title: tab.title });
});
api.tabs.onRemoved.addListener((tabId) => tabUrls.delete(tabId));

/** The page a request belongs to: the tab's current URL (the request itself may go to an API on another host). */
const pageOf = (d) => tabUrls.get(d.tabId) || d.documentUrl || d.initiator;

api.webRequest.onCompleted.addListener((d) => {
  if (d.tabId < 0 || !recorded(pageOf(d))) return;
  record(d.tabId, 'net', { method: d.method, url: d.url, status: d.statusCode });
  if (d.statusCode >= 400) shot(d.tabId, `HTTP ${d.statusCode} ${d.method} ${new URL(d.url).pathname}`, 900);
}, { urls: ['<all_urls>'], types: ['xmlhttprequest'] });

api.webRequest.onErrorOccurred.addListener((d) => {
  if (d.tabId >= 0 && recorded(pageOf(d))) record(d.tabId, 'net', { method: d.method, url: d.url, error: d.error });
}, { urls: ['<all_urls>'], types: ['xmlhttprequest'] });

api.storage.onChanged.addListener(loadConfig);
api.tabs.query({}).then((tabs) => tabs.forEach((t) => tabUrls.set(t.id, t.url)));
loadConfig().then(connect);

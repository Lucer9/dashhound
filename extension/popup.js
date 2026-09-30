/**
 * dashhound toolbar popup: the dog and this tab's state, one action that fits it (record this site, reload, pause,
 * resume), the last events in this tab, the coat picker, a copyable log command, and settings.
 */
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
const COATS = ['dapple', 'cream', 'black', 'custom'];
const DEFAULT_COLORS = { coat: '#b86a3a', muzzle: '#e8b07a', ears: '#5a3322', bandana: '#e5332b' };
let colors = { ...DEFAULT_COLORS };

/** Draws the dog (dog.js) into a canvas at the canvas's own size. */
function draw(canvas, coat, state) {
  canvas.getContext('2d').putImageData(dogImage(coat, colors, state, canvas.width), 0, 0);
}

async function render() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  let origin = null;
  try {
    const u = new URL(tab.url);
    if (/^https?:$/.test(u.protocol)) origin = `${u.protocol}//${u.hostname}/*`;
  } catch (e) {}
  const status = origin ? await api.runtime.sendMessage({ dashhoundStatus: tab.url }) : { recorded: false, paused: false };
  const saved = await api.storage.local.get(['coat', 'colors']);
  const coat = COATS.includes(saved.coat) ? saved.coat : 'dapple';
  colors = { ...DEFAULT_COLORS, ...(saved.colors || {}) };
  const live = status.recorded && !status.paused;
  const redraw = () => {
    draw($('dog'), coat, live ? 'recording' : 'icon');
    for (const b of document.querySelectorAll('.coats button')) draw(b.querySelector('canvas'), b.dataset.coat, 'icon');
  };
  redraw();
  $('site').textContent = origin ? new URL(tab.url).host : 'This page';
  $('site').title = tab.url || '';
  const pill = $('pill');
  if (!origin) [pill.className, pill.textContent] = ['off', "Can't record this page"];
  else if (!status.recorded) [pill.className, pill.textContent] = ['off', 'Not recorded'];
  else if (status.paused) [pill.className, pill.textContent] = ['pause', 'Paused'];
  else [pill.className, pill.textContent] = ['rec', 'Recording'];

  $('add').hidden = !origin || status.recorded;
  $('reload').hidden = true;
  $('pause').hidden = !status.recorded;
  $('pause').textContent = status.paused ? 'Resume recording' : 'Pause';
  $('pause').className = status.paused ? 'primary' : '';
  $('note').hidden = !!origin;
  $('note').textContent = 'dashhound records http and https pages on your site list.';

  $('add').onclick = async () => {
    const { sites = ['http://localhost/*', 'http://127.0.0.1/*'] } = await api.storage.local.get('sites');
    if (!sites.includes(origin)) await api.storage.local.set({ sites: [...sites, origin] });
    $('add').hidden = true;
    $('reload').hidden = false;
    $('pill').className = 'pause';
    $('pill').textContent = 'Starts on the next page load';
  };
  $('reload').onclick = async () => { await api.tabs.reload(tab.id); window.close(); };
  $('pause').onclick = async () => { await api.storage.local.set({ paused: !status.paused }); render(); };

  for (const b of document.querySelectorAll('.coats button')) {
    b.setAttribute('aria-pressed', String(b.dataset.coat === coat));
    b.onclick = async () => { await api.storage.local.set({ coat: b.dataset.coat }); render(); };
  }
  $('colors').hidden = coat !== 'custom';
  for (const input of document.querySelectorAll('#colors input')) {
    input.value = colors[input.dataset.role];
    input.oninput = () => { colors[input.dataset.role] = input.value; redraw(); };
    input.onchange = () => api.storage.local.set({ colors });
  }
  $('resetColors').onclick = async () => { await api.storage.local.set({ colors: DEFAULT_COLORS }); render(); };

  const { recent = {} } = await api.storage.session.get('recent');
  const list = $('events');
  list.textContent = '';
  for (const e of (recent[tab.id] || []).slice().reverse()) {
    const li = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const kind = document.createElement('span');
    kind.className = `kind${e.bad ? ' bad' : ''}`;
    kind.textContent = e.kind === 'console' ? 'error' : e.kind;
    const text = document.createElement('span');
    text.className = `text${e.bad ? ' bad' : ''}`;
    text.textContent = e.text;
    li.title = e.text;
    li.append(time, kind, text);
    list.append(li);
  }
  if (!list.children.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = live ? 'Nothing yet. Click around and it shows up here.' : 'Nothing recorded in this tab.';
    list.append(li);
  }
}

$('copy').onclick = async () => {
  await navigator.clipboard.writeText('dashhound log --since 10m');
  $('copy').textContent = 'Copied';
  setTimeout(() => { $('copy').textContent = 'Copy log command'; }, 1500);
};
$('settings').onclick = (e) => { e.preventDefault(); api.runtime.openOptionsPage(); window.close(); };
render();

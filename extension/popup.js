/** dashhound toolbar popup: is this tab recorded, record this site, pause/resume, last events, settings. */
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function render() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  let origin = null;
  try {
    const u = new URL(tab.url);
    if (/^https?:$/.test(u.protocol)) origin = `${u.protocol}//${u.hostname}/*`;
  } catch (e) {}
  const status = origin ? await api.runtime.sendMessage({ dashhoundStatus: tab.url }) : { recorded: false, paused: false };
  const { paused } = status;

  $('site').textContent = origin ? new URL(tab.url).host : 'This page cannot be recorded';
  $('state').className = status.recorded && !paused ? 'rec' : '';
  $('state').textContent = !status.recorded ? 'Not recorded' : paused ? 'Listed, but recording is paused' : 'Recording';
  $('add').hidden = !origin || status.recorded;
  $('pause').textContent = paused ? 'Resume' : 'Pause recording';

  $('add').onclick = async () => {
    const { sites = ['http://localhost/*', 'http://127.0.0.1/*'] } = await api.storage.local.get('sites');
    if (!sites.includes(origin)) await api.storage.local.set({ sites: [...sites, origin] });
    $('add').hidden = true;
    $('state').textContent = 'Recorded from the next page load';
    $('reload').hidden = false;
  };
  $('reload').onclick = async () => { await api.tabs.reload(tab.id); window.close(); };
  $('pause').onclick = async () => { await api.storage.local.set({ paused: !paused }); render(); };

  const { recent = {} } = await api.storage.session.get('recent');
  const list = $('events');
  list.textContent = '';
  for (const e of (recent[tab.id] || []).slice().reverse()) {
    const li = document.createElement('li');
    li.textContent = `${new Date(e.ts).toLocaleTimeString([], { hour12: false })} ${e.kind} ${e.text}`;
    li.title = li.textContent;
    list.append(li);
  }
  if (!list.children.length) list.textContent = 'Nothing yet.';
}

$('settings').onclick = (e) => { e.preventDefault(); api.runtime.openOptionsPage(); window.close(); };
render();

/** dashhound settings: which sites are recorded, what stays private, screenshots, how long the log is kept. */
const api = globalThis.browser || globalThis.chrome;
const DEFAULT_PRIVATE = 'input[type=password], [autocomplete^="cc-"], [data-private], [data-dashhound-private]';
const $ = (id) => document.getElementById(id);

api.storage.local.get(['sites', 'private', 'shots', 'keepHours']).then((c) => {
  $('sites').value = (c.sites || ['http://localhost/*', 'http://127.0.0.1/*']).join('\n');
  $('private').value = c.private || DEFAULT_PRIVATE;
  $('shots').checked = c.shots !== false;
  $('keepHours').value = c.keepHours || 24;
});

$('save').addEventListener('click', async () => {
  await api.storage.local.set({
    sites: $('sites').value.split('\n').map((s) => s.trim()).filter(Boolean),
    private: $('private').value.trim() || DEFAULT_PRIVATE,
    shots: $('shots').checked,
    keepHours: Math.max(1, Number($('keepHours').value) || 24),
  });
  $('saved').textContent = 'Saved';
  setTimeout(() => { $('saved').textContent = ''; }, 1500);
});

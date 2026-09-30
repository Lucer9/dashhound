/** dashhound settings: which sites are recorded, what stays private, screenshots, bodies, and the loop limits. */
const api = globalThis.browser || globalThis.chrome;
const DEFAULT_PRIVATE = 'input[type=password], [autocomplete^="cc-"], [data-private], [data-dashhound-private]';
const $ = (id) => document.getElementById(id);

api.storage.local.get(['sites', 'private', 'shots', 'bodies', 'maxBodyKB', 'keepHours', 'maxMB']).then((c) => {
  $('sites').value = (c.sites || ['http://localhost/*', 'http://127.0.0.1/*']).join('\n');
  $('private').value = c.private || DEFAULT_PRIVATE;
  $('shots').checked = c.shots !== false;
  $('bodies').checked = c.bodies !== false;
  $('maxBodyKB').value = c.maxBodyKB || 32;
  $('keepHours').value = c.keepHours || 24;
  $('maxMB').value = c.maxMB || 500;
});

$('save').addEventListener('click', async () => {
  await api.storage.local.set({
    sites: $('sites').value.split('\n').map((s) => s.trim()).filter(Boolean),
    private: $('private').value.trim() || DEFAULT_PRIVATE,
    shots: $('shots').checked,
    bodies: $('bodies').checked,
    maxBodyKB: Math.max(1, Number($('maxBodyKB').value) || 32),
    keepHours: Math.max(1, Number($('keepHours').value) || 24),
    maxMB: Math.max(10, Number($('maxMB').value) || 500),
  });
  $('saved').textContent = 'Saved';
  setTimeout(() => { $('saved').textContent = ''; }, 1500);
});

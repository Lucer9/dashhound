/**
 * Records what the person does on the page: clicks (by the words on the thing clicked) and field changes
 * (by the field's name, value redacted for private fields). Everything goes to background.js, which only keeps
 * events from sites on the record list.
 */
const api = globalThis.browser || globalThis.chrome;
const INTERACTIVE = 'button, a, [role=button], [role=option], [role=menuitem], [role=tab], [role=checkbox], [role=switch], summary, label, select, input, textarea';
const FIELDS = 'input, textarea, select';
const CARD = /\b(?:\d[ -]?){13,19}\b/;
let privateSelectors = 'input[type=password], [autocomplete^="cc-"], [data-private], [data-dashhound-private]';

api.storage.local.get('private').then(({ private: p }) => { if (p) privateSelectors = p; });
api.storage.onChanged.addListener((c) => { if (c.private) privateSelectors = c.private.newValue; });

const send = (ev) => api.runtime.sendMessage({ dashhound: { ...ev, path: location.pathname } }).catch(() => {});
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** What a person would call the thing they clicked. */
function describe(el) {
  return clean((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || el.innerText || el.value || el.tagName.toLowerCase()).slice(0, 80);
}

/** The best name a field has: its label, aria-label, placeholder, name, framework control name, test id, id. */
function fieldName(el) {
  const label = (el.labels && el.labels[0] && el.labels[0].innerText)
    || (el.closest && el.closest('mat-form-field') && el.closest('mat-form-field').querySelector('mat-label') && el.closest('mat-form-field').querySelector('mat-label').innerText);
  return clean(el.getAttribute('aria-label') || label || el.placeholder || el.name || el.getAttribute('formcontrolname')
    || el.getAttribute('data-testid') || el.id || el.tagName.toLowerCase()).slice(0, 60);
}

/** A field's value as it may be recorded: private fields and card-like numbers never leave the page. */
function fieldValue(el) {
  let privateField = false;
  try { privateField = el.matches(privateSelectors) || !!el.closest('[data-private], [data-dashhound-private]'); } catch (e) {}
  const v = el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : String(el.value);
  return privateField || CARD.test(v) ? '[private]' : v.slice(0, 200);
}

if (!window.__dashhoundInstalled) {
  window.__dashhoundInstalled = true;
  const before = new WeakMap();

  document.addEventListener('click', (e) => {
    const t = e.composedPath()[0];
    if (!(t instanceof Element)) return;
    const el = t.closest(INTERACTIVE);
    if (!el && clean(t.innerText).length > 60) return;
    const target = el || t;
    send(target.matches(FIELDS) ? { kind: 'click', text: `field ${fieldName(target)}` } : { kind: 'click', text: describe(target), tag: target.tagName.toLowerCase() });
  }, true);

  document.addEventListener('focusin', (e) => {
    const t = e.composedPath()[0];
    if (t instanceof Element && t.matches(FIELDS)) before.set(t, t.value);
  }, true);

  const fieldChanged = (e) => {
    const t = e.composedPath()[0];
    if (!(t instanceof Element) || !t.matches(FIELDS)) return;
    const isToggle = t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT';
    if (!isToggle && (e.type !== 'focusout' || before.get(t) === t.value)) return;
    before.set(t, t.value);
    send({ kind: 'field', name: fieldName(t), value: fieldValue(t) });
  };
  document.addEventListener('focusout', fieldChanged, true);
  document.addEventListener('change', fieldChanged, true);

  document.addEventListener('submit', (e) => {
    const f = e.composedPath()[0];
    send({ kind: 'submit', text: clean((f.getAttribute && (f.getAttribute('aria-label') || f.getAttribute('name') || f.id)) || 'form') });
  }, true);

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.__dashhound) send(e.data.__dashhound);
  });
}

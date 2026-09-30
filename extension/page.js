/**
 * Runs in the page's own world (so it sees the page's console and errors) and hands each error to content.js
 * through window.postMessage. It records nothing itself; background.js decides whether this site is recorded.
 */
(() => {
  if (window.__dashhoundHooked) return;
  window.__dashhoundHooked = true;

  /** Short readable text for a logged value. */
  const text = (v) => {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.stack || String(v);
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  };
  const send = (level, parts) => window.postMessage({ __dashhound: { kind: 'console', level, text: parts.map(text).join(' ').slice(0, 1000) } }, '*');

  const original = console.error;
  console.error = function (...args) {
    try { send('error', args); } catch (e) {}
    return original.apply(this, args);
  };
  addEventListener('error', (e) => send('uncaught', [(e.error && e.error.stack) || e.message]));
  addEventListener('unhandledrejection', (e) => send('unhandledrejection', [e.reason]));
})();

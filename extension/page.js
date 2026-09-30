/**
 * Runs in the page's own world, only on sites on the record list (background.js registers it there). It sees the
 * page's console and its fetch/XHR calls, and hands each one to content.js through window.postMessage.
 * Response bodies are read from a copy of the response, so the page's own reading is untouched. Bodies are capped
 * here; background.js redacts them and cuts them to the configured size.
 */
(() => {
  if (window.__dashhoundHooked) return;
  window.__dashhoundHooked = true;
  const CAP = 262144;
  const TEXTUAL = /json|text|xml|javascript|x-www-form-urlencoded|graphql/i;

  const post = (ev) => window.postMessage({ __dashhound: ev }, '*');
  const text = (v) => {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.stack || String(v);
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  };
  const cap = (s) => (s && s.length > CAP ? `${s.slice(0, CAP)}…[${s.length - CAP} more chars]` : s);
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return String(u); } };

  const original = console.error;
  console.error = function (...args) {
    try { post({ kind: 'console', level: 'error', text: args.map(text).join(' ').slice(0, 1000) }); } catch (e) {}
    return original.apply(this, args);
  };
  addEventListener('error', (e) => post({ kind: 'console', level: 'uncaught', text: String((e.error && e.error.stack) || e.message).slice(0, 1000) }));
  addEventListener('unhandledrejection', (e) => post({ kind: 'console', level: 'unhandledrejection', text: text(e.reason).slice(0, 1000) }));

  /** A request body as text: strings, form data (files by name), URL params; binary as a size note. */
  async function bodyText(body) {
    if (body == null) return undefined;
    if (typeof body === 'string') return cap(body);
    if (body instanceof URLSearchParams) return cap(body.toString());
    if (body instanceof FormData) return cap(JSON.stringify([...body].map(([k, v]) => [k, typeof v === 'string' ? v : `[file ${v.name}]`])));
    if (body instanceof Blob) return `[binary ${body.size} bytes]`;
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return `[binary ${body.byteLength} bytes]`;
    if (body instanceof Request) return TEXTUAL.test(body.headers.get('content-type') || 'text') ? cap(await body.text()) : '[binary]';
    return undefined;
  }

  /** Reads up to CAP characters of a response copy; non-text responses become a type note. */
  async function responseText(resp) {
    const type = resp.headers.get('content-type') || '';
    if (type && !TEXTUAL.test(type)) return `[${type}]`;
    if (!resp.body) return '';
    const reader = resp.body.getReader(), dec = new TextDecoder();
    let out = '', total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (out.length < CAP) out += dec.decode(value, { stream: true });
      else { reader.cancel(); return `${out.slice(0, CAP)}…[${total}+ bytes]`; }
    }
    return cap(out);
  }

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const started = Date.now();
    const isRequest = input instanceof Request;
    const method = String((init && init.method) || (isRequest ? input.method : 'GET')).toUpperCase();
    const url = abs(isRequest ? input.url : input);
    const reqSource = init && init.body !== undefined ? init.body : (isRequest && method !== 'GET' && method !== 'HEAD' ? input.clone() : undefined);
    const req = bodyText(reqSource).catch(() => undefined);
    const call = originalFetch.apply(this, arguments);
    call.then(async (resp) => {
      const res = await responseText(resp.clone()).catch(() => undefined);
      post({ kind: 'net', method, url: resp.url || url, status: resp.status, ms: Date.now() - started, req: await req, res });
    }, async (err) => {
      if (err && err.name === 'AbortError') return;
      post({ kind: 'net', method, url, error: String(err && err.message || err), ms: Date.now() - started, req: await req });
    });
    return call;
  };

  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__dashhound = { method: String(method).toUpperCase(), url: abs(url) };
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const d = this.__dashhound;
    if (d) {
      d.started = Date.now();
      const req = bodyText(body).catch(() => undefined);
      this.addEventListener('loadend', async () => {
        let res;
        try {
          if (this.responseType === '' || this.responseType === 'text') res = cap(this.responseText);
          else if (this.responseType === 'json') res = cap(JSON.stringify(this.response));
          else res = `[${this.responseType}]`;
        } catch (e) {}
        if (this.status === 0 && this.readyState === 4 && !res) {
          post({ kind: 'net', method: d.method, url: d.url, error: 'failed or aborted', ms: Date.now() - d.started, req: await req });
        } else {
          post({ kind: 'net', method: d.method, url: this.responseURL || d.url, status: this.status, ms: Date.now() - d.started, req: await req, res });
        }
      });
    }
    return send.apply(this, arguments);
  };
})();

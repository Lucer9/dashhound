/**
 * Makes a request or response body safe to keep: secrets under sensitive keys become "[private]" (JSON and
 * form bodies; in an OAuth token exchange also the one-time `code`), card numbers anywhere become "[private]",
 * and the result is cut to `max` characters. `extra` adds the user's own keys (see `compileKeys`) to the built-in list.
 * Loaded by background.js; `node test/redact.test.js` checks it.
 */
const SENSITIVE_KEY = /pass(word|wd)?|secret|token|authori[sz]ation|api[_-]?key|session|cookie|credential|ssn|cvv|cvc|card[_-]?number/i;
const CARD_NUMBER = /\b\d(?:[ -]?\d){12,18}\b/g;

/** Luhn checksum, so ids and millisecond timestamps are not mistaken for card numbers. */
function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}
/**
 * Turns the settings text (one pattern per line) into key tests: `/regex/flags` is a regex, anything else is a
 * whole key name compared case-insensitively. Blank lines and invalid regexes are skipped.
 */
function compileKeys(text) {
  const tests = [];
  for (const line of String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = /^\/(.+)\/([a-z]*)$/.exec(line);
    if (m) {
      try {
        const re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        tests.push((k) => re.test(k));
      } catch (e) {}
    } else {
      const word = line.toLowerCase();
      tests.push((k) => k.toLowerCase() === word);
    }
  }
  return tests;
}
const isPrivate = (key, extra) => SENSITIVE_KEY.test(key) || extra.some((test) => test(key));
const hideCards = (s) => s.replace(CARD_NUMBER, (m) => (luhn(m.replace(/\D/g, '')) ? '[private]' : m));

function scrub(value, extra) {
  if (Array.isArray(value)) return value.map((v) => scrub(v, extra));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = isPrivate(k, extra) ? '[private]' : scrub(v, extra);
    return out;
  }
  return typeof value === 'string' ? hideCards(value) : value;
}

function redact(text, max = 32768, extra = []) {
  if (text == null || text === '') return text;
  let out = String(text);
  try {
    out = JSON.stringify(scrub(JSON.parse(out), extra));
  } catch (e) {
    if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(out)) {
      const oauth = /(^|&)grant_type=/.test(out);
      out = out.split('&').map((pair) => {
        const [k, ...v] = pair.split('=');
        const key = decodeURIComponent(k);
        return isPrivate(key, extra) || (oauth && /^code(_verifier)?$/.test(key)) ? `${k}=[private]` : `${k}=${v.join('=')}`;
      }).join('&');
    }
    out = hideCards(out);
  }
  return out.length > max ? `${out.slice(0, max)}…[${out.length - max} more chars]` : out;
}

if (typeof module !== 'undefined') module.exports = { redact, compileKeys };

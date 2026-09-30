// Run: node test/redact.test.js
const assert = require('assert');
const { redact, compileKeys } = require('../extension/redact.js');

assert.strictEqual(redact('{"email":"a@b.c","password":"hunter2"}'), '{"email":"a@b.c","password":"[private]"}');
assert.strictEqual(redact('{"user":{"accessToken":"x","name":"n"},"items":[{"apiKey":"k"}]}'), '{"user":{"accessToken":"[private]","name":"n"},"items":[{"apiKey":"[private]"}]}');
assert.strictEqual(redact('{"note":"card 4111 1111 1111 1111 ok"}'), '{"note":"card [private] ok"}');
assert.strictEqual(redact('user=ana&password=secret&x=1'), 'user=ana&password=[private]&x=1');
assert.strictEqual(redact('code=abc&grant_type=authorization_code&client_id=app'), 'code=[private]&grant_type=authorization_code&client_id=app', 'OAuth code');
assert.strictEqual(redact('code=SPRING&qty=2'), 'code=SPRING&qty=2', 'a promo code is not an OAuth code');
assert.strictEqual(redact('plain text 4111111111111111'), 'plain text [private]');
assert.strictEqual(redact('{"total":1250,"qty":3}'), '{"total":1250,"qty":3}');
assert.strictEqual(redact('{"at":"1790781926346"}'), '{"at":"1790781926346"}', 'a ms timestamp is not a card');
assert.strictEqual(redact('abcdef', 3), 'abc…[3 more chars]');
assert.strictEqual(redact(''), '');
assert.strictEqual(redact(undefined), undefined);
const extra = compileKeys('PIN\n/^ssn_/\n/(/\n');
assert.strictEqual(redact('{"pin":"1234","a":{"Pin":"1"},"shipping":"x"}', 999, extra), '{"pin":"[private]","a":{"Pin":"[private]"},"shipping":"x"}', 'plain word');
assert.strictEqual(redact('{"ssn_last4":"1234","id":7}', 999, extra), '{"ssn_last4":"[private]","id":7}', 'regex');
assert.strictEqual(redact('pin=1&ssn_last4=2&n=3', 999, extra), 'pin=[private]&ssn_last4=[private]&n=3', 'form body');
assert.strictEqual(redact('{"password":"x","pin":"1"}', 999, extra), '{"password":"[private]","pin":"[private]"}', 'built-in keys still apply');
console.log('redact ok');

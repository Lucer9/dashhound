// Run: node test/redact.test.js
const assert = require('assert');
const { redact } = require('../extension/redact.js');

assert.strictEqual(redact('{"email":"a@b.c","password":"hunter2"}'), '{"email":"a@b.c","password":"[private]"}');
assert.strictEqual(redact('{"user":{"accessToken":"x","name":"n"},"items":[{"apiKey":"k"}]}'), '{"user":{"accessToken":"[private]","name":"n"},"items":[{"apiKey":"[private]"}]}');
assert.strictEqual(redact('{"note":"card 4111 1111 1111 1111 ok"}'), '{"note":"card [private] ok"}');
assert.strictEqual(redact('user=ana&password=secret&x=1'), 'user=ana&password=[private]&x=1');
assert.strictEqual(redact('plain text 4111111111111111'), 'plain text [private]');
assert.strictEqual(redact('{"total":1250,"qty":3}'), '{"total":1250,"qty":3}');
assert.strictEqual(redact('{"at":"1790781926346"}'), '{"at":"1790781926346"}', 'a ms timestamp is not a card');
assert.strictEqual(redact('abcdef', 3), 'abc…[3 more chars]');
assert.strictEqual(redact(''), '');
assert.strictEqual(redact(undefined), undefined);
console.log('redact ok');

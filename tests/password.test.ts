import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD, authMessage, checkPassword } from '../src/password.ts';

const EMAIL = 'asha.rao@example.com';

test('a password needs enough length, and not too much for the hash to use', () => {
  assert.equal(checkPassword('x'.repeat(MIN_PASSWORD - 1), EMAIL), `Use at least ${MIN_PASSWORD} characters.`);
  assert.equal(checkPassword('correct horse battery', EMAIL), null);
  assert.equal(checkPassword('a1B2c3D4e5', EMAIL), null, 'exactly the minimum is fine');
  assert.equal(checkPassword('a1B2c3D4e5'.repeat(8), EMAIL), `Use at most ${MAX_PASSWORD_BYTES} characters.`);
  // the limit is in bytes: 37 two-byte characters is 74 bytes although it is only 37 characters long
  assert.equal(checkPassword('é'.repeat(37), EMAIL), `Use at most ${MAX_PASSWORD_BYTES} characters.`);
  assert.equal(checkPassword('é'.repeat(36) + 'abcdefg', EMAIL), `Use at most ${MAX_PASSWORD_BYTES} characters.`);
  assert.equal(checkPassword('é1b2'.repeat(10), EMAIL), null, '50 bytes is within the limit');
});

test('the email address, its name part and the commonest passwords are refused', () => {
  assert.match(checkPassword(EMAIL, EMAIL) ?? '', /email/);
  assert.match(checkPassword('ASHA.RAO-2026-xyz', EMAIL) ?? '', /email/, 'the name part, in any case');
  assert.equal(checkPassword('ash-and-bob-1234', EMAIL), null, 'a similar but different word is fine');
  assert.equal(checkPassword('moon-river-sky-77', 'jo@example.com'), null, 'a name part under 4 letters is not matched');
  assert.match(checkPassword('Password1234', EMAIL) ?? '', /common/);
  assert.match(checkPassword('1234567890', EMAIL) ?? '', /common/);
  assert.match(checkPassword('aaaaaaaaaaaa', EMAIL) ?? '', /wider mix/);
  assert.match(checkPassword('abababababab', EMAIL) ?? '', /wider mix/);
  assert.equal(checkPassword('correct horse battery', ''), null, 'no email given yet');
});

test('service answers become readable messages, and unknown ones pass through unchanged', () => {
  assert.match(authMessage(400, 'Invalid login credentials'), /email or password/);
  assert.match(authMessage(400, 'Email not confirmed'), /Confirm your email/);
  assert.match(authMessage(422, 'User already registered'), /already an account/);
  assert.match(authMessage(429, 'anything'), /Too many tries/);
  assert.match(authMessage(400, 'email rate limit exceeded'), /Too many tries/);
  assert.match(authMessage(422, 'Signups not allowed for this instance'), /switched off/);
  assert.match(authMessage(422, 'New password should be different from the old password.'), /different/);
  assert.match(authMessage(422, 'Email address "a@b.co" is not authorized'), /could not be sent/);
  assert.equal(authMessage(422, 'Password should be at least 8 characters.'), 'Password should be at least 8 characters.');
  assert.equal(authMessage(500, 'Something odd'), 'Something odd');
});

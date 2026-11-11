import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, cleanStoredWhatsapp, formatWhatsapp, initials, isIndianNumber, localDigits, normalizeWhatsapp } from '../../src/core/profile.ts';

test('a name is trimmed, single-spaced and cut to 40 characters', () => {
  assert.equal(cleanName('  Raj   deep  '), 'Raj deep');
  assert.equal(cleanName('x'.repeat(60)).length, 40);
  assert.equal(cleanName(undefined), '');
  assert.equal(cleanName(5), '');
});

test('a WhatsApp number is optional; when given it is an Indian mobile number kept as +91 and 10 digits', () => {
  assert.deepEqual(normalizeWhatsapp(''), { ok: true, value: '' });
  assert.deepEqual(normalizeWhatsapp('   '), { ok: true, value: '' });
  for (const typed of ['98765 43210', '9876543210', '+91 98765-43210', '+919876543210', '91 98765 43210', '919876543210', '0091 98765 43210', '09876543210', '(98765) 43210', '98765.43210']) {
    assert.deepEqual(normalizeWhatsapp(typed), { ok: true, value: '+919876543210' }, typed);
  }
  for (const first of ['6', '7', '8', '9']) assert.equal(normalizeWhatsapp(`${first}123456789`).ok, true, first);
});

test('anything that is not a 10-digit Indian mobile number is refused with one clear message', () => {
  const bad = ['12345', '+91 12', 'abc', '5876543210', '1234567890', '98765 4321', '98765 432101', '+44 20 7946 0958', '0044 20 7946 0958', '(+1) 415 555 2671', '+91 5876543210', '+9198765432109876', '9876543210x', '+91', '91'];
  for (const input of bad) {
    const r = normalizeWhatsapp(input);
    assert.equal(r.ok, false, input);
    assert.match(r.ok ? '' : r.error, /10-digit Indian mobile number/, input);
  }
});

test('only +91 numbers are valid saved numbers, but an older saved number from another country is kept until the next save', () => {
  assert.equal(isIndianNumber('+919876543210'), true);
  for (const v of ['', '+91987654321', '+449876543210', '9876543210', '+915876543210', '+9198765432101']) assert.equal(isIndianNumber(v), false, v);
  assert.equal(cleanStoredWhatsapp('+442079460958'), '+442079460958');
  assert.equal(cleanStoredWhatsapp('+919876543210'), '+919876543210');
  for (const v of ['', 'abc', '+12', '98765', null, undefined, 5]) assert.equal(cleanStoredWhatsapp(v), '', String(v));
});

test('a number is shown in groups for India and as it is otherwise; the field next to +91 holds the 10 digits', () => {
  assert.equal(formatWhatsapp('+919876543210'), '+91 98765 43210');
  assert.equal(formatWhatsapp('+442079460958'), '+442079460958');
  assert.equal(formatWhatsapp(''), '');
  assert.equal(localDigits('+919876543210'), '98765 43210');
  assert.equal(localDigits('+442079460958'), '');
  assert.equal(localDigits(''), '');
});

test('the round picture shows one or two letters', () => {
  assert.equal(initials('rajdeep singh'), 'RS');
  assert.equal(initials('Priya'), 'P');
  assert.equal(initials('one two three'), 'OT');
  assert.equal(initials('', 'asha@example.com'), 'A');
  assert.equal(initials('', null), '?');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, formatWhatsapp, initials, normalizeWhatsapp } from '../../src/core/profile.ts';

test('a name is trimmed, single-spaced and cut to 40 characters', () => {
  assert.equal(cleanName('  Raj   deep  '), 'Raj deep');
  assert.equal(cleanName('x'.repeat(60)).length, 40);
  assert.equal(cleanName(undefined), '');
  assert.equal(cleanName(5), '');
});

test('a WhatsApp number is optional and kept with its country code only', () => {
  assert.deepEqual(normalizeWhatsapp(''), { ok: true, value: '' });
  assert.deepEqual(normalizeWhatsapp('   '), { ok: true, value: '' });
  assert.deepEqual(normalizeWhatsapp('+91 98765-43210'), { ok: true, value: '+919876543210' });
  assert.deepEqual(normalizeWhatsapp('98765 43210'), { ok: true, value: '+919876543210' }, 'a bare Indian mobile number gets +91');
  assert.deepEqual(normalizeWhatsapp('0044 20 7946 0958'), { ok: true, value: '+442079460958' }, '00 means +');
  assert.deepEqual(normalizeWhatsapp('(+1) 415 555 2671'), { ok: true, value: '+14155552671' });
  for (const bad of ['12345', '+91 12', 'abc', '+0123456789', '5876543210', '+9198765432109876']) assert.equal(normalizeWhatsapp(bad).ok, false, bad);
});

test('a number is shown in groups for India and as typed for other countries', () => {
  assert.equal(formatWhatsapp('+919876543210'), '+91 98765 43210');
  assert.equal(formatWhatsapp('+442079460958'), '+442079460958');
  assert.equal(formatWhatsapp(''), '');
});

test('the round picture shows one or two letters', () => {
  assert.equal(initials('rajdeep singh'), 'RS');
  assert.equal(initials('Priya'), 'P');
  assert.equal(initials('one two three'), 'OT');
  assert.equal(initials('', 'asha@example.com'), 'A');
  assert.equal(initials('', null), '?');
});

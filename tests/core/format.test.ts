import test from 'node:test';
import assert from 'node:assert/strict';
import { compactINR, monthShort, weekdayShort } from '../../src/core/format.ts';
import { setLang } from '../../src/core/i18n.ts';

test('compact rupee amounts use lakh and crore', () => {
  assert.equal(compactINR(0), '₹0');
  assert.equal(compactINR(950), '₹950');
  assert.equal(compactINR(1000), '₹1k');
  assert.equal(compactINR(12300), '₹12.3k');
  assert.equal(compactINR(100000), '₹1L');
  assert.equal(compactINR(123456), '₹1.2L');
  assert.equal(compactINR(45000000), '₹4.5Cr');
  assert.equal(compactINR(-2500), '-₹2.5k');
});

test('month and weekday names follow the language; Monday is first', () => {
  setLang('en');
  assert.equal(monthShort('2026-11'), 'Nov');
  assert.equal(weekdayShort(0), 'Mon');
  assert.equal(weekdayShort(6), 'Sun');
  setLang('hi');
  assert.match(monthShort('2026-11'), /[ऀ-ॿ]/, 'Devanagari in Hindi');
  assert.match(weekdayShort(0), /[ऀ-ॿ]/);
  setLang('hinglish');
  assert.equal(monthShort('2026-11'), 'Nov');
  setLang('en');
});

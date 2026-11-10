import test from 'node:test';
import assert from 'node:assert/strict';
import { compactINR, monthShort, ordinal, weekdayShort } from '../../src/core/format.ts';
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

test('the day of the month in words', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '30th', '31st']);
});

test('in Hindi and Hinglish the day of the month is just the number', () => {
  setLang('hi');
  assert.equal(ordinal(5), '5');
  setLang('hinglish');
  assert.equal(ordinal(22), '22');
  setLang('en');
  assert.equal(ordinal(22), '22nd');
});

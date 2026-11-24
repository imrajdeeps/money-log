import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIP_CAP, chipCategories, dayBefore } from '../../../src/features/payments/quickLog.ts';

const NAMES = ['Groceries', 'Rent', 'Eating out', 'Transport', 'Bills', 'Other'];

test('every category is a chip from the first entry, in the list\'s order, when nothing has been used', () => {
  assert.deepEqual(chipCategories(NAMES, [], ''), NAMES);
});

test('the most used come first, spelled as the list spells them, and nothing repeats', () => {
  assert.deepEqual(chipCategories(NAMES, ['eating out', 'GROCERIES', 'Gone category'], ''), ['Eating out', 'Groceries', 'Rent', 'Transport', 'Bills', 'Other']);
});

test('only so many chips show, and the chosen category is always one of them', () => {
  const many = Array.from({ length: 30 }, (_, i) => `Cat ${i}`);
  assert.equal(chipCategories(many, [], '').length, CHIP_CAP);
  const shown = chipCategories(many, [], 'cat 25');
  assert.equal(shown.length, CHIP_CAP);
  assert.equal(shown[0], 'Cat 25', 'a category picked from the long list shows as pressed');
  assert.equal(new Set(shown).size, shown.length);
  assert.deepEqual(chipCategories(many, [], 'Cat 3'), many.slice(0, CHIP_CAP), 'already among them: nothing moves');
});

test('an unknown chosen category adds nothing', () => {
  assert.deepEqual(chipCategories(NAMES, [], 'Nothing like it'), NAMES);
});

test('yesterday is a calendar day, across month and year ends and leap days', () => {
  assert.equal(dayBefore('2026-11-24'), '2026-11-23');
  assert.equal(dayBefore('2026-12-01'), '2026-11-30');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  assert.equal(dayBefore('2028-03-01'), '2028-02-29');
  assert.equal(dayBefore('2027-03-01'), '2027-02-28');
});

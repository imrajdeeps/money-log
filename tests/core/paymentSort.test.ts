import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SORT, SORT_KEYS, parseSortKey, sortPayments } from '../../src/core/paymentSort.ts';
import { makeEntry } from '../../src/core/logic.ts';
import type { Entry } from '../../src/core/logic.ts';

const ME = 'me';
const mk = (id: string, date: string, amount: number, category: string, created: string): Entry =>
  ({ ...makeEntry({ amount, category, date, method: 'UPI', note: id }, created), id });
// logged out of order on purpose: the last one typed is not the latest day
const list = [
  mk('a', '2026-11-02', 500, 'Rent', '2026-11-05T10:00:00.000Z'),
  mk('b', '2026-11-09', 120, 'Food', '2026-11-09T09:00:00.000Z'),
  mk('c', '2026-10-20', 900, 'Food', '2026-11-10T08:00:00.000Z'),
  mk('d', '2026-11-09', 120, 'Bills', '2026-11-09T11:00:00.000Z'),
];
const ids = (k: Parameters<typeof sortPayments>[1]) => sortPayments(list, k, ME).map((e) => e.id).join('');

test('the default order is the day paid, newest first, then newest logged', () => {
  assert.equal(DEFAULT_SORT, 'date-desc');
  assert.equal(ids('date-desc'), 'dbac');
});
test('every order, with ties broken newest day first', () => {
  assert.equal(ids('date-asc'), 'cabd');
  assert.equal(ids('amount-desc'), 'cadb');
  assert.equal(ids('amount-asc'), 'dbac');
  assert.equal(ids('category'), 'dbca'); // Bills, Food (b is the newer day), Food, Rent
  assert.equal(ids('added'), 'cdba');
});
test('sorting leaves the list it was given alone', () => {
  const before = list.map((e) => e.id).join('');
  sortPayments(list, 'amount-desc', ME);
  assert.equal(list.map((e) => e.id).join(''), before);
});
test('a stored value that is not an order is the default', () => {
  for (const k of SORT_KEYS) assert.equal(parseSortKey(k), k);
  for (const bad of [null, undefined, '', 'amount', 'DATE-DESC', 7, {}]) assert.equal(parseSortKey(bad), DEFAULT_SORT);
});

test('with no usable store the saved order reads as the default instead of throwing', async () => {
  const { loadPaymentSort } = await import('../../src/data/paymentSort.ts');
  assert.equal(loadPaymentSort(), DEFAULT_SORT); // no localStorage in the test runner
});

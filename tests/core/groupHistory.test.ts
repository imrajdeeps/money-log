import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expenseEffect } from '../../src/core/groupHistory.ts';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('someone else paid and you have a share: you owe your share', () => {
  assert.deepEqual(expenseEffect({ amount: 417, paid_by: A, shares: { [ME]: 208.5, [A]: 208.5 } }, ME), { side: 'owe', amount: 208.5 });
});

test('you paid: you are owed what the others owe, not the whole amount', () => {
  assert.deepEqual(expenseEffect({ amount: 900, paid_by: ME, shares: { [ME]: 300, [A]: 300, [B]: 300 } }, ME), { side: 'owed', amount: 600 });
  assert.deepEqual(expenseEffect({ amount: 100.1, paid_by: ME, shares: { [ME]: 33.37, [A]: 33.37, [B]: 33.36 } }, ME), { side: 'owed', amount: 66.73 }, 'to the paisa');
});

test('you paid only for yourself, or have no part in it: neither', () => {
  assert.deepEqual(expenseEffect({ amount: 500, paid_by: ME, shares: { [ME]: 500 } }, ME), { side: 'none', amount: 0 });
  assert.deepEqual(expenseEffect({ amount: 500, paid_by: A, shares: { [A]: 250, [B]: 250 } }, ME), { side: 'none', amount: 0 });
  assert.deepEqual(expenseEffect({ amount: 500, paid_by: A, shares: null }, ME), { side: 'none', amount: 0 });
  assert.deepEqual(expenseEffect({ amount: 500, paid_by: A, shares: { [ME]: 250, [A]: 250 } }, null), { side: 'none', amount: 0 });
});

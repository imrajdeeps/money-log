import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addWorthItem, checkInWorth, checkWorth, debtShare, editWorthItem, estimateLoan, isEstimated, movedUp, removeWorthItem, runwayMonths, snapshotWorth, usualMonthlySpend, valueNow, worthItems, worthMoves, worthSummary } from '../../src/core/worth.ts';
import type { WorthInput } from '../../src/core/worth.ts';
import { MAX_WORTH, cleanGoals, netUpdates } from '../../src/core/goals.ts';
import type { Goals, WorthItem } from '../../src/core/goals.ts';
import { makeEntry } from '../../src/core/logic.ts';
import { netNow } from '../../src/core/goals.ts';

const D1 = '2026-10-24';
const D2 = '2026-11-24';
const NOW = (d: string) => `${d}T10:00:00.000Z`;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = (over: Partial<WorthInput> = {}): WorthInput => ({ name: 'HDFC savings', side: 'a', cls: 'liquid', amount: '50000', emi: '', rate: '', ...over });
const add = (items: Goals, n: number, over: Partial<WorthInput> = {}, day = D1): Goals => {
  const r = addWorthItem(items, input(over), day, NOW(day), ID(n));
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.items;
};
const item = (items: Goals, n: number) => items[ID(n)] as WorthItem;

test('what is typed for an item is checked: a name, a kind that fits the side, an amount of zero or more, and loan-only EMI and rate', () => {
  const ok = checkWorth(input({ name: '  HDFC   savings ', amount: '1,25,000' }));
  assert.deepEqual(ok, { ok: true, name: 'HDFC savings', side: 'a', cls: 'liquid', amount: 125000, emi: 0, rate: 0 });
  assert.equal(checkWorth(input({ amount: '0' })).ok, true, 'an empty wallet is a fine amount');
  for (const bad of [{ name: ' ' }, { name: 'x'.repeat(41) }, { cls: 'loan' }, { side: 'd' as const, cls: 'liquid' }, { amount: '' }, { amount: 'abc' }, { amount: '-500' }, { amount: '(500)' }, { amount: '1.005' }]) {
    assert.equal(checkWorth(input(bad)).ok, false, JSON.stringify(bad));
  }
  const loan = checkWorth(input({ side: 'd', cls: 'loan', name: 'Home loan', amount: '2000000', emi: '18500', rate: '8.5' }));
  assert.deepEqual(loan, { ok: true, name: 'Home loan', side: 'd', cls: 'loan', amount: 2000000, emi: 18500, rate: 8.5 });
  assert.equal(checkWorth(input({ side: 'd', cls: 'loan', amount: '100', emi: '10', rate: '61' })).ok, false, 'a rate above 60');
  assert.equal(checkWorth(input({ side: 'd', cls: 'loan', amount: '100', emi: '10', rate: '8.555' })).ok, false, 'three decimals');
  assert.deepEqual(checkWorth(input({ amount: '100', emi: '500', rate: '9' })), { ok: true, name: 'HDFC savings', side: 'a', cls: 'liquid', amount: 100, emi: 0, rate: 0 }, 'an EMI on an asset is ignored');
});

test('a loan with an EMI and a rate pays itself down on paper: interest first, whole months only', () => {
  const loan = { a: 100000, d: '2026-10-24', e: 10000, r: 12 };
  assert.equal(estimateLoan(loan, '2026-10-24'), 100000, 'the same day: as typed');
  assert.equal(estimateLoan(loan, '2026-11-23'), 100000, 'not a whole month yet');
  assert.equal(estimateLoan(loan, '2026-11-24'), 91000, '1 month: interest 1,000, so 9,000 off');
  assert.equal(estimateLoan(loan, '2026-12-24'), 91000 - (10000 - 910), 'the second month: interest on 91,000 is 910');
  assert.equal(estimateLoan({ ...loan, e: 500 }, '2027-10-24'), 100000, 'an EMI that does not cover the interest does not reduce it');
  assert.equal(estimateLoan({ ...loan, a: 5000 }, '2027-10-24'), 0, 'never below zero');
  assert.equal(estimateLoan({ ...loan, r: 0 }, '2026-12-24'), 80000, 'no interest: the EMI is all principal');
  assert.equal(estimateLoan({ a: 100, d: '2026-01-31', e: 10, r: 0 }, '2026-02-28'), 100, 'the 31st to the 28th is not yet a month');
});

test('an item\'s value today is what was typed, or the estimate for a loan with an EMI', () => {
  let items = add({}, 1);
  items = add(items, 2, { side: 'd', cls: 'loan', name: 'Car loan', amount: '100000', emi: '10000', rate: '12' });
  items = add(items, 3, { side: 'd', cls: 'card', name: 'Card', amount: '20000' });
  assert.equal(valueNow(item(items, 1), D2), 50000);
  assert.equal(valueNow(item(items, 2), D2), 91000);
  assert.equal(isEstimated(item(items, 2), D2), true);
  assert.equal(isEstimated(item(items, 2), D1), false);
  assert.equal(isEstimated(item(items, 3), D2), false, 'a card has no EMI');
});

test('a check-in confirms every item for the day, and remembers the value before it for "what moved"', () => {
  let items = add({}, 1);
  items = add(items, 2, { name: 'Gold', cls: 'gold', amount: '300000' });
  const r = checkInWorth(items, { [ID(1)]: 62000, [ID(2)]: 300000 }, D2, NOW(D2));
  assert.deepEqual([item(r, 1).a, item(r, 1).p, item(r, 1).pd, item(r, 1).d], [62000, 50000, D1, D2]);
  assert.deepEqual([item(r, 2).a, item(r, 2).p, item(r, 2).d], [300000, 300000, D2], 'unchanged but confirmed');
  // a second save the same day replaces the value and keeps the memory from before today
  const again = checkInWorth(r, { [ID(1)]: 63000 }, D2, NOW(D2));
  assert.deepEqual([item(again, 1).a, item(again, 1).p, item(again, 1).pd], [63000, 50000, D1]);
  // bad values and unknown ids are ignored
  const junk = checkInWorth(items, { [ID(1)]: -5, [ID(9)]: 5, [ID(2)]: 1.005 }, D2, NOW(D2));
  assert.equal(junk[ID(1)], items[ID(1)]);
  assert.equal(junk[ID(2)], items[ID(2)]);
});

test('what moved: the biggest effect on net worth first (assets up or debts down raise it), and nothing for what did not move', () => {
  let items = add({}, 1, { name: 'Savings', amount: '50000' });
  items = add(items, 2, { name: 'Gold', cls: 'gold', amount: '300000' });
  items = add(items, 3, { name: 'Card', side: 'd', cls: 'card', amount: '20000' });
  items = add(items, 4, { name: 'Wallet', amount: '1000' });
  const r = checkInWorth(items, { [ID(1)]: 52000, [ID(2)]: 308000, [ID(3)]: 14000, [ID(4)]: 1000 }, D2, NOW(D2));
  assert.deepEqual(worthMoves(r, D2).map((m) => [m.name, m.change]), [['Gold', 8000], ['Card', 6000], ['Savings', 2000]]);
  assert.deepEqual(worthMoves(items, D2), [], 'nothing before a second check-in');
  assert.equal(worthMoves(r, D2, 1).length, 1);
  assert.deepEqual(worthMoves(r, D2).map((m) => [m.name, movedUp(m)]), [['Gold', true], ['Card', false], ['Savings', true]], 'a debt paid down moved down, though it raised net worth');
});

test('editing an item: the value, the kind, the loan details; the side cannot change; a removed item is gone', () => {
  let items = add({}, 1);
  const edited = editWorthItem(items, ID(1), input({ name: 'HDFC salary', amount: '70000' }), D2, NOW(D2));
  assert.ok(edited.ok);
  items = edited.items;
  assert.deepEqual([item(items, 1).n, item(items, 1).a, item(items, 1).p, item(items, 1).pd], ['HDFC salary', 70000, 50000, D1]);
  const renamed = editWorthItem(items, ID(1), input({ name: 'Renamed', amount: '70000' }), D2, NOW(D2));
  assert.ok(renamed.ok);
  assert.equal(item(renamed.items, 1).p, 50000, 'a rename alone is not a new value');
  assert.equal(editWorthItem(items, ID(1), input({ side: 'd', cls: 'card' }), D2, NOW(D2)).ok, false, 'owned to owed');
  assert.equal(editWorthItem(items, ID(1), input({ amount: 'x' }), D2, NOW(D2)).ok, false);
  const gone = removeWorthItem(items, ID(1), NOW(D2));
  assert.equal(worthItems(gone, D2).assets.length, 0);
  assert.equal(removeWorthItem(gone, ID(1), NOW(D2)), gone);
  assert.equal(editWorthItem(gone, ID(1), input(), D2, NOW(D2)).ok, false);
});

test('the picture: assets, debts, net, liquid money, kinds by size, and the automatic lines', () => {
  let items = add({}, 1, { name: 'Savings', amount: '50000' });
  items = add(items, 2, { name: 'FD', cls: 'invest', amount: '200000' });
  items = add(items, 3, { name: 'Home loan', side: 'd', cls: 'loan', amount: '1000000' });
  const plain = worthSummary(items, D1);
  assert.deepEqual([plain.assets, plain.debts, plain.net, plain.liquid], [250000, 1000000, -750000, 50000]);
  assert.deepEqual(plain.byClass.map((c) => [c.side, c.cls, c.amount]), [['d', 'loan', 1000000], ['a', 'invest', 200000], ['a', 'liquid', 50000]]);
  const auto = worthSummary(items, D1, [{ key: 'groups', label: 'Group balances', amount: 1200 }, { key: 'udhaar', label: 'Udhaar', amount: -300 }]);
  assert.deepEqual([auto.assets, auto.debts, auto.net, auto.liquid], [251200, 1000300, -749100, 50000]);
  assert.equal(worthSummary({}, D1).net, 0);
});

test('runway and debt share, and what a usual month is', () => {
  assert.equal(runwayMonths(50000, 20000), 2.5);
  assert.equal(runwayMonths(50000, 30000), 1.6, 'rounded down, never flattering');
  assert.equal(runwayMonths(50000, 0), null);
  assert.equal(debtShare(250000, 100000), 0.4);
  assert.equal(debtShare(0, 100), null);
  const spend = (amount: number, date: string) => makeEntry({ amount, category: 'Rent', date, method: null, note: '' }, `${date}T00:00:00.000Z`);
  const groupOf = () => 'Spending' as const;
  // October 12,000 and September 18,000 (August nothing): a usual month is 15,000; this month does not count
  assert.equal(usualMonthlySpend([spend(12000, '2026-10-05'), spend(18000, '2026-09-05'), spend(99999, '2026-11-05')], groupOf, D2), 15000);
  assert.equal(usualMonthlySpend([], groupOf, D2), 0);
});

test('the history: a save writes today\'s snapshot, and another save the same day replaces it', () => {
  let items = add({}, 1);
  items = snapshotWorth(items, 50000, D1, NOW(D1));
  assert.deepEqual(netUpdates(items).map((u) => [u.d, u.a]), [[D1, 50000]]);
  items = snapshotWorth(items, 51000, D1, '2026-10-24T11:00:00.000Z');
  assert.deepEqual(netUpdates(items).map((u) => [u.d, u.a]), [[D1, 51000]], 'the same day: one point');
  items = snapshotWorth(items, 60000, D2, NOW(D2));
  assert.deepEqual(netUpdates(items).map((u) => [u.d, u.a]), [[D2, 60000], [D1, 51000]]);
  assert.deepEqual([netNow(items)!.value, netNow(items)!.change], [60000, 9000]);
});

test('items survive the check on what comes from the server or a backup, and damaged ones are dropped', () => {
  let items = add({}, 1);
  items = add(items, 2, { side: 'd', cls: 'loan', name: 'Home loan', amount: '1000000', emi: '18500', rate: '8.5' });
  items = checkInWorth(items, { [ID(1)]: 52000 }, D2, NOW(D2));
  assert.deepEqual(cleanGoals(JSON.parse(JSON.stringify(items))), items);
  const good = items[ID(2)] as unknown as Record<string, unknown>;
  const bad = (over: Record<string, unknown>) => cleanGoals({ [ID(2)]: { ...good, ...over } });
  for (const over of [{ a: -1 }, { a: 1.005 }, { s: 'x' }, { c: 'liquid' }, { n: '' }, { d: '2026-02-30' }, { p: -5 }, { pd: 'soon' }, { e: -1 }, { r: 61 }, { r: 8.555 }, { x: 2 }]) {
    assert.deepEqual(bad(over), {}, JSON.stringify(over));
  }
  assert.deepEqual(cleanGoals({ [ID(1)]: { ...(items[ID(1)] as object), e: 5 } }), {}, 'an EMI on something owned');
});

test('there is a cap on how many items one account keeps', () => {
  const full: Goals = {};
  for (let i = 0; i < MAX_WORTH; i++) full[ID(i + 1)] = { id: ID(i + 1), k: 'w', n: 'x', s: 'a', c: 'liquid', a: 1, d: D1, p: null, pd: '', e: 0, r: 0, x: 0, t: NOW(D1) };
  assert.equal(addWorthItem(full, input(), D2, NOW(D2), ID(9999)).ok, false);
});

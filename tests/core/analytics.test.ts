import test from 'node:test';
import assert from 'node:assert/strict';
import { averageOf, cumulativeByDay, biggestPayments, categoryTrends, groupLookup, groupShares, monthlyTotals, monthsEnding, pctChange, projectedMonthEnd, weekdaySpend } from '../../src/core/analytics.ts';
import type { Entry } from '../../src/core/logic.ts';

const mk = (date: string, category: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `${date}-${category}-${amount}`, owner_id: 'u', entry_date: date, category, amount, note: '', method: null, created_at: date, updated_at: date,
  deleted_at: null, exported_at: null, group_id: null, paid_by: null, shares: null, share_of: null, dirty: 0, ...extra,
});
const groupOf = groupLookup([{ name: 'Groceries', group: 'Spending' }, { name: 'Rent', group: 'Family' }, { name: 'Savings', group: 'Saving' }, { name: 'Bike EMI', group: 'EMI' }]);

test('the months of a range end at the given month, oldest first, across a year end', () => {
  assert.deepEqual(monthsEnding('2026-11', 3), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(monthsEnding('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthsEnding('2026-11', 1), ['2026-11']);
});

test('a category the list does not know counts as Spending, whatever its spelling', () => {
  assert.equal(groupOf('groceries'), 'Spending');
  assert.equal(groupOf(' RENT '), 'Family');
  assert.equal(groupOf('Mystery'), 'Spending');
});

test('monthly totals keep spending and saving apart and skip deleted payments and other months', () => {
  const months = ['2026-09', '2026-10', '2026-11'];
  const rows = monthlyTotals([
    mk('2026-09-03', 'Groceries', 100), mk('2026-09-10', 'Savings', 500), mk('2026-10-01', 'Rent', 9000), mk('2026-10-02', 'Groceries', 50.5),
    mk('2026-10-03', 'Groceries', 70, { deleted_at: '2026-10-04' }), mk('2026-08-31', 'Groceries', 999), mk('2026-12-01', 'Groceries', 999),
  ], groupOf, months);
  assert.deepEqual(rows, [{ month: '2026-09', spent: 100, saved: 500 }, { month: '2026-10', spent: 9050.5, saved: 0 }, { month: '2026-11', spent: 0, saved: 0 }]);
});

test('averages and changes', () => {
  assert.equal(averageOf([]), 0);
  assert.equal(averageOf([100, 200, 301]), 200.33);
  assert.equal(pctChange(150, 100), 0.5);
  assert.equal(pctChange(50, 100), -0.5);
  assert.equal(pctChange(10, 0), null, 'nothing to compare with');
});

test('category trends rank by the whole range, leave Saving out, and compare the last month with the one before', () => {
  const months = monthsEnding('2026-11', 3);
  const t = categoryTrends([
    mk('2026-09-05', 'Groceries', 100), mk('2026-10-05', 'Groceries', 100), mk('2026-11-05', 'groceries', 150),
    mk('2026-10-06', 'Rent', 9000), mk('2026-11-06', 'Rent', 9000), mk('2026-11-07', 'Savings', 5000), mk('2026-11-08', 'Bike EMI', 20),
  ], groupOf, months);
  assert.deepEqual(t.map((x) => x.category), ['Rent', 'Groceries', 'Bike EMI']);
  const g = t.find((x) => x.category === 'Groceries')!;
  assert.deepEqual(g.values, [100, 100, 150]);
  assert.equal(g.total, 350);
  assert.equal(g.change, 0.5);
  assert.equal(t.find((x) => x.category === 'Bike EMI')!.change, null, 'nothing last month');
  assert.equal(categoryTrends([], groupOf, months).length, 0);
  assert.equal(categoryTrends([mk('2026-11-01', 'A', 1), mk('2026-11-01', 'B', 2), mk('2026-11-01', 'C', 3)], groupOf, months, 2).length, 2, 'the limit');
});

test('weekday spending averages over every day of that name in the window, spending or not', () => {
  // 2026-11-11 is a Wednesday; a 14-day window ending then has each weekday exactly twice
  const stats = weekdaySpend([mk('2026-11-11', 'Groceries', 100), mk('2026-11-04', 'Groceries', 50), mk('2026-11-09', 'Savings', 999), mk('2026-10-20', 'Groceries', 999)], groupOf, '2026-11-11', 14);
  const wed = stats.find((s) => s.weekday === 2)!;
  assert.equal(wed.total, 150);
  assert.equal(wed.average, 75);
  assert.equal(stats.find((s) => s.weekday === 0)!.total, 0, 'the Saving payment on Monday and the payment before the window do not count');
  assert.equal(stats.length, 7);
});

test('the biggest payments of a month, largest first, Saving left out', () => {
  const b = biggestPayments([mk('2026-11-01', 'Groceries', 10), mk('2026-11-02', 'Rent', 9000), mk('2026-11-03', 'Savings', 50000), mk('2026-10-03', 'Rent', 99999), mk('2026-11-04', 'Groceries', 300), mk('2026-11-05', 'Groceries', 20, { deleted_at: 'x' })], groupOf, '2026-11', 2);
  assert.deepEqual(b.map((e) => e.amount), [9000, 300]);
});

test('the projection needs three days and then carries the pace to the end of the month', () => {
  assert.equal(projectedMonthEnd([10, 20], '2026-11'), null);
  assert.equal(projectedMonthEnd([100, 200, 300], '2026-11'), 3000, '300 in 3 days, 30 days in November');
  const whole = Array.from({ length: 30 }, (_, i) => (i + 1) * 10);
  assert.equal(projectedMonthEnd(whole, '2026-11'), 300, 'a finished month is what it was');
});

test('with last month known, the projection follows last month\'s shape (rent comes first)', () => {
  const lastMonth = [9000, 9000, 9100, ...Array.from({ length: 27 }, (_, i) => 9100 + (i + 1) * 100)]; // 9,000 on day 1, then about 100 a day
  const lastEnd = lastMonth[lastMonth.length - 1]!;
  const so = [9000, 9000, 9100];
  assert.equal(projectedMonthEnd(so, '2026-11', lastMonth), Math.round((9100 * (lastEnd / 9100)) * 100) / 100);
  assert.ok(projectedMonthEnd(so, '2026-11', lastMonth)! < projectedMonthEnd(so, '2026-11')!, 'less than carrying the early rent on at the same pace');
  assert.equal(projectedMonthEnd(so, '2026-11', []), 91000, 'no last month: the straight pace');
  assert.equal(projectedMonthEnd(so, '2026-11', Array(30).fill(0)), 91000, 'a last month with nothing in it is no guide');
});

test('group shares add up to one and leave Saving out', () => {
  const s = groupShares([mk('2026-11-01', 'Groceries', 100), mk('2026-11-02', 'Rent', 300), mk('2026-11-03', 'Savings', 5000), mk('2026-10-03', 'Rent', 1)], groupOf, '2026-11');
  assert.deepEqual(s.map((x) => [x.group, x.total, x.share]), [['Family', 300, 0.75], ['Spending', 100, 0.25]]);
  assert.deepEqual(groupShares([], groupOf, '2026-11'), []);
});

test('spending by the end of each day builds up, leaves Saving out, and stops at the day asked for', () => {
  const e = [mk('2026-11-01', 'Groceries', 10), mk('2026-11-03', 'Rent', 100), mk('2026-11-03', 'Savings', 5000), mk('2026-11-05', 'Groceries', 1), mk('2026-10-31', 'Groceries', 999), mk('2026-11-02', 'Groceries', 7, { deleted_at: 'x' })];
  assert.deepEqual(cumulativeByDay(e, groupOf, '2026-11', 4), [10, 10, 110, 110]);
  assert.deepEqual(cumulativeByDay(e, groupOf, '2026-11', 0), []);
  assert.equal(cumulativeByDay(e, groupOf, '2026-11', 99).length, 30, 'never past the end of the month');
});

test('with sameDays the last month is compared by the same days of the month before, not the whole of it', () => {
  const months = monthsEnding('2026-11', 2);
  const e = [mk('2026-10-02', 'Groceries', 100), mk('2026-10-20', 'Groceries', 900), mk('2026-11-05', 'Groceries', 150)];
  const whole = categoryTrends(e, groupOf, months)[0]!;
  assert.equal(whole.lastMonth, 1000);
  assert.equal(whole.change, -0.85);
  const same = categoryTrends(e, groupOf, months, 8, 10)[0]!;
  assert.equal(same.lastMonth, 100, 'only October 2nd is within the first 10 days');
  assert.equal(same.change, 0.5);
});

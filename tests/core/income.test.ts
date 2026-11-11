import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INCOME_BUILTIN, addIncomeCategory, biggestOutflows, cashFlow, cashFlowSeries, incomeCategories, isOwnIncomeCategory, removeIncomeCategory } from '../../src/core/income.ts';
import { biggestPayments, cumulativeByDay, categoryTrends, groupLookup, groupShares, monthlyTotals, weekdaySpend } from '../../src/core/analytics.ts';
import { MAX_INCOME_CATS, cleanGoals, goalProgress, incomeCatId, mergeGoals, sameGoals } from '../../src/core/goals.ts';
import type { Goal, Goals } from '../../src/core/goals.ts';
import { budgetEntries, cleanEntry, editEntry, frequentCategories, incomeEntries, isIncome, makeEntry, restoreEntry, summarizeMonth } from '../../src/core/logic.ts';
import type { Entry } from '../../src/core/logic.ts';
import { toRow } from '../../src/data/syncRows.ts';
import { filterPayments, NO_FILTER, totalReceived, totalShare } from '../../src/features/payments/payments.ts';
import { makeBackup, parseBackup } from '../../src/data/backup.ts';

const ME = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const GROUP = '00000000-0000-4000-8000-0000000000c3';
const NOW = '2026-11-10T10:00:00.000Z';
let n = 0;
const uid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const mk = (date: string, category: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: uid(), owner_id: ME, entry_date: date, kind: 'out', category, amount, note: '', method: null, created_at: `${date}T08:00:00.000Z`, updated_at: `${date}T08:00:00.000Z`,
  deleted_at: null, exported_at: null, group_id: null, paid_by: null, shares: null, share_of: null, dirty: 0, ...extra,
});
const inc = (date: string, category: string, amount: number, extra: Partial<Entry> = {}): Entry => mk(date, category, amount, { kind: 'in', ...extra });
const groupOf = groupLookup([{ name: 'Groceries', group: 'Spending' }, { name: 'Rent', group: 'Family' }, { name: 'Savings', group: 'Saving' }, { name: 'Bike EMI', group: 'EMI' }]);

// ---------------------------------------------------------------- the kind of an entry
test('a new entry is spending unless it is made as income', () => {
  const out = makeEntry({ amount: 5, category: 'Groceries', method: null, note: '', date: '2026-11-10' }, NOW);
  const money = makeEntry({ amount: 5, category: 'Salary', method: null, note: '', date: '2026-11-10', kind: 'in' }, NOW);
  assert.equal(out.kind, 'out');
  assert.equal(money.kind, 'in');
  assert.ok(isIncome(money) && !isIncome(out));
  assert.ok(!isIncome({ kind: undefined as unknown as 'out' }), 'an entry saved before 1.26 has no kind and is spending');
});

test('an entry can be switched between spent and received, and undo puts the kind back', () => {
  const e = mk('2026-11-10', 'Groceries', 40);
  const switched = editEntry(e, { kind: 'in', category: 'Refund' }, NOW);
  assert.equal(switched.kind, 'in');
  assert.equal(switched.category, 'Refund');
  const back = restoreEntry(switched, e, '2026-11-10T10:05:00.000Z');
  assert.equal(back.kind, 'out');
  assert.equal(back.category, 'Groceries');
  const legacy = { ...e } as Partial<Entry>;
  delete legacy.kind;
  assert.equal(restoreEntry(switched, legacy as Entry, '2026-11-10T10:05:00.000Z').kind, 'out', 'a legacy entry restores as spending');
});

test('what arrives from outside: a missing or unknown kind is spending, income is kept, income in a group is refused', () => {
  const base = { id: uid(), owner_id: ME, entry_date: '2026-11-10', category: 'Salary', amount: 100, note: '', method: null, created_at: NOW, updated_at: NOW };
  assert.equal(cleanEntry(base)?.kind, 'out');
  assert.equal(cleanEntry({ ...base, kind: 'sideways' })?.kind, 'out');
  assert.equal(cleanEntry({ ...base, kind: 'in' })?.kind, 'in');
  const shared = { ...base, kind: 'in', group_id: GROUP, paid_by: ME, shares: { [ME]: 100 } };
  assert.equal(cleanEntry(shared), null, 'income cannot belong to a group');
  assert.equal(cleanEntry({ ...base, kind: 'in', share_of: uid() }), null, 'income cannot record a share of a shared expense');
  assert.equal(cleanEntry({ ...shared, kind: 'out' })?.kind, 'out', 'the same shared row as spending is fine');
});

test('the cloud row carries kind only for income, so spending keeps syncing before the database has the column', () => {
  assert.equal('kind' in toRow(mk('2026-11-10', 'Groceries', 5), ME), false);
  assert.equal(toRow(inc('2026-11-10', 'Salary', 5), ME).kind, 'in');
});

test('a backup keeps the kind, and an older backup without it reads as spending', () => {
  const income = inc('2026-11-10', 'Salary', 52000);
  const spend = mk('2026-11-10', 'Groceries', 40);
  const text = JSON.stringify(makeBackup([income, spend], NOW));
  const parsed = parseBackup(text);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.entries.map((e) => e.kind).sort(), ['in', 'out']);
  const old = JSON.parse(text);
  for (const e of old.entries) delete e.kind;
  const again = parseBackup(JSON.stringify(old));
  assert.ok(again.ok);
  assert.ok(again.entries.every((e) => e.kind === 'out'));
});

// ---------------------------------------------------------------- income never reaches a total of spending
test('budgetEntries leaves income out, and incomeEntries holds only the account\'s own live income', () => {
  const list = [mk('2026-11-02', 'Groceries', 100), inc('2026-11-03', 'Salary', 50000), inc('2026-11-04', 'Refund', 200, { deleted_at: '2026-11-05' }), inc('2026-11-05', 'Cashback', 30, { owner_id: OTHER })];
  assert.deepEqual(budgetEntries(list, ME).map((e) => e.category), ['Groceries']);
  assert.deepEqual(incomeEntries(list, ME).map((e) => e.category), ['Salary']);
});

test('adding income changes no figure that was there: month, insights, goals, trends, shares', () => {
  const spending = [
    mk('2026-10-03', 'Groceries', 100), mk('2026-10-10', 'Savings', 500), mk('2026-11-01', 'Rent', 9000), mk('2026-11-02', 'Groceries', 50.5),
    mk('2026-11-03', 'Bike EMI', 2000), mk('2026-11-04', 'Savings', 700),
  ];
  const income = [inc('2026-10-01', 'Salary', 60000), inc('2026-11-01', 'Salary', 60000), inc('2026-11-03', 'Groceries', 999), inc('2026-11-04', 'Savings', 888)];
  const months = ['2026-10', '2026-11'];
  const goal: Goal = { id: uid(), k: 'g', n: 'Fund', a: 5000, d: '2027-06-30', s: 0, c: 'Savings', b: '2026-10-01', x: 0, t: NOW };
  const figures = (list: Entry[]) => {
    const e = budgetEntries(list, ME);
    return {
      month: summarizeMonth(e, null, '2026-11'),
      totals: monthlyTotals(e, groupOf, months),
      trends: categoryTrends(e, groupOf, months),
      weekdays: weekdaySpend(e, groupOf, '2026-11-10', 90),
      biggest: biggestPayments(e, groupOf, '2026-11', 5),
      shares: groupShares(e, groupOf, '2026-11'),
      daily: cumulativeByDay(e, groupOf, '2026-11', 10),
      goal: goalProgress(goal, { [goal.id]: goal }, e),
      frequent: frequentCategories(list, Date.parse('2026-11-10T12:00:00Z'), 12),
    };
  };
  assert.deepEqual(figures([...spending, ...income]), figures(spending));
});

test('a shared expense counts at the account\'s share in the cash flow, and income is never shared', () => {
  const shared = mk('2026-11-05', 'Groceries', 900, { group_id: GROUP, paid_by: OTHER, shares: { [ME]: 300, [OTHER]: 600 }, owner_id: OTHER });
  const f = cashFlow([shared, inc('2026-11-01', 'Salary', 1000)], ME, groupOf, '2026-11');
  assert.equal(f.out, 0, 'an expense someone else made is not in this account\'s own entries');
  const mine = mk('2026-11-05', 'Groceries', 900, { group_id: GROUP, paid_by: ME, shares: { [ME]: 300, [OTHER]: 600 } });
  assert.equal(cashFlow([mine], ME, groupOf, '2026-11').out, 300);
});

// ---------------------------------------------------------------- the cash flow
test('in, out, left, saved and the share kept', () => {
  const f = cashFlow([
    inc('2026-11-01', 'Salary', 60000), inc('2026-11-12', 'Cashback', 250.5), inc('2026-11-20', 'salary', 1000),
    mk('2026-11-02', 'Rent', 9000), mk('2026-11-03', 'Groceries', 1500.25), mk('2026-11-04', 'Savings', 5000),
    inc('2026-10-31', 'Salary', 777), mk('2026-12-01', 'Groceries', 123), mk('2026-11-06', 'Groceries', 40, { deleted_at: '2026-11-07' }),
  ], ME, groupOf, '2026-11');
  assert.equal(f.income, 61250.5);
  assert.equal(f.out, 10500.25, 'savings are not spending');
  assert.equal(f.left, 50750.25);
  assert.equal(f.saved, 5000);
  assert.ok(f.kept !== null && Math.abs(f.kept - 50750.25 / 61250.5) < 1e-9);
  assert.deepEqual(f.incomeBy, [{ category: 'Salary', amount: 61000 }, { category: 'Cashback', amount: 250.5 }], 'by category, spelling of the first, largest first');
});

test('with no income there is no share kept, and more out than in leaves less than zero', () => {
  const none = cashFlow([mk('2026-11-02', 'Groceries', 100)], ME, groupOf, '2026-11');
  assert.equal(none.income, 0);
  assert.equal(none.kept, null);
  assert.equal(none.left, -100);
  const over = cashFlow([inc('2026-11-01', 'Refund', 50), mk('2026-11-02', 'Groceries', 120.4)], ME, groupOf, '2026-11');
  assert.equal(over.left, -70.4);
  assert.ok(over.kept !== null && over.kept < 0);
  const empty = cashFlow([], ME, groupOf, '2026-11');
  assert.deepEqual([empty.income, empty.out, empty.left, empty.saved, empty.kept, empty.incomeBy], [0, 0, 0, 0, null, []]);
});

test('six months side by side, and the biggest payments leave income and savings out', () => {
  const list = [inc('2026-10-01', 'Salary', 100), mk('2026-10-02', 'Groceries', 40), inc('2026-11-01', 'Salary', 120), mk('2026-11-02', 'Rent', 60), mk('2026-11-03', 'Savings', 900), mk('2026-11-04', 'Groceries', 70)];
  assert.deepEqual(cashFlowSeries(list, ME, groupOf, ['2026-09', '2026-10', '2026-11']), [
    { month: '2026-09', income: 0, out: 0 }, { month: '2026-10', income: 100, out: 40 }, { month: '2026-11', income: 120, out: 130 },
  ]);
  assert.deepEqual(biggestOutflows(list, ME, groupOf, '2026-11').map((e) => e.category), ['Groceries', 'Rent']);
});

// ---------------------------------------------------------------- categories
test('the built-in income categories, and the ones the person adds', () => {
  assert.equal(INCOME_BUILTIN.length, 9);
  assert.deepEqual(incomeCategories({}), [...INCOME_BUILTIN]);
  const r = addIncomeCategory({}, '  Pocket   money ', NOW);
  assert.ok(r.ok);
  assert.equal(r.name, 'Pocket money');
  assert.deepEqual(incomeCategories(r.items).slice(-1), ['Pocket money']);
  assert.ok(isOwnIncomeCategory(r.items, 'pocket money'));
  const again = addIncomeCategory(r.items, 'POCKET MONEY', NOW);
  assert.ok(again.ok && again.items === r.items && again.name === 'Pocket money', 'the same name is not added twice');
  const builtin = addIncomeCategory({}, 'salary', NOW);
  assert.ok(builtin.ok && builtin.name === 'Salary' && Object.keys(builtin.items).length === 0, 'a built-in name just picks the built-in');
});

test('an income category name is checked, can be removed and comes back, and only so many are kept', () => {
  assert.equal(addIncomeCategory({}, '   ', NOW).ok, false);
  assert.equal(addIncomeCategory({}, 'x'.repeat(61), NOW).ok, false);
  const r = addIncomeCategory({}, 'Bonus', NOW);
  assert.ok(r.ok);
  const removed = removeIncomeCategory(r.items, 'Bonus', '2026-11-10T11:00:00.000Z');
  assert.deepEqual(incomeCategories(removed), [...INCOME_BUILTIN]);
  assert.equal(removeIncomeCategory(removed, 'Bonus', NOW), removed, 'removing twice changes nothing');
  assert.equal(removeIncomeCategory({}, 'Salary', NOW) instanceof Object, true);
  const back = addIncomeCategory(removed, 'Bonus', '2026-11-10T12:00:00.000Z');
  assert.ok(back.ok);
  assert.ok(incomeCategories(back.items).includes('Bonus'));
  let items: Goals = {};
  for (let i = 0; i < MAX_INCOME_CATS; i++) {
    const a = addIncomeCategory(items, `Own ${i}`, NOW);
    assert.ok(a.ok);
    items = a.items;
  }
  assert.equal(addIncomeCategory(items, 'One too many', NOW).ok, false);
});

test('income categories sync and are backed up with the goals: kept when valid, merged by latest change, dropped when the id does not match the name', () => {
  const a = addIncomeCategory({}, 'Bonus', NOW);
  assert.ok(a.ok);
  assert.deepEqual(cleanGoals(JSON.parse(JSON.stringify(a.items))), a.items);
  const id = incomeCatId('Bonus');
  assert.deepEqual(cleanGoals({ [id]: { ...a.items[id], n: 'Other name' } }), {}, 'the id comes from the name');
  assert.deepEqual(cleanGoals({ [id]: { ...a.items[id], n: ' Bonus ' } }), {}, 'a name that is not tidy is dropped');
  const removedLater = removeIncomeCategory(a.items, 'Bonus', '2026-11-10T11:00:00.000Z');
  const merged = mergeGoals(a.items, removedLater);
  assert.equal((merged[id] as { x: number }).x, 1, 'the later change wins');
  assert.ok(sameGoals(merged, removedLater));
  assert.ok(!sameGoals(a.items, removedLater));
});

// ---------------------------------------------------------------- the payments list
test('the payments list adds up what went out and what came in apart', () => {
  const list = [mk('2026-11-02', 'Groceries', 100), mk('2026-11-03', 'Rent', 900), inc('2026-11-04', 'Salary', 5000), inc('2026-11-05', 'Refund', 250.5)];
  assert.equal(totalShare(list, ME), 1000);
  assert.equal(totalReceived(list), 5250.5);
  assert.deepEqual(filterPayments(list, { ...NO_FILTER, category: 'salary' }, ME).map((e) => e.category), ['Salary'], 'income is found by category like anything else');
});

test('frequent categories are per kind', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const list = [mk('2026-11-02', 'Groceries', 1), mk('2026-11-03', 'Groceries', 1), inc('2026-11-04', 'Salary', 1), inc('2026-11-05', 'Refund', 1), inc('2026-11-06', 'Refund', 1)];
  assert.deepEqual(frequentCategories(list, now, 6), ['Groceries']);
  assert.deepEqual(frequentCategories(list, now, 6, 90, 'in'), ['Refund', 'Salary']);
});

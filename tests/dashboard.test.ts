import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysInMonth, dueOverview, exportOverview, groupsOverview, headlineNet, monthOverview, overviewGroups, spentByDay, topCategories } from '../src/dashboard.ts';
import { NO_FILTER, filterPayments, isFiltered, paymentCategories, paymentMonths, totalShare } from '../src/payments.ts';
import { dueKey } from '../src/blocks.ts';
import type { DueBlock } from '../src/blocks.ts';
import { planForMonth, setBudget, categoryList } from '../src/categories.ts';
import type { Mine } from '../src/categories.ts';
import { makeEntry, markExportedEntry, softDelete, summarizeMonth } from '../src/logic.ts';
import type { Entry } from '../src/logic.ts';
import type { Settlement } from '../src/groups.ts';

const T0 = '2026-11-10T10:00:00.000Z';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = U(1);
const OTHER = U(2);
const mk = (amount: number, category: string, date: string, over: Partial<Entry> = {}): Entry =>
  ({ ...makeEntry({ amount, category, method: null, note: '', date }, T0), ...over });

// Budgets set in the app: Rent 20,000 (Spending), Loan EMI 10,000, Savings 5,000.
function mineWithBudgets(): Mine {
  let m: Mine = {};
  for (const [name, amount] of [['Rent', 20000], ['Loan EMI', 10000], ['Savings', 5000]] as const) {
    const info = categoryList(null, m).find((c) => c.name === name)!;
    m = setBudget(m, info, amount, T0);
  }
  return m;
}

test('daysInMonth knows month lengths and leap years', () => {
  assert.equal(daysInMonth('2026-11'), 30);
  assert.equal(daysInMonth('2026-12'), 31);
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(daysInMonth('2026-02'), 28);
});

test('spentByDay adds up each day, leaves Saving out and ignores other months', () => {
  const plan = planForMonth(null, {}, '2026-11');
  const entries = [mk(100, 'Groceries', '2026-11-01'), mk(50, 'Groceries', '2026-11-01'), mk(300, 'Rent', '2026-11-03'), mk(999, 'Savings', '2026-11-02'), mk(7, 'Rent', '2026-10-31')];
  const d = spentByDay(entries, '2026-11', plan);
  assert.equal(d.length, 30);
  assert.deepEqual(d.slice(0, 4), [150, 150, 450, 450]);
  assert.equal(d[29], 450);
});

test('monthOverview: spending without Saving, the budget of Spending, EMI and Family, and the change against last month by the same day', () => {
  const mine = mineWithBudgets();
  const entries = [
    mk(1000, 'Groceries', '2026-11-02'),
    mk(500, 'Eating out', '2026-11-09'),
    mk(4000, 'Savings', '2026-11-05'),
    mk(9999, 'Groceries', '2026-11-25'), // later in the month than "today": not in the comparison so far
    mk(800, 'Groceries', '2026-10-03'),
    mk(400, 'Groceries', '2026-10-10'), // after the 9th: not part of last month "by the same day"
    softDelete(mk(5000, 'Rent', '2026-11-01'), T0),
  ];
  const o = monthOverview(entries, ME, planForMonth(null, mine, '2026-11'), planForMonth(null, mine, '2026-10'), '2026-11-09');
  assert.equal(o.month, '2026-11');
  assert.equal(o.day, 9);
  assert.equal(o.days, 30);
  assert.equal(o.spent, 11499); // 1,000 + 500 + 9,999; the savings and the deleted rent do not count
  assert.equal(o.budget, 30000); // Rent and Loan EMI; Savings is not spending
  assert.equal(o.budgeted, true);
  assert.equal(o.daily.length, 9);
  assert.equal(o.daily[8], 1500);
  assert.equal(o.lastToDate, 800);
  assert.equal(o.change, (1500 - 800) / 800);
  assert.equal(o.lastDaily.length, 31);
  assert.equal(o.lastDaily[30], 1200);
});

test('monthOverview: shared expenses count at my share, and there is no change to show without both months', () => {
  const shared = mk(900, 'Groceries', '2026-11-02', { group_id: U(9), paid_by: OTHER, shares: { [ME]: 300, [OTHER]: 600 } });
  const theirs = mk(700, 'Groceries', '2026-11-02', { owner_id: OTHER });
  const plan = planForMonth(null, {}, '2026-11');
  const o = monthOverview([shared, theirs], ME, plan, planForMonth(null, {}, '2026-10'), '2026-11-05');
  assert.equal(o.spent, 300);
  assert.equal(o.budgeted, false);
  assert.equal(o.budget, 0);
  assert.equal(o.change, null, 'nothing last month');
  const quiet = monthOverview([mk(100, 'Groceries', '2026-10-01')], ME, plan, planForMonth(null, {}, '2026-10'), '2026-11-05');
  assert.equal(quiet.change, null, 'nothing yet this month');
});

test('monthOverview on the 31st compares with the last day of a shorter month', () => {
  const plan = planForMonth(null, {}, '2026-12');
  const o = monthOverview([mk(100, 'Groceries', '2026-12-31'), mk(50, 'Groceries', '2026-11-30')], ME, plan, planForMonth(null, {}, '2026-11'), '2026-12-31');
  assert.equal(o.lastToDate, 50);
  assert.equal(o.change, 1);
});

test('topCategories: biggest first, Saving left out, unknown names kept, the rest added up', () => {
  const plan = planForMonth(null, {}, '2026-11');
  const s = summarizeMonth([
    mk(500, 'Groceries', '2026-11-01'), mk(300, 'Rent', '2026-11-01'), mk(100, 'Transport & fuel', '2026-11-01'),
    mk(60, 'Health', '2026-11-01'), mk(40, 'Bills', '2026-11-01'), mk(1000, 'Savings', '2026-11-01'), mk(200, 'Dog  walker', '2026-11-01'),
  ], plan, '2026-11');
  const t = topCategories(s, 3);
  assert.equal(t.total, 1200);
  assert.deepEqual(t.top.map((x) => x.category), ['Groceries', 'Rent', 'Dog walker']);
  assert.equal(t.top[0]!.share, 500 / 1200);
  assert.deepEqual(t.rest, { count: 3, spent: 200, share: 200 / 1200 });
  const empty = topCategories(summarizeMonth([], plan, '2026-11'));
  assert.deepEqual(empty, { top: [], rest: { count: 0, spent: 0, share: 0 }, total: 0 });
});

test('dueOverview counts overdue and open items and lists the next ones', () => {
  assert.equal(dueOverview(null, {}, '2026-11-09'), null);
  const item = (title: string, due: string | null, done = false) => ({ k: dueKey('todo', title, due), kind: 'todo' as const, title, due, amount: null, done });
  const block: DueBlock = {
    v: 1,
    items: [item('Later', '2026-12-20'), item('Late', '2026-11-01'), item('Finished', '2026-11-05', true), item('Soon', '2026-11-12'), item('Undated', null)],
    importedAt: '2026-11-01T00:00:00.000Z',
    dirty: 0,
  };
  const o = dueOverview(block, {}, '2026-11-09')!;
  assert.equal(o.overdue, 1);
  assert.equal(o.open, 4);
  assert.deepEqual(o.next.map((v) => v.title), ['Late', 'Soon']);
  const ticked = dueOverview(block, { [block.items[1]!.k]: { d: 1, t: '2026-11-08T00:00:00.000Z' } }, '2026-11-09')!;
  assert.equal(ticked.overdue, 0);
});

test('groupsOverview adds up what I am owed and what I owe across groups', () => {
  const G1 = U(11);
  const G2 = U(12);
  const groups = [G1, G2].map((id) => ({ id, name: id, kind: 'trip' as const, created_at: T0 }));
  const entries = [
    mk(1000, 'Eating out', '2026-11-01', { group_id: G1, paid_by: ME, shares: { [ME]: 500, [OTHER]: 500 } }),
    mk(300, 'Eating out', '2026-11-01', { group_id: G2, paid_by: OTHER, shares: { [ME]: 150, [OTHER]: 150 } }),
  ];
  assert.deepEqual(groupsOverview(groups, entries, [], ME), { owed: 500, owe: 150 });
  const settle: Settlement = { id: U(20), group_id: G2, from_user: ME, to_user: OTHER, amount: 150, settle_date: '2026-11-02', created_by: ME, created_at: T0, updated_at: T0, deleted_at: null, dirty: 0 };
  assert.deepEqual(groupsOverview(groups, entries, [settle], ME), { owed: 500, owe: 0 });
  assert.deepEqual(groupsOverview(groups, entries, [], null), { owed: 0, owe: 0 });
});

test('headlineNet leads with the net worth line and the first percentage', () => {
  const items = [
    { label: 'Long-term target', value: 5000000, unit: '₹' as const },
    { label: 'Net worth now (net of debt)', value: 450000, unit: '₹' as const },
    { label: 'Progress to the long-term target', value: 9, unit: '%' as const },
  ];
  assert.equal(headlineNet(items).main?.value, 450000);
  assert.equal(headlineNet(items).goal?.value, 9);
  assert.equal(headlineNet(items.slice(0, 1)).main?.label, 'Long-term target', 'falls back to the first rupee line');
  assert.deepEqual(headlineNet([{ label: 'Years', value: 3, unit: 'years' }]), { main: null, goal: null });
});

test('exportOverview counts what the Export screen offers', () => {
  const a = mk(100, 'Rent', '2026-11-01');
  const b = markExportedEntry(mk(200, 'Rent', '2026-11-02'), T0);
  const changed = { ...b, amount: 250, updated_at: '2026-11-11T00:00:00.000Z' };
  const owedNothing = mk(300, 'Rent', '2026-11-03', { group_id: U(9), paid_by: OTHER, shares: { [OTHER]: 300 } });
  assert.deepEqual(exportOverview([a, b, owedNothing], [a, b, owedNothing], ME), { waiting: 1, changed: 0 });
  assert.deepEqual(exportOverview([a, changed], [a, changed], ME), { waiting: 1, changed: 1 });
});

test('the overview shows all four groups until a budget is set, then only the groups that have one', () => {
  const none = monthOverview([], ME, planForMonth(null, {}, '2026-11'), planForMonth(null, {}, '2026-10'), '2026-11-10');
  assert.deepEqual(overviewGroups(none.summary.groups), ['Spending', 'EMI', 'Family', 'Saving']);
  const some = monthOverview([], ME, planForMonth(null, mineWithBudgets(), '2026-11'), planForMonth(null, mineWithBudgets(), '2026-10'), '2026-11-10');
  assert.deepEqual(overviewGroups(some.summary.groups), ['Spending', 'EMI', 'Saving'], 'Family has no budget, so no tile');
});

// ---------------------------------------------------------------- All payments: search and filters

test('all payments: search finds words in any order, amounts without commas, and filters combine', () => {
  const es = [
    mk(4500, 'Rent', '2026-11-01', { note: 'November flat', method: 'UPI' }),
    mk(450, 'Groceries', '2026-11-05', { note: 'Big Basket order', method: 'Card' }),
    mk(450, 'Groceries', '2026-10-28', { note: 'vegetables', method: 'Cash' }),
    mk(1200, 'Fuel', '2026-10-20', { method: 'UPI' }),
  ];
  const ids = (f: Partial<typeof NO_FILTER>) => filterPayments(es, { ...NO_FILTER, ...f }, ME).map((e) => `${e.category}${e.entry_date.slice(5)}`);
  assert.deepEqual(ids({}), ['Groceries11-05', 'Rent11-01', 'Groceries10-28', 'Fuel10-20'], 'all four, newest first');
  assert.deepEqual(ids({ q: 'basket big' }), ['Groceries11-05'], 'words in any order');
  assert.deepEqual(ids({ q: '₹4,500' }), ['Rent11-01'], 'amount typed with a rupee sign and a comma');
  assert.equal(ids({ q: '450' }).length, 3, '450 is also found inside 4500');
  assert.deepEqual(ids({ category: 'groceries' }).length, 2);
  assert.deepEqual(ids({ month: '2026-10' }).sort(), ['Fuel10-20', 'Groceries10-28']);
  assert.deepEqual(ids({ month: '2026-10', method: 'UPI' }), ['Fuel10-20'], 'filters combine');
  assert.deepEqual(ids({ q: 'nothing like this' }), []);
  assert.equal(isFiltered(NO_FILTER), false);
  assert.equal(isFiltered({ ...NO_FILTER, q: '  ' }), false);
  assert.equal(isFiltered({ ...NO_FILTER, method: 'UPI' }), true);
  assert.deepEqual(paymentMonths(es), ['2026-11', '2026-10']);
  assert.deepEqual(paymentCategories([...es, mk(10, 'groceries', '2026-11-06')]), ['Fuel', 'Groceries', 'Rent'], 'one name per spelling in any case');
  assert.equal(totalShare(es, ME), 6600);
});

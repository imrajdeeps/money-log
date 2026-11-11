import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coupleTiles, dueOverview, nearestGoal, groupsOverview, monthOverview, overviewGroups, spentByDay, topCategories } from '../../../src/features/home/dashboard.ts';
import { NO_FILTER, filterPayments, isFiltered, paymentCategories, paymentMonths, totalShare } from '../../../src/features/payments/payments.ts';
import { planForMonth, setBudget, categoryList } from '../../../src/core/categories.ts';
import type { Mine } from '../../../src/core/categories.ts';
import { daysInMonth, makeEntry, softDelete, summarizeMonth } from '../../../src/core/logic.ts';
import type { Entry } from '../../../src/core/logic.ts';
import type { Settlement } from '../../../src/core/groups.ts';

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
    const info = categoryList(m).find((c) => c.name === name)!;
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
  const plan = planForMonth({}, '2026-11');
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
  const o = monthOverview(entries, ME, planForMonth(mine, '2026-11'), planForMonth(mine, '2026-10'), '2026-11-09');
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
  const plan = planForMonth({}, '2026-11');
  const o = monthOverview([shared, theirs], ME, plan, planForMonth({}, '2026-10'), '2026-11-05');
  assert.equal(o.spent, 300);
  assert.equal(o.budgeted, false);
  assert.equal(o.budget, 0);
  assert.equal(o.change, null, 'nothing last month');
  const quiet = monthOverview([mk(100, 'Groceries', '2026-10-01')], ME, plan, planForMonth({}, '2026-10'), '2026-11-05');
  assert.equal(quiet.change, null, 'nothing yet this month');
});

test('monthOverview on the 31st compares with the last day of a shorter month', () => {
  const plan = planForMonth({}, '2026-12');
  const o = monthOverview([mk(100, 'Groceries', '2026-12-31'), mk(50, 'Groceries', '2026-11-30')], ME, plan, planForMonth({}, '2026-11'), '2026-12-31');
  assert.equal(o.lastToDate, 50);
  assert.equal(o.change, 1);
});

test('topCategories: biggest first, Saving left out, unknown names kept, the rest added up', () => {
  const plan = planForMonth({}, '2026-11');
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
  assert.equal(dueOverview([], '2026-11-09'), null);
  const item = (k: string, title: string, due: string | null, done = false) => ({ k, kind: 'todo' as const, title, due, amount: null, done });
  const items = [item('1', 'Later', '2026-12-20'), item('2', 'Late', '2026-11-01'), item('3', 'Finished', '2026-11-05', true), item('4', 'Soon', '2026-11-12'), item('5', 'Undated', null)];
  const o = dueOverview(items, '2026-11-09')!;
  assert.equal(o.overdue, 1);
  assert.equal(o.open, 4);
  assert.deepEqual(o.next.map((v) => v.title), ['Late', 'Soon']);
  const ticked = dueOverview(items.map((i) => (i.k === '2' ? { ...i, done: true } : i)), '2026-11-09')!;
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

test('the overview shows all four groups until a budget is set, then only the groups that have one', () => {
  const none = monthOverview([], ME, planForMonth({}, '2026-11'), planForMonth({}, '2026-10'), '2026-11-10');
  assert.deepEqual(overviewGroups(none.summary.groups), ['Spending', 'EMI', 'Family', 'Saving']);
  const some = monthOverview([], ME, planForMonth(mineWithBudgets(), '2026-11'), planForMonth(mineWithBudgets(), '2026-10'), '2026-11-10');
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

const CA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const grp = (id: string, kind: 'couple' | 'family' | 'trip'): import('../../../src/core/groups.ts').Group =>
  ({ id, name: id, kind, created_at: '2026-11-10T00:00:00Z', starts_on: null, ends_on: null, closed_at: null, usual_split: null });
const mem = (gid: string, uid: string, name: string, left: string | null = null) =>
  ({ group_id: gid, user_id: uid, display_name: name, role: 'member' as const, joined_at: '2026-11-10T00:00:00Z', left_at: left });
const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
const G3 = '33333333-3333-4333-8333-333333333333';
const G4 = '44444444-4444-4444-8444-444444444444';
const shared = (gid: string, amount: number, paidBy: string): Entry => ({
  id: `s${gid}${amount}`, owner_id: paidBy, entry_date: '2026-11-09', category: 'Food', amount, note: '', method: null, created_at: '2026-11-09T10:00:00Z',
  updated_at: '2026-11-09T10:00:00Z', deleted_at: null, exported_at: null, group_id: gid, paid_by: paidBy, shares: { [CA]: amount / 2, [CB]: amount / 2 }, share_of: null, dirty: 0,
});

test('one Overview tile for each couple that has both people, with the one line', () => {
  const groups = [grp(G1, 'couple'), grp(G2, 'family'), grp(G3, 'couple'), grp(G4, 'trip')];
  const members = [mem(G1, CA, 'Raj'), mem(G1, CB, 'Priya'), mem(G2, CA, 'Raj'), mem(G2, CB, 'Priya'), mem(G3, CA, 'Raj')]; // G3: the partner has not joined
  const tiles = coupleTiles(groups, members, [shared(G1, 100, CA)], [], CA);
  assert.deepEqual(tiles, [{ id: G1, partner: 'Priya', text: 'Priya owes you ₹50', tone: 'owed' }]);
  assert.equal(coupleTiles(groups, members, [shared(G1, 100, CB)], [], CA)[0]!.text, 'You owe Priya ₹50');
  assert.equal(coupleTiles(groups, members, [], [], CA)[0]!.tone, 'muted');
  assert.deepEqual(coupleTiles(groups, members, [], [], null), []);
  // a partner who has left, and a third couple: none, and never more than two tiles
  assert.deepEqual(coupleTiles([grp(G1, 'couple')], [mem(G1, CA, 'Raj'), mem(G1, CB, 'Priya', '2026-11-10T00:00:00Z')], [], [], CA), []);
  const many = [grp(G1, 'couple'), grp(G3, 'couple'), grp(G4, 'couple')];
  const both = [G1, G3, G4].flatMap((g) => [mem(g, CA, 'Raj'), mem(g, CB, 'Priya')]);
  assert.equal(coupleTiles(many, both, [], [], CA).length, 2);
});

import { addGoal as addGoalTo } from '../../../src/core/goals.ts';
import type { Goals } from '../../../src/core/goals.ts';
const GT = '2026-11-10';
const gid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const goalsWith = (...specs: [name: string, target: number, saved: number, date: string][]): Goals =>
  specs.reduce((items, [name, target, saved, date], i) => {
    const r = addGoalTo(items, { name, target, date, saved, category: '' }, GT, '2026-11-10T10:00:00.000Z', gid(i + 1));
    assert.ok(r.ok);
    return r.items;
  }, {} as Goals);

const savingPay = (amount: number): Entry => ({
  id: `sp${amount}`, owner_id: null, entry_date: GT, category: 'Savings', amount, note: '', method: null, created_at: '2026-11-10T10:00:00Z',
  updated_at: '2026-11-10T10:00:00Z', deleted_at: null, exported_at: null, group_id: null, paid_by: null, shares: null, share_of: null, dirty: 0,
});
const linked = (...specs: [name: string, target: number, date: string][]): Goals =>
  specs.reduce((items, [name, target, date], i) => {
    const r = addGoalTo(items, { name, target, date, saved: 0, category: 'Savings' }, GT, '2026-11-10T10:00:00.000Z', gid(i + 1));
    assert.ok(r.ok);
    return r.items;
  }, {} as Goals);

test('the Overview goal tile: the nearest short-term goal that still needs money, else the nearest that does, else the nearest', () => {
  assert.equal(nearestGoal({}, [], GT), null);
  const mixed = goalsWith(['Retirement', 1000000, 0, '2030-01-01'], ['Laptop', 60000, 0, '2027-03-01'], ['Trip', 20000, 0, '2027-01-15']);
  const t = nearestGoal(mixed, [], GT)!;
  assert.deepEqual([t.goal.n, t.term, t.count, t.line.state], ['Trip', 'short', 3, 'needs']);
  const onlyLong = goalsWith(['B', 1000, 0, '2030-01-01'], ['A', 1000, 0, '2029-01-01']);
  assert.deepEqual([nearestGoal(onlyLong, [], GT)!.goal.n, nearestGoal(onlyLong, [], GT)!.term], ['A', 'long']);
  // a short-term goal that is reached is passed over for a long-term one that still needs money
  const oneDone = linked(['Small', 1000, '2027-01-01']);
  const bigLong = goalsWith(['Big', 500000, 0, '2030-01-01']);
  const both = { ...oneDone, ...bigLong };
  assert.equal(nearestGoal(both, [savingPay(1000)], GT)!.goal.n, 'Big');
  // when every goal is reached, the nearest one is shown, as reached
  const all = linked(['B', 1000, '2027-02-01'], ['A', 1000, '2027-01-01']);
  const r = nearestGoal(all, [savingPay(5000)], GT)!;
  assert.deepEqual([r.goal.n, r.line.state], ['A', 'reached']);
});

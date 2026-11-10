import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_GOALS, MAX_TOPUPS, activeGoals, addGoal, addMonths, addTopUp, checkGoalInput, cleanGoals, editGoal, goalTerm, mergeGoals,
  removeGoal, removeTopUp, sameGoals, topUpsOf, goalLine, goalPlan, goalProgress, monthsLeft,
} from '../../src/core/goals.ts';
import type { GoalInput, Goals } from '../../src/core/goals.ts';
import { makeBackup, parseBackup } from '../../src/data/backup.ts';
import type { Entry } from '../../src/core/logic.ts';

const TODAY = '2026-11-10';
const NOW = '2026-11-10T10:00:00.000Z';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = (o: Partial<GoalInput> = {}): GoalInput => ({ name: 'Emergency fund', target: 100000, date: '2027-06-30', saved: 10000, category: 'Savings', ...o });
const made = (o: Partial<GoalInput> = {}, n = 1, items: Goals = {}): Goals => {
  const r = addGoal(items, input(o), TODAY, NOW, id(n));
  assert.ok(r.ok);
  return r.items;
};

test('a goal needs a name, a target above zero, a date, and less saved than the target', () => {
  assert.equal(checkGoalInput(input()), null);
  assert.equal(checkGoalInput(input({ saved: 0 })), null);
  for (const bad of [{ name: '  ' }, { name: 'x'.repeat(61) }, { target: 0 }, { target: -5 }, { target: 10.555 }, { date: 'soon' }, { date: '2027-02-30' },
    { saved: -1 }, { saved: 100000 }, { saved: 120000 }, { category: 'x'.repeat(81) }]) {
    assert.notEqual(checkGoalInput(input(bad)), null, JSON.stringify(bad));
  }
});

test('making, editing and removing a goal', () => {
  const items = made({ name: '  Emergency   fund ' });
  const g = items[id(1)]!;
  assert.deepEqual(g, { id: id(1), k: 'g', n: 'Emergency fund', a: 100000, d: '2027-06-30', s: 10000, c: 'Savings', b: TODAY, x: 0, t: NOW });
  const e = editGoal(items, id(1), input({ target: 150000 }), '2026-11-11T00:00:00.000Z');
  assert.ok(e.ok && e.items[id(1)]!.k === 'g' && (e.items[id(1)] as { a: number }).a === 150000);
  assert.equal(editGoal(items, id(9), input(), NOW).ok, false);
  assert.deepEqual(activeGoals(removeGoal(items, id(1), NOW)), []);
  assert.equal(removeGoal(items, id(9), NOW), items); // nothing to remove: the same object
  assert.equal(editGoal(removeGoal(items, id(1), NOW), id(1), input(), NOW).ok, false);
});

test('goals are listed by date, then name', () => {
  let items = made({ name: 'B', date: '2027-01-01' }, 1);
  items = made({ name: 'A', date: '2027-01-01' }, 2, items);
  items = made({ name: 'Z', date: '2026-12-01' }, 3, items);
  assert.deepEqual(activeGoals(items).map((g) => g.n), ['Z', 'A', 'B']);
});

test('top-ups: an amount above zero, a date that is not in the future, for a goal that exists', () => {
  const items = made();
  const r = addTopUp(items, id(1), 5000, '2026-11-09', TODAY, NOW, id(2));
  assert.ok(r.ok);
  assert.deepEqual(r.items[id(2)], { id: id(2), k: 't', g: id(1), a: 5000, d: '2026-11-09', x: 0, t: NOW });
  assert.equal(addTopUp(items, id(1), 0, TODAY, TODAY, NOW).ok, false);
  assert.equal(addTopUp(items, id(1), 100, '2026-11-11', TODAY, NOW).ok, false);
  assert.equal(addTopUp(items, id(1), 100, 'nope', TODAY, NOW).ok, false);
  assert.equal(addTopUp(items, id(7), 100, TODAY, TODAY, NOW).ok, false);
  const two = addTopUp(r.items, id(1), 200, '2026-11-10', TODAY, NOW, id(3));
  assert.ok(two.ok);
  assert.deepEqual(topUpsOf(two.items, id(1)).map((t) => t.a), [200, 5000]); // newest day first
  assert.deepEqual(topUpsOf(removeTopUp(two.items, id(2), NOW), id(1)).map((t) => t.a), [200]);
});

test('removing a goal removes its top-ups with it', () => {
  const r = addTopUp(made(), id(1), 5000, TODAY, TODAY, NOW, id(2));
  assert.ok(r.ok);
  const gone = removeGoal(r.items, id(1), '2026-11-12T00:00:00.000Z');
  assert.deepEqual(topUpsOf(gone, id(1)), []);
  assert.equal(gone[id(2)]!.x, 1);
});

test('limits', () => {
  let items: Goals = {};
  for (let n = 1; n <= MAX_GOALS; n++) items = made({}, n, items);
  assert.equal(addGoal(items, input(), TODAY, NOW, id(900)).ok, false);
  let t: Goals = made();
  for (let n = 0; n < MAX_TOPUPS; n++) { const r = addTopUp(t, id(1), 1, TODAY, TODAY, NOW, id(1000 + n)); assert.ok(r.ok); t = r.items; }
  assert.equal(addTopUp(t, id(1), 1, TODAY, TODAY, NOW, id(5000)).ok, false);
});

test('short term is within 12 months of today, long term after; a passed date is short term', () => {
  assert.equal(goalTerm('2027-11-10', TODAY), 'short'); // exactly 12 months
  assert.equal(goalTerm('2027-11-11', TODAY), 'long'); // the day after
  assert.equal(goalTerm('2026-12-01', TODAY), 'short');
  assert.equal(goalTerm('2026-01-01', TODAY), 'short'); // passed
  assert.equal(goalTerm('2030-01-01', TODAY), 'long');
  // it moves from long to short by itself as time passes
  assert.equal(goalTerm('2027-12-01', '2026-11-10'), 'long');
  assert.equal(goalTerm('2027-12-01', '2026-12-01'), 'short');
});

test('adding months keeps the day, or the last day of a shorter month', () => {
  assert.equal(addMonths('2026-11-10', 12), '2027-11-10');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
});

test('two phones: the later change to an item wins, and top-ups added on both are both kept', () => {
  const base = made();
  const a = addTopUp(base, id(1), 100, TODAY, TODAY, '2026-11-10T11:00:00.000Z', id(2));
  const b = addTopUp(base, id(1), 200, TODAY, TODAY, '2026-11-10T11:00:01.000Z', id(3));
  assert.ok(a.ok && b.ok);
  const merged = mergeGoals(a.items, b.items);
  assert.deepEqual(topUpsOf(merged, id(1)).map((t) => t.a).sort(), [100, 200]);
  assert.ok(sameGoals(mergeGoals(a.items, b.items), mergeGoals(b.items, a.items)));
  const older = editGoal(base, id(1), input({ name: 'Older' }), '2026-11-10T12:00:00.000Z');
  const newer = editGoal(base, id(1), input({ name: 'Newer' }), '2026-11-10T13:00:00.000Z');
  assert.ok(older.ok && newer.ok);
  assert.equal((mergeGoals(newer.items, older.items)[id(1)] as { n: string }).n, 'Newer');
  assert.equal((mergeGoals(older.items, newer.items)[id(1)] as { n: string }).n, 'Newer');
  // a removal made later than an edit wins
  const removed = removeGoal(base, id(1), '2026-11-10T14:00:00.000Z');
  assert.equal(mergeGoals(newer.items, removed)[id(1)]!.x, 1);
  assert.ok(!sameGoals(base, removed));
});

test('cleaning keeps what is valid and drops what is not', () => {
  const r = addTopUp(made(), id(1), 5000, TODAY, TODAY, NOW, id(2));
  assert.ok(r.ok);
  assert.deepEqual(cleanGoals(JSON.parse(JSON.stringify(r.items))), r.items);
  const dirty = JSON.parse(JSON.stringify(r.items));
  dirty[id(3)] = { ...dirty[id(1)], id: id(4) }; // key and id disagree
  dirty[id(5)] = { ...dirty[id(1)], id: id(5), a: -1 };
  dirty[id(6)] = { ...dirty[id(2)], id: id(6), d: '2026-13-01' };
  dirty[id(7)] = { ...dirty[id(2)], id: id(7), g: 'not-a-uuid' };
  dirty[id(8)] = { ...dirty[id(1)], id: id(8), k: 'z' };
  dirty['not-a-uuid'] = dirty[id(1)];
  assert.deepEqual(Object.keys(cleanGoals(dirty)).sort(), [id(1), id(2)]);
  for (const junk of [null, undefined, 5, 'x', []]) assert.deepEqual(cleanGoals(junk), {});
});

test('goals are in a backup and come back from it; an old backup without them still loads', () => {
  const r = addTopUp(made(), id(1), 5000, TODAY, TODAY, NOW, id(2));
  assert.ok(r.ok);
  const file = JSON.stringify(makeBackup([], null, NOW, { goals: r.items }));
  const back = parseBackup(file);
  assert.ok(back.ok);
  assert.deepEqual(back.goals, r.items);
  const old = parseBackup(JSON.stringify(makeBackup([], null, NOW)));
  assert.ok(old.ok);
  assert.deepEqual(old.goals, {});
  assert.ok(!('goals' in JSON.parse(JSON.stringify(makeBackup([], null, NOW)))), 'nothing written when there are no goals');
});

const pay = (o: Partial<Entry>): Entry => ({
  id: `p${Math.random()}`, owner_id: null, entry_date: '2026-11-10', category: 'Savings', amount: 1000, note: '', method: null, created_at: NOW, updated_at: NOW,
  deleted_at: null, exported_at: null, group_id: null, paid_by: null, shares: null, share_of: null, dirty: 0, ...o,
});

test('saved so far: the starting amount, the top-ups, and payments in the linked category from the day the goal was made', () => {
  let items = made({ saved: 10000, category: 'savings' }); // made on 2026-11-10; the category is spelled differently on purpose
  const t = addTopUp(items, id(1), 5000, TODAY, TODAY, NOW, id(2));
  assert.ok(t.ok);
  items = t.items;
  const g = items[id(1)] as import('../../src/core/goals.ts').Goal;
  const p = goalProgress(g, items, [
    pay({ amount: 2000 }), pay({ amount: 500.5, category: 'Savings ' }), // count
    pay({ amount: 999, entry_date: '2026-11-09' }), // before the goal was made
    pay({ amount: 999, category: 'Rent' }), // another category
    pay({ amount: 999, deleted_at: NOW }), // deleted
  ]);
  assert.deepEqual([p.fromStart, p.fromTopUps, p.fromPayments, p.saved, p.remaining], [10000, 5000, 2500.5, 17500.5, 82499.5]);
  assert.ok(Math.abs(p.fraction - 0.175005) < 1e-9 && !p.reached);
  // a removed top-up stops counting; a goal with no linked category ignores payments
  assert.equal(goalProgress(g, removeTopUp(items, id(2), NOW), []).fromTopUps, 0);
  const plain = made({ category: '' }, 3);
  assert.equal(goalProgress(plain[id(3)] as import('../../src/core/goals.ts').Goal, plain, [pay({ amount: 5000 })]).fromPayments, 0);
});

test('a goal is reached when nothing remains, and the bar never passes full', () => {
  const items = made({ target: 1000, saved: 0, category: 'Savings' });
  const g = items[id(1)] as import('../../src/core/goals.ts').Goal;
  const p = goalProgress(g, items, [pay({ amount: 1500 })]);
  assert.deepEqual([p.remaining, p.fraction, p.reached], [0, 1, true]);
});

test('months left count this month and never go below one', () => {
  assert.equal(monthsLeft('2026-11-30', TODAY), 1);
  assert.equal(monthsLeft('2026-12-01', TODAY), 2);
  assert.equal(monthsLeft('2027-06-30', TODAY), 8);
  assert.equal(monthsLeft('2027-11-10', TODAY), 13);
  assert.equal(monthsLeft('2026-01-01', TODAY), 1); // passed
});

test('one line per goal: reached, date passed, or what to set aside a month (rounded up)', () => {
  const items = made({ target: 100000, saved: 10000, date: '2027-06-30', category: '' }); // 8 months left, 90,000 to go
  const g = items[id(1)] as import('../../src/core/goals.ts').Goal;
  assert.deepEqual(goalLine(g, goalProgress(g, items, []), TODAY), { state: 'needs', monthly: 11250, months: 8 });
  const odd = made({ target: 1000, saved: 1, date: '2027-01-31', category: '' }, 2);
  const g2 = odd[id(2)] as import('../../src/core/goals.ts').Goal;
  assert.deepEqual(goalLine(g2, goalProgress(g2, odd, []), TODAY), { state: 'needs', monthly: 333, months: 3 }); // 999 / 3 = 333; 333.0 exactly
  const odd2 = made({ target: 1000, saved: 0, date: '2027-01-31', category: '' }, 3);
  const g3 = odd2[id(3)] as import('../../src/core/goals.ts').Goal;
  assert.deepEqual(goalLine(g3, goalProgress(g3, odd2, []), TODAY), { state: 'needs', monthly: 334, months: 3 }); // 333.33 rounds up
  const old = made({ date: '2026-11-01', saved: 0, category: '' }, 4);
  const g4 = old[id(4)] as import('../../src/core/goals.ts').Goal;
  assert.deepEqual(goalLine(g4, goalProgress(g4, old, []), TODAY), { state: 'passed', remaining: 100000 });
  const done = made({ target: 1000, saved: 0, date: '2026-11-01', category: 'Savings' }, 5);
  const g5 = done[id(5)] as import('../../src/core/goals.ts').Goal;
  assert.deepEqual(goalLine(g5, goalProgress(g5, done, [pay({ amount: 1000 })]), TODAY), { state: 'reached' }); // a reached goal is reached even after its date
});

test('the plan: a monthly amount for each goal that still needs money, the total, and the Saving budget check both ways', () => {
  let items = made({ name: 'Emergency fund', target: 100000, saved: 10000, date: '2027-06-30', category: '' }, 1); // 8 months: 11,250
  items = made({ name: 'Laptop', target: 60000, saved: 0, date: '2027-01-31', category: '' }, 2, items); // 3 months: 20,000
  items = made({ name: 'Old goal', target: 5000, saved: 0, date: '2026-10-01', category: '' }, 3, items); // passed
  items = made({ name: 'Done goal', target: 1000, saved: 0, date: '2027-03-01', category: 'Savings' }, 4, items);
  const rows = activeGoals(items).map((goal) => ({ goal, line: goalLine(goal, goalProgress(goal, items, [pay({ amount: 1000 })]), TODAY) }));
  const short = goalPlan(rows, 30000);
  assert.deepEqual(short.rows.map((r) => [r.goal.n, r.monthly, r.months]), [['Laptop', 20000, 3], ['Emergency fund', 11250, 8]]); // nearest date first
  assert.deepEqual([short.total, short.reached, short.passed], [31250, 1, 1]);
  assert.deepEqual([short.budget, short.gap, short.covers], [30000, 1250, false]); // 1,250 a month short
  const spare = goalPlan(rows, 40000);
  assert.deepEqual([spare.gap, spare.covers], [-8750, true]); // 8,750 to spare
  assert.deepEqual([goalPlan(rows, 31250).gap, goalPlan(rows, 31250).covers], [0, true]); // exactly
  const none = goalPlan(rows, null);
  assert.deepEqual([none.budget, none.gap, none.covers], [null, null, null]); // no budget set: nothing to compare with
  assert.deepEqual(goalPlan([], 1000), { rows: [], total: 0, budget: 1000, gap: -1000, covers: true, reached: 0, passed: 0 });
});

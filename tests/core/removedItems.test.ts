import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_DUE_ENTRIES, MAX_GOALS, MAX_INCOME_CATS, MAX_UDHAAR, MAX_WORTH, REMOVED_KEEP_DAYS,
  addGoal, addTopUp, cleanGoals, liveCount, purgeRemoved, removeGoal,
} from '../../src/core/goals.ts';
import type { GoalInput, Goals, WorthItem, UdhaarItem } from '../../src/core/goals.ts';
import { addDueItem, removeDueItem } from '../../src/core/dueItems.ts';
import { addIncomeCategory, removeIncomeCategory } from '../../src/core/income.ts';
import { addUdhaar, removeUdhaar } from '../../src/core/udhaar.ts';
import type { UdhaarInput } from '../../src/core/udhaar.ts';
import { addWorthItem, removeWorthItem } from '../../src/core/worth.ts';
import type { WorthInput } from '../../src/core/worth.ts';

const TODAY = '2026-11-25';
const NOW = '2026-11-25T10:00:00.000Z';
const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * DAY).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const goalInput: GoalInput = { name: 'Emergency fund', target: 100000, date: '2027-06-30', saved: 0, category: '' };
const udhaarInput: UdhaarInput = { name: 'Aman', amount: '500', way: 'gave', date: TODAY, note: '' };
const worthInput: WorthInput = { name: 'Savings', side: 'a', cls: 'liquid', amount: '1000', emi: '', rate: '' };
const udhaar = (n: number, x: 0 | 1, t = NOW): UdhaarItem => ({ id: id(n), k: 'u', n: 'P', a: 1, w: 'gave', d: '2026-11-01', m: '', s: 0, x, t });
const worth = (n: number, x: 0 | 1, t = NOW): WorthItem => ({ id: id(n), k: 'w', n: 'x', s: 'a', c: 'liquid', a: 1, d: TODAY, p: null, pd: '', e: 0, r: 0, x, t });

test('a removed goal no longer counts toward the most goals one account can keep', () => {
  let items: Goals = {};
  for (let n = 1; n <= MAX_GOALS; n++) { const r = addGoal(items, goalInput, TODAY, NOW, id(n)); assert.ok(r.ok); items = r.items; }
  assert.equal(addGoal(items, goalInput, TODAY, NOW, id(900)).ok, false, 'full');
  items = removeGoal(items, id(1), NOW);
  assert.equal(liveCount(items, 'g'), MAX_GOALS - 1);
  assert.ok(addGoal(items, goalInput, TODAY, NOW, id(900)).ok, 'room again after a removal');
});

test('removed Udhaar entries and net worth items no longer count toward their caps', () => {
  let u: Goals = {};
  for (let n = 1; n <= MAX_UDHAAR; n++) u[id(n)] = udhaar(n, 0);
  assert.equal(addUdhaar(u, udhaarInput, TODAY, NOW, id(9000)).ok, false);
  u = removeUdhaar(u, id(1), NOW);
  assert.ok(addUdhaar(u, udhaarInput, TODAY, NOW, id(9000)).ok);

  let w: Goals = {};
  for (let n = 1; n <= MAX_WORTH; n++) w[id(n)] = worth(n, 0);
  assert.equal(addWorthItem(w, worthInput, TODAY, NOW, id(9000)).ok, false);
  w = removeWorthItem(w, id(1), NOW);
  assert.ok(addWorthItem(w, worthInput, TODAY, NOW, id(9000)).ok);
});

test('removed due items and income categories no longer count toward their caps', () => {
  let d: Goals = {};
  for (let n = 1; n <= MAX_DUE_ENTRIES; n++) { const r = addDueItem(d, { kind: 'todo', title: `Item ${n}`, date: '', amount: 0 }, NOW, id(n)); assert.ok(r.ok); d = r.items; }
  assert.equal(addDueItem(d, { kind: 'todo', title: 'One more', date: '', amount: 0 }, NOW, id(9000)).ok, false);
  d = removeDueItem(d, id(1), NOW);
  assert.ok(addDueItem(d, { kind: 'todo', title: 'One more', date: '', amount: 0 }, NOW, id(9000)).ok);

  let c: Goals = {};
  for (let n = 1; n <= MAX_INCOME_CATS; n++) { const r = addIncomeCategory(c, `Source ${n}`, NOW); assert.ok(r.ok); c = r.items; }
  assert.equal(addIncomeCategory(c, 'Another', NOW).ok, false);
  c = removeIncomeCategory(c, 'Source 1', NOW);
  const added = addIncomeCategory(c, 'Another', NOW);
  assert.ok(added.ok);
  assert.equal(addIncomeCategory(added.items, 'Another 2', NOW).ok, false, 'full again');
  // bringing the removed one back also counts as a live one, so it needs room too
  assert.equal(addIncomeCategory(added.items, 'Source 1', NOW).ok, false);
});

test('reading data back keeps every live item and room for as many removed ones, the newest first', () => {
  const raw: Goals = {};
  for (let n = 1; n <= MAX_WORTH; n++) raw[id(n)] = worth(n, 0);
  // more removed ones than the cap, each a day older than the one before
  for (let n = 1; n <= MAX_WORTH + 5; n++) raw[id(1000 + n)] = worth(1000 + n, 1, daysAgo(n));
  const out = cleanGoals(raw);
  assert.equal(liveCount(out, 'w'), MAX_WORTH, 'no live item is dropped for the sake of removed ones');
  const removed = Object.values(out).filter((v) => v.x === 1);
  assert.equal(removed.length, MAX_WORTH);
  assert.ok(Object.hasOwn(out, id(1001)), 'the newest removal is kept');
  assert.ok(!Object.hasOwn(out, id(1000 + MAX_WORTH + 5)), 'the oldest is the one that goes');
  // still capped when there are too many live ones
  const tooMany: Goals = {};
  for (let n = 1; n <= MAX_WORTH + 10; n++) tooMany[id(n)] = worth(n, 0);
  assert.equal(liveCount(cleanGoals(tooMany), 'w'), MAX_WORTH);
});

test('removed items older than the keeping time are cleared, newer ones and live ones stay', () => {
  const items: Goals = {
    [id(1)]: worth(1, 1, daysAgo(REMOVED_KEEP_DAYS + 1)),
    [id(2)]: worth(2, 1, daysAgo(REMOVED_KEEP_DAYS - 1)),
    [id(3)]: worth(3, 0, daysAgo(400)),
  };
  const out = purgeRemoved(items, NOW);
  assert.deepEqual(Object.keys(out).sort(), [id(2), id(3)]);
  assert.equal(purgeRemoved(out, NOW), out, 'the same object when there is nothing to clear');
});

test('clearing a removed goal also clears its top-ups; a goal that stays keeps its top-ups', () => {
  let items: Goals = {};
  for (const n of [1, 2]) { const r = addGoal(items, goalInput, TODAY, daysAgo(300), id(n)); assert.ok(r.ok); items = r.items; }
  for (const [n, g] of [[11, 1], [12, 2]] as const) { const r = addTopUp(items, id(g), 100, TODAY, TODAY, daysAgo(300), id(n)); assert.ok(r.ok); items = r.items; }
  items = removeGoal(items, id(1), daysAgo(200)); // goal 1 and its top-up go at the same time, long ago
  const out = purgeRemoved(items, NOW);
  assert.deepEqual(Object.keys(out).sort(), [id(2), id(12)], 'goal 1 and its top-up are cleared, goal 2 and its top-up stay');
  // a top-up added elsewhere to a goal that was cleared is left with nothing to belong to, so it goes too
  const withLate: Goals = { ...items, [id(14)]: { id: id(14), k: 't', g: id(1), a: 5, d: TODAY, x: 0, t: NOW } };
  assert.ok(!Object.hasOwn(purgeRemoved(withLate, NOW), id(14)));
});

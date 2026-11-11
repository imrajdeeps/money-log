import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_NET_UPDATES, parseNetAmount, addGoal, addNetUpdate, cleanGoals, mergeGoals, netNow, netUpdates, removeGoal, removeNetUpdate, sameGoals } from '../../src/core/goals.ts';
import type { Goals } from '../../src/core/goals.ts';
import { makeBackup, parseBackup } from '../../src/data/backup.ts';

const TODAY = '2026-11-10';
const T1 = '2026-11-10T10:00:00.000Z';
const T2 = '2026-11-10T11:00:00.000Z';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const upd = (items: Goals, a: number, d: string, now: string, n: number): Goals => {
  const r = addNetUpdate(items, a, d, TODAY, now, id(n));
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.items;
};

test('no update yet: there is no net worth to show', () => {
  assert.equal(netNow({}), null);
  assert.deepEqual(netUpdates({}), []);
});

test('the latest update leads and the change is against the one before it', () => {
  let g: Goals = upd({}, 600000, '2026-10-01', T1, 1);
  assert.deepEqual(netNow(g), { value: 600000, date: '2026-10-01', previous: null, change: null });
  g = upd(g, 621302.5, '2026-11-10', T2, 2);
  assert.deepEqual(netNow(g), { value: 621302.5, date: '2026-11-10', previous: { value: 600000, date: '2026-10-01' }, change: 21302.5 });
  assert.deepEqual(netUpdates(g).map((u) => u.id), [id(2), id(1)]);
});

test('on one day the update entered last counts, and a fall is a negative change', () => {
  let g = upd({}, 500, '2026-11-10', T1, 1);
  g = upd(g, 400, '2026-11-10', T2, 2);
  assert.equal(netNow(g)!.value, 400);
  assert.equal(netNow(g)!.change, -100);
});

test('net worth may be zero or negative, but not a bad number, a future day or a date that does not exist', () => {
  assert.ok(addNetUpdate({}, -250000, TODAY, TODAY, T1, id(1)).ok);
  assert.ok(addNetUpdate({}, 0, TODAY, TODAY, T1, id(2)).ok);
  for (const a of [Number.NaN, Infinity, 1e12, 10.123]) assert.equal(addNetUpdate({}, a, TODAY, TODAY, T1).ok, false, String(a));
  assert.equal(addNetUpdate({}, 1, '2026-11-11', TODAY, T1).ok, false);
  assert.equal(addNetUpdate({}, 1, '2026-02-30', TODAY, T1).ok, false);
  assert.equal(addNetUpdate({}, 1, '', TODAY, T1).ok, false);
});

test('a removed update goes from the list, and removing twice or a wrong id changes nothing', () => {
  const g = upd(upd({}, 1, '2026-10-01', T1, 1), 2, '2026-11-01', T1, 2);
  const out = removeNetUpdate(g, id(2), T2);
  assert.deepEqual(netUpdates(out).map((u) => u.id), [id(1)]);
  assert.equal(netNow(out)!.value, 1);
  assert.equal(removeNetUpdate(out, id(2), T2), out);
  assert.equal(removeNetUpdate(out, id(99), T2), out);
});

test('at most MAX_NET_UPDATES are kept, and removing a goal leaves net worth alone', () => {
  let g: Goals = {};
  for (let i = 1; i <= MAX_NET_UPDATES; i++) g = { ...g, [id(i)]: { id: id(i), k: 'n', a: i, d: '2026-01-01', x: 0, t: T1 } };
  assert.equal(addNetUpdate(g, 1, TODAY, TODAY, T1, id(9999)).ok, false);
  const goal = addGoal({}, { name: 'Trip', target: 1000, date: '2027-01-01', saved: 0, category: '' }, TODAY, T1, id(5000));
  assert.ok(goal.ok);
  const both = upd(goal.items, 5, TODAY, T1, 1);
  assert.equal(netUpdates(removeGoal(both, id(5000), T2)).length, 1);
});

test('two phones each add an update: both stay; the later edit to one wins', () => {
  const a = upd({}, 100, '2026-11-01', T1, 1);
  const b = upd({}, 200, '2026-11-02', T1, 2);
  const merged = mergeGoals(a, b);
  assert.deepEqual(netUpdates(merged).map((u) => u.id).sort(), [id(1), id(2)]);
  const gone = removeNetUpdate(a, id(1), T2);
  assert.equal(netUpdates(mergeGoals(a, gone)).length, 0, 'the removal (later) beats the old copy');
  assert.equal(sameGoals(merged, mergeGoals(b, a)), true);
  assert.equal(sameGoals(a, b), false);
  assert.equal(sameGoals(a, removeNetUpdate(a, id(1), T2)), false);
});

test('bad items from the server or a backup are dropped, good ones kept', () => {
  const good = upd({}, -5000.5, '2026-11-01', T1, 1);
  assert.deepEqual(cleanGoals(JSON.parse(JSON.stringify(good))), good);
  const k = id(7);
  for (const bad of [{ id: k, k: 'n', a: 'x', d: '2026-11-01', x: 0, t: T1 }, { id: k, k: 'n', a: 1, d: 'nope', x: 0, t: T1 }, { id: k, k: 'n', a: 1e13, d: '2026-11-01', x: 0, t: T1 }, { id: k, k: 'n', a: 1.234, d: '2026-11-01', x: 0, t: T1 }, { id: k, k: 'n', a: 1, d: '2026-11-01', x: 2, t: T1 }, { id: k, k: 'n', a: 1, d: '2026-11-01', x: 0, t: 'later' }, { id: id(8), k: 'n', a: 1, d: '2026-11-01', x: 0, t: T1 }]) {
    assert.deepEqual(cleanGoals({ [k]: bad }), {}, JSON.stringify(bad));
  }
});

test('net worth updates are in the backup file and come back from it', () => {
  const g = upd({}, 621302, '2026-11-10', T1, 1);
  const file = makeBackup([], null, '2026-11-10T12:00:00.000Z', { goals: g });
  const back = parseBackup(JSON.stringify(file));
  assert.ok(back.ok);
  assert.deepEqual(back.ok && back.goals, g);
});

test('typed net worth: commas, rupee sign, minus or brackets for debt, at most two decimals', () => {
  assert.equal(parseNetAmount('6,21,302'), 621302);
  assert.equal(parseNetAmount(' ₹ 6,21,302.50 '), 621302.5);
  assert.equal(parseNetAmount('-25000'), -25000);
  assert.equal(parseNetAmount('(25,000)'), -25000);
  assert.equal(parseNetAmount('.5'), 0.5);
  assert.equal(Object.is(parseNetAmount('-0'), 0), true);
  assert.equal(parseNetAmount('0'), 0);
  for (const bad of ['', '-', 'abc', '1.234', '1e5', '12 34x', '--5', '1000000000000', null, undefined]) assert.equal(parseNetAmount(bad), null, String(bad));
});

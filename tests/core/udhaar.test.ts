import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addUdhaar, checkUdhaar, editUdhaar, removeUdhaar, setUdhaarSettled, udhaarList, udhaarTotals } from '../../src/core/udhaar.ts';
import { cleanGoals, MAX_UDHAAR } from '../../src/core/goals.ts';
import type { Goals } from '../../src/core/goals.ts';

const TODAY = '2026-11-24';
const NOW = '2026-11-24T10:00:00.000Z';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = (over: Partial<Parameters<typeof checkUdhaar>[0]> = {}) => ({ name: 'Rohit', amount: '2000', way: 'gave' as const, date: '2026-11-20', note: 'for the trip', ...over });
const add = (items: Goals, n: number, over = {}): Goals => {
  const r = addUdhaar(items, input(over), TODAY, NOW, ID(n));
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.items;
};

test('what is typed for an entry is checked', () => {
  assert.deepEqual(checkUdhaar(input({ name: '  Rohit   K ' }), TODAY), { ok: true, name: 'Rohit K', amount: 2000, way: 'gave', date: '2026-11-20', note: 'for the trip' });
  for (const bad of [{ name: ' ' }, { name: 'x'.repeat(41) }, { amount: '0' }, { amount: '1.005' }, { amount: 'abc' }, { date: '2026-11-25' }, { date: 'nope' }, { note: 'n'.repeat(101) }]) {
    assert.equal(checkUdhaar(input(bad), TODAY).ok, false, JSON.stringify(bad));
  }
});

test('add, edit, settle and remove', () => {
  let items = add({}, 1);
  assert.equal(udhaarList(items).length, 1);
  const edited = editUdhaar(items, ID(1), input({ amount: '2500', note: '' }), TODAY, '2026-11-24T11:00:00.000Z');
  assert.ok(edited.ok);
  items = edited.items;
  assert.equal(udhaarList(items)[0]!.a, 2500);
  assert.equal(editUdhaar(items, ID(9), input(), TODAY, NOW).ok, false, 'an entry that is not there');
  items = setUdhaarSettled(items, ID(1), true, '2026-11-24T12:00:00.000Z');
  assert.equal(udhaarList(items)[0]!.s, 1);
  assert.equal(setUdhaarSettled(items, ID(1), true, NOW), items, 'settling twice changes nothing');
  items = setUdhaarSettled(items, ID(1), false, '2026-11-24T13:00:00.000Z');
  assert.equal(udhaarList(items)[0]!.s, 0, 'it can be opened again');
  items = removeUdhaar(items, ID(1), '2026-11-24T14:00:00.000Z');
  assert.equal(udhaarList(items).length, 0);
  assert.equal(removeUdhaar(items, ID(1), NOW), items);
  assert.equal(editUdhaar(items, ID(1), input(), TODAY, NOW).ok, false, 'a removed entry cannot be edited');
});

test('open entries come first, newest day first, then the settled ones', () => {
  let items = add({}, 1, { name: 'A', date: '2026-11-01' });
  items = add(items, 2, { name: 'B', date: '2026-11-10' });
  items = add(items, 3, { name: 'C', date: '2026-11-20' });
  items = setUdhaarSettled(items, ID(3), true, NOW);
  assert.deepEqual(udhaarList(items).map((u) => u.n), ['B', 'A', 'C']);
});

test('totals: what is open, by person, lent against borrowed', () => {
  let items = add({}, 1, { name: 'Rohit', amount: '2000', way: 'gave' });
  items = add(items, 2, { name: 'rohit ', amount: '500', way: 'took' }); // the same person, spelled differently
  items = add(items, 3, { name: 'Meera', amount: '300', way: 'took' });
  items = add(items, 4, { name: 'Amit', amount: '999', way: 'gave' });
  items = setUdhaarSettled(items, ID(4), true, NOW); // paid back: not counted
  const t = udhaarTotals(items);
  assert.equal(t.owedToMe, 1500);
  assert.equal(t.iOwe, 300);
  assert.deepEqual(t.people.map((p) => [p.name, p.net, p.open]), [['Rohit', 1500, 2], ['Meera', -300, 1]]);
});

test('the cap includes removed entries, and counts nothing it should not', () => {
  const full: Goals = {};
  for (let i = 0; i < MAX_UDHAAR; i++) full[ID(i + 1)] = { id: ID(i + 1), k: 'u', n: 'P', a: 1, w: 'gave', d: '2026-11-01', m: '', s: 0, x: 0, t: NOW };
  const r = addUdhaar(full, input(), TODAY, NOW, ID(99999));
  assert.equal(r.ok, false);
});

test('entries survive the check on what comes from the server or a backup, and bad ones are dropped', () => {
  const items = add(add({}, 1), 2, { name: 'Meera', way: 'took' });
  assert.deepEqual(cleanGoals(JSON.parse(JSON.stringify(items))), items);
  const good = { ...items[ID(1)]! } as unknown as Record<string, unknown>;
  const bad = (over: Record<string, unknown>) => cleanGoals({ [ID(1)]: { ...good, ...over } });
  for (const over of [{ a: 0 }, { a: 1.005 }, { w: 'sold' }, { n: '' }, { n: ' Rohit' }, { d: '2026-02-30' }, { s: 2 }, { m: 'm'.repeat(101) }, { m: 5 }, { x: 3 }]) {
    assert.deepEqual(bad(over), {}, JSON.stringify(over));
  }
});

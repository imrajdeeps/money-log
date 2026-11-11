import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDueItem, checkDueInput, dueEntry, dueItemsOf, editDueItem, migrateDue, migratedDueId, removeDueItem, setDueItemDone } from '../../src/core/dueItems.ts';
import { cleanGoals, mergeGoals, sameGoals } from '../../src/core/goals.ts';
import type { Goals } from '../../src/core/goals.ts';
import { classifyDue } from '../../src/core/blocks.ts';
import type { DueItem } from '../../src/core/blocks.ts';
import { afterExport, toCancel } from '../../src/core/calendar.ts';
import { UUID_RE } from '../../src/core/logic.ts';

const T1 = '2026-11-10T10:00:00.000Z';
const T2 = '2026-11-10T11:00:00.000Z';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const add = (items: Goals, title: string, n: number, over: Partial<{ kind: 'oneoff' | 'todo'; date: string; amount: number }> = {}): Goals => {
  const r = addDueItem(items, { kind: 'todo', date: '2026-12-15', amount: 0, title, ...over }, T1, id(n));
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.items;
};

test('a due item has a title, a kind, an optional date and, for a payment, an optional amount', () => {
  assert.equal(checkDueInput({ kind: 'oneoff', title: 'Annual fee', date: '', amount: 0 }), null);
  assert.equal(checkDueInput({ kind: 'todo', title: '  Call   the bank ', date: '2027-01-05', amount: 0 }), null);
  assert.ok(checkDueInput({ kind: 'todo', title: '   ', date: '', amount: 0 }));
  assert.ok(checkDueInput({ kind: 'todo', title: 'x'.repeat(121), date: '', amount: 0 }));
  assert.ok(checkDueInput({ kind: 'todo', title: 'x', date: '2027-02-30', amount: 0 }));
  assert.ok(checkDueInput({ kind: 'oneoff', title: 'x', date: '', amount: -5 }));
  assert.ok(checkDueInput({ kind: 'oneoff', title: 'x', date: '', amount: 1.234 }));
  assert.ok(checkDueInput({ kind: 'other' as never, title: 'x', date: '', amount: 0 }));
});

test('an added item shows on the list as a due item keyed by its id; a to-do carries no amount', () => {
  let g = add({}, 'Annual fee', 1, { kind: 'oneoff', date: '2027-03-31', amount: 12000 });
  g = add(g, '  Renew   passport ', 2, { amount: 999 });
  g = add(g, 'No date', 3, { date: '' });
  const list = dueItemsOf(g);
  const fee = list.find((i) => i.k === id(1))!;
  assert.deepEqual([fee.kind, fee.title, fee.due, fee.amount, fee.done], ['oneoff', 'Annual fee', '2027-03-31', 12000, false]);
  const passport = list.find((i) => i.k === id(2))!;
  assert.deepEqual([passport.title, passport.amount], ['Renew passport', null], 'tidy title; a to-do ignores an amount');
  assert.equal(list.find((i) => i.k === id(3))!.due, null);
});

test('edit changes the item and keeps it done or not; done and remove work, and a gone item cannot be changed', () => {
  let g = add({}, 'Fee', 1, { kind: 'oneoff', amount: 100 });
  g = setDueItemDone(g, id(1), true, T1);
  const r = editDueItem(g, id(1), { kind: 'oneoff', title: 'Fee 2', date: '2027-01-01', amount: 250 }, T2);
  assert.ok(r.ok);
  assert.deepEqual(dueItemsOf(r.items).map((i) => [i.title, i.amount, i.done]), [['Fee 2', 250, true]]);
  assert.equal(setDueItemDone(r.items, id(1), true, T2), r.items, 'ticking an item that is ticked changes nothing');
  assert.equal(dueEntry(r.items, id(1))?.t, T2);
  const gone = removeDueItem(r.items, id(1), T2);
  assert.deepEqual(dueItemsOf(gone), []);
  assert.equal(removeDueItem(gone, id(1), T2), gone);
  assert.equal(editDueItem(gone, id(1), { kind: 'todo', title: 'x', date: '', amount: 0 }, T2).ok, false);
  assert.equal(editDueItem(r.items, id(1), { kind: 'todo', title: '', date: '', amount: 0 }, T2).ok, false);
  assert.equal(dueEntry(gone, id(1)), null);
});

test('the list is sorted and classified like before', () => {
  let g = add({}, 'Late', 1, { date: '2026-11-01' });
  g = add(g, 'Soon', 2, { date: '2026-11-12' });
  g = add(g, 'Undated', 3, { date: '' });
  const views = classifyDue(dueItemsOf(g), {}, '', '2026-11-09');
  assert.deepEqual(views.map((v) => [v.title, v.state]), [['Late', 'overdue'], ['Soon', 'soon'], ['Undated', 'nodate']]);
  const done = classifyDue(dueItemsOf(setDueItemDone(g, id(2), true, T2)), {}, '', '2026-11-09');
  assert.equal(done.find((v) => v.title === 'Soon')!.state, 'done');
});

test('items merge between phones: both kept, the later change wins, a removal wins over an older copy', () => {
  const a = add({}, 'From A', 1);
  const b = add({}, 'From B', 2);
  const m = mergeGoals(a, b);
  assert.deepEqual(dueItemsOf(m).map((i) => i.title).sort((x, y) => x.localeCompare(y)), ['From A', 'From B']);
  const gone = removeDueItem(a, id(1), T2);
  assert.deepEqual(dueItemsOf(mergeGoals(a, gone)), []);
  assert.equal(sameGoals(a, gone), false);
  assert.equal(sameGoals(a, setDueItemDone(a, id(1), true, T2)), false);
  assert.equal(sameGoals(m, mergeGoals(b, a)), true);
});

test('items from the server or a backup are validated; bad ones are dropped', () => {
  const good = add({}, 'Keep', 1, { kind: 'oneoff', amount: 50 });
  assert.deepEqual(cleanGoals(JSON.parse(JSON.stringify(good))), good);
  const base = { id: id(9), k: 'd', kind: 'todo', n: 'x', d: '', a: 0, f: 0, x: 0, t: T1 };
  for (const bad of [{ ...base, kind: 'loan' }, { ...base, n: '' }, { ...base, n: ' padded ' }, { ...base, d: 'soon' }, { ...base, a: 5 }, { ...base, f: 2 }, { ...base, kind: 'oneoff', a: -1 }, { ...base, t: 'later' }, { ...base, id: id(8) }]) {
    assert.deepEqual(cleanGoals({ [id(9)]: bad }), {}, JSON.stringify(bad));
  }
});

test('an imported list is brought across: removed items skipped, marks kept, same ids and times everywhere, nothing copied twice', () => {
  const imported = '2026-11-01T00:00:00.000Z';
  const item = (k: string, title: string, due: string | null, done = false, amount: number | null = null): DueItem => ({ k, kind: amount ? 'oneoff' : 'todo', title, due, amount, done });
  const block = { importedAt: imported, items: [item('a', 'Renew passport', '2026-12-15'), item('b', 'Annual fee', '2027-03-31', false, 12000), item('c', 'Call the bank', '2026-11-20', true), item('d', 'Gone', null)] };
  const marks = {
    a: { d: 1 as const, t: '2026-11-05T00:00:00.000Z' }, // ticked in the app after the import
    c: { d: 0 as const, t: '2026-10-01T00:00:00.000Z' }, // older than the import: the sheet's Done stands
    d: { d: 0 as const, t: '2026-11-06T00:00:00.000Z', x: 1 as const }, // removed in the app
  };
  const r = migrateDue(block, marks, {});
  assert.equal(r.added, 3);
  const list = dueItemsOf(r.items);
  assert.deepEqual(list.map((i) => [i.title, i.done, i.amount]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))), [['Annual fee', false, 12000], ['Call the bank', true, null], ['Renew passport', true, null]]);
  assert.ok(list.every((i) => UUID_RE.test(i.k)));
  assert.deepEqual(migrateDue(block, marks, {}).items, r.items, 'the same result every time');
  assert.deepEqual(migrateDue(block, marks, r.items), { items: r.items, added: 0 }, 'migrating again adds nothing');
  const edited = editDueItem(r.items, migratedDueId('a'), { kind: 'todo', title: 'Renew passport (urgent)', date: '2026-12-01', amount: 0 }, T2);
  assert.ok(edited.ok);
  assert.equal(dueItemsOf(migrateDue(block, marks, edited.items).items).find((i) => i.k === migratedDueId('a'))!.title, 'Renew passport (urgent)', 'what was changed in the app is kept');
  assert.deepEqual(migrateDue(null, marks, {}), { items: {}, added: 0 });
  assert.notEqual(migratedDueId('a'), migratedDueId('b'));
});

test('the calendar cancels the event of an item that was ticked, removed or renamed, and only those', () => {
  let g = add({}, 'Pay rent', 1, { date: '2026-12-01' });
  g = add(g, 'Book tickets', 2, { date: '2026-12-02' });
  g = add(g, 'Call mum', 3, { date: '2026-12-03' });
  g = add(g, 'Stay as it is', 4, { date: '2026-12-04' });
  const sent = afterExport({}, classifyDue(dueItemsOf(g), {}, '', '2026-11-09'), []);
  assert.equal(Object.keys(sent).length, 4);
  assert.deepEqual(toCancel(sent, dueItemsOf(g), {}, ''), [], 'nothing changed: nothing to cancel');
  const ticked = setDueItemDone(g, id(1), true, T2);
  const removed = removeDueItem(ticked, id(2), T2);
  const renamed = editDueItem(removed, id(3), { kind: 'todo', title: 'Call mother', date: '2026-12-03', amount: 0 }, T2);
  assert.ok(renamed.ok);
  const cancelled = toCancel(sent, dueItemsOf(renamed.items), {}, '').map((e) => e.title);
  assert.deepEqual(cancelled, ['Pay rent', 'Book tickets', 'Call mum']);
});

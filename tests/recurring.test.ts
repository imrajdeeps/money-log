import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeRecurring, addRecurring, cleanRecurring, editRecurring, markHandled, mergeRecurring, recurringThisMonth, removeRecurring, sameRecurring, scheduledDate } from '../src/recurring.ts';
import type { RecurInput, Recurring } from '../src/recurring.ts';

const T = (d: number) => `2026-11-${String(d).padStart(2, '0')}T10:00:00.000Z`;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rent: RecurInput = { category: 'Rent', amount: 20000, day: 5, method: 'UPI', note: 'flat' };
const sip: RecurInput = { category: 'Savings', amount: 5000, day: 31, method: null, note: '' };

function two(): Recurring {
  const a = addRecurring({}, rent, T(1), U(1));
  assert.ok(a.ok);
  const b = addRecurring(a.items, sip, T(1), U(2));
  assert.ok(b.ok);
  return b.items;
}

test('adding checks the category, amount, day, method and note, and tidies the text', () => {
  const bad = (over: Partial<RecurInput>) => addRecurring({}, { ...rent, ...over }, T(1));
  for (const over of [{ category: '  ' }, { amount: 0 }, { amount: -5 }, { amount: 1.234 }, { amount: NaN }, { amount: 1e9 }, { day: 0 }, { day: 32 }, { day: 2.5 }, { method: 'Crypto' as never }, { note: 'x'.repeat(201) }]) {
    assert.equal(bad(over).ok, false, JSON.stringify(over));
  }
  const ok = addRecurring({}, { ...rent, category: '  Rent   ', note: ' flat ' }, T(1), U(1));
  assert.ok(ok.ok && ok.items[U(1)]!.c === 'Rent' && ok.items[U(1)]!.n === 'flat' && ok.items[U(1)]!.l === '');
});

test('a short month uses its last day, and the list shows what this month still has to log', () => {
  const items = two();
  assert.equal(scheduledDate(items[U(2)]!, '2026-11'), '2026-11-30', '31 in a 30-day month');
  assert.equal(scheduledDate(items[U(2)]!, '2027-02'), '2027-02-28');
  assert.equal(scheduledDate(items[U(2)]!, '2028-02'), '2028-02-29', 'leap year');
  const d = recurringThisMonth(items, '2026-11-10');
  assert.deepEqual(d.map((x) => [x.item.c, x.date, x.state]), [['Rent', '2026-11-05', 'due'], ['Savings', '2026-11-30', 'upcoming']]);
  assert.equal(recurringThisMonth(items, '2026-11-05')[0]!.state, 'due', 'due on the day itself');
  assert.equal(recurringThisMonth(items, '2026-11-04')[0]!.state, 'upcoming');
});

test('once handled for a month it is not offered again until the next month, and only one month is offered', () => {
  let items = two();
  items = markHandled(items, U(1), '2026-11', T(10));
  assert.deepEqual(recurringThisMonth(items, '2026-11-20').map((x) => x.item.c), ['Savings']);
  assert.equal(markHandled(items, U(1), '2026-11', T(11)), items, 'handling twice changes nothing');
  assert.equal(markHandled(items, U(1), '2026-10', T(11)), items, 'an older month changes nothing');
  assert.deepEqual(recurringThisMonth(items, '2026-12-06').map((x) => x.item.c), ['Rent', 'Savings'], 'next month it comes back');
  assert.equal(recurringThisMonth(items, '2027-03-06').length, 2, 'months skipped are not piled up');
});

test('editing keeps what was logged; removing hides it for good but keeps the mark for other phones', () => {
  let items = markHandled(two(), U(1), '2026-11', T(2));
  const e = editRecurring(items, U(1), { ...rent, amount: 21000 }, T(3));
  assert.ok(e.ok);
  assert.equal(e.ok && e.items[U(1)]!.l, '2026-11');
  assert.equal(editRecurring(items, U(9), rent, T(3)).ok, false, 'unknown id');
  items = removeRecurring(items, U(1), T(4));
  assert.equal(items[U(1)]!.x, 1);
  assert.deepEqual(activeRecurring(items).map((x) => x.c), ['Savings']);
  assert.equal(recurringThisMonth(items, '2026-12-20').some((x) => x.item.c === 'Rent'), false);
  assert.equal(editRecurring(items, U(1), rent, T(5)).ok, false, 'a removed one cannot be edited');
});

test('merging: the later edit wins, but a month logged anywhere stays logged', () => {
  const base = two();
  // phone A logs November for Rent; phone B (older, unsynced edit) changes the amount later
  const a = markHandled(base, U(1), '2026-11', T(10));
  const b = editRecurring(base, U(1), { ...rent, amount: 22000 }, T(12));
  assert.ok(b.ok);
  const merged = mergeRecurring(a, b.ok ? b.items : base);
  assert.equal(merged[U(1)]!.a, 22000, 'the later edit wins');
  assert.equal(merged[U(1)]!.l, '2026-11', 'the logged month survives');
  assert.ok(sameRecurring(merged, mergeRecurring(merged, merged)), 'merging with itself changes nothing');
  assert.ok(sameRecurring(mergeRecurring(a, b.ok ? b.items : base), mergeRecurring(b.ok ? b.items : base, a)), 'order does not matter');
  const gone = removeRecurring(base, U(2), T(13));
  assert.equal(mergeRecurring(base, gone)[U(2)]!.x, 1, 'a removal on another phone reaches this one');
});

test('what comes from the server is checked: malformed items are dropped, good ones kept', () => {
  const good = two();
  assert.deepEqual(cleanRecurring(JSON.parse(JSON.stringify(good))), good);
  const evil = { ...good, 'not-a-uuid': good[U(1)], [U(3)]: { ...good[U(1)], id: U(4) }, [U(5)]: { ...good[U(1)], id: U(5), a: -1 }, [U(6)]: { ...good[U(1)], id: U(6), d: 40 }, [U(7)]: { ...good[U(1)], id: U(7), l: 'sometime' }, [U(8)]: { ...good[U(1)], id: U(8), t: 'x' }, [U(9)]: { ...good[U(1)], id: U(9), m: 'Barter' } };
  assert.deepEqual(Object.keys(cleanRecurring(evil)).sort(), [U(1), U(2)]);
  for (const junk of [null, undefined, 5, 'x', []]) assert.deepEqual(cleanRecurring(junk), {});
});

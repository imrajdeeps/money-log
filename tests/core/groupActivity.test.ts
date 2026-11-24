import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SEEN, groupActivity, seenKeys } from '../../src/core/groupActivity.ts';
import { makeEntry } from '../../src/core/logic.ts';
import type { Entry } from '../../src/core/logic.ts';
import type { Settlement } from '../../src/core/groups.ts';

const ME = '00000000-0000-4000-8000-0000000000a1';
const PRIYA = '00000000-0000-4000-8000-0000000000b2';
const AMIT = '00000000-0000-4000-8000-0000000000b3';
const G = '00000000-0000-4000-8000-0000000000c1';
const name = (u: string | null) => (u === ME ? 'You' : u === PRIYA ? 'Priya' : u === AMIT ? 'Amit' : '?');

const entry = (id: string, owner: string, amount: number, created: string, updated = created, over: Partial<Entry> = {}): Entry =>
  ({ ...makeEntry({ amount, category: 'Dinner', date: '2026-11-11', method: null, note: '' }, created), id, owner_id: owner, group_id: G, paid_by: owner, shares: { [ME]: amount / 2, [owner]: amount / 2 }, updated_at: updated, ...over });
const settle = (id: string, by: string, from: string, to: string, amount: number, created: string): Settlement =>
  ({ id, group_id: G, from_user: from, to_user: to, amount, settle_date: '2026-11-11', created_by: by, created_at: created, updated_at: created, deleted_at: null, dirty: 0 });

const NOW_ENTRIES = (e: Entry[], st: Settlement[] = []) => seenKeys(e, st, G);

test('nothing is listed on a first visit (nothing remembered) or when nobody is signed in', () => {
  const e = [entry('e1', PRIYA, 1200, '2026-11-11T10:00:00.000Z')];
  assert.deepEqual(groupActivity(e, [], G, ME, null, name), { items: [], more: 0 });
  assert.deepEqual(groupActivity(e, [], G, null, [], name), { items: [], more: 0 });
});

test('others\' new and changed expenses and payments that were not seen, newest first; never your own', () => {
  const before = [entry('old', PRIYA, 100, '2026-11-01T10:00:00.000Z'), entry('edited', AMIT, 300, '2026-11-02T10:00:00.000Z')];
  const seen = NOW_ENTRIES(before); // what the last look saw
  const entries = [
    ...before.map((e) => (e.id === 'edited' ? { ...e, updated_at: '2026-11-12T10:00:00.000Z' } : e)), // Amit edited it after the look
    entry('new', PRIYA, 1200, '2026-11-11T10:00:00.000Z'),
    entry('mine', ME, 999, '2026-11-13T10:00:00.000Z'),
    entry('gone', PRIYA, 50, '2026-11-11T11:00:00.000Z', '2026-11-11T11:00:00.000Z', { deleted_at: '2026-11-12T00:00:00.000Z' }),
    entry('elsewhere', PRIYA, 70, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', { group_id: '00000000-0000-4000-8000-0000000000c9' }),
  ];
  const settlements = [settle('s1', AMIT, AMIT, ME, 500, '2026-11-13T09:00:00.000Z'), settle('s2', ME, ME, AMIT, 5, '2026-11-13T10:00:00.000Z')];
  const r = groupActivity(entries, settlements, G, ME, seen, name);
  assert.deepEqual(r.items.map((a) => a.kind), ['paid', 'changed', 'added']);
  assert.deepEqual(r.items.map((a) => a.text), ['Amit recorded that Amit paid You ₹500', 'Amit changed ₹300 (Dinner)', 'Priya added ₹1,200 (Dinner)']);
  assert.equal(r.more, 0);
});

test('an expense made offline with an old time on the other phone still shows when it arrives after the last look', () => {
  const seen = NOW_ENTRIES([entry('a', PRIYA, 100, '2026-11-09T10:00:00.000Z')]);
  // made at 10:00 on Priya\'s phone (before my look), but it only reached this phone afterwards: it is not in what I saw
  const offline = entry('offline', PRIYA, 450, '2026-11-10T10:00:00.000Z');
  const r = groupActivity([entry('a', PRIYA, 100, '2026-11-09T10:00:00.000Z'), offline], [], G, ME, seen, name);
  assert.deepEqual(r.items.map((a) => a.text), ['Priya added ₹450 (Dinner)']);
});

test('what was seen is the newest rows, as keys, and nothing of other groups', () => {
  const a = entry('a', PRIYA, 100, '2026-11-09T10:00:00.000Z');
  const other = entry('x', PRIYA, 100, '2026-11-09T10:00:00.000Z', undefined, { group_id: '00000000-0000-4000-8000-0000000000c9' });
  assert.deepEqual(seenKeys([a, other], [settle('s1', AMIT, AMIT, ME, 5, '2026-11-10T00:00:00.000Z')], G), ['s1|2026-11-10T00:00:00.000Z', 'a|2026-11-09T10:00:00.000Z']);
  const many = Array.from({ length: MAX_SEEN + 50 }, (_, i) => entry(`e${i}`, PRIYA, 1, `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00.000Z`));
  assert.equal(seenKeys(many, [], G).length, MAX_SEEN);
});

test('at most five are listed and the rest are counted', () => {
  const entries = Array.from({ length: 8 }, (_, i) => entry(`e${i}`, PRIYA, 100 + i, `2026-11-1${i}T10:00:00.000Z`));
  const r = groupActivity(entries, [], G, ME, [], name);
  assert.equal(r.items.length, 5);
  assert.equal(r.more, 3);
  assert.equal(r.items[0]!.text.includes('₹107'), true, 'newest first');
});

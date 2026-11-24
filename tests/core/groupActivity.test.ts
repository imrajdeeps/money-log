import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupActivity } from '../../src/core/groupActivity.ts';
import { makeEntry } from '../../src/core/logic.ts';
import type { Entry } from '../../src/core/logic.ts';
import type { Settlement } from '../../src/core/groups.ts';

const ME = '00000000-0000-4000-8000-0000000000a1';
const PRIYA = '00000000-0000-4000-8000-0000000000b2';
const AMIT = '00000000-0000-4000-8000-0000000000b3';
const G = '00000000-0000-4000-8000-0000000000c1';
const SINCE = '2026-11-10T00:00:00.000Z';
const name = (u: string | null) => (u === ME ? 'You' : u === PRIYA ? 'Priya' : u === AMIT ? 'Amit' : '?');

const entry = (id: string, owner: string, amount: number, created: string, updated = created, over: Partial<Entry> = {}): Entry =>
  ({ ...makeEntry({ amount, category: 'Dinner', date: '2026-11-11', method: null, note: '' }, created), id, owner_id: owner, group_id: G, paid_by: owner, shares: { [ME]: amount / 2, [owner]: amount / 2 }, updated_at: updated, ...over });
const settle = (id: string, by: string, from: string, to: string, amount: number, created: string): Settlement =>
  ({ id, group_id: G, from_user: from, to_user: to, amount, settle_date: '2026-11-11', created_by: by, created_at: created, updated_at: created, deleted_at: null, synced_at: created } as Settlement);

test('nothing is listed on a first visit (no last look) or when nobody is signed in', () => {
  const e = [entry('e1', PRIYA, 1200, '2026-11-11T10:00:00.000Z')];
  assert.deepEqual(groupActivity(e, [], G, ME, null, name), { items: [], more: 0 });
  assert.deepEqual(groupActivity(e, [], G, null, SINCE, name), { items: [], more: 0 });
});

test('others\' new and changed expenses and payments since the last look, newest first; never your own', () => {
  const entries = [
    entry('old', PRIYA, 100, '2026-11-01T10:00:00.000Z'), // before the last look
    entry('new', PRIYA, 1200, '2026-11-11T10:00:00.000Z'),
    entry('edited', AMIT, 300, '2026-11-02T10:00:00.000Z', '2026-11-12T10:00:00.000Z'),
    entry('mine', ME, 999, '2026-11-13T10:00:00.000Z'),
    entry('gone', PRIYA, 50, '2026-11-11T11:00:00.000Z', '2026-11-11T11:00:00.000Z', { deleted_at: '2026-11-12T00:00:00.000Z' }),
    entry('elsewhere', PRIYA, 70, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', { group_id: '00000000-0000-4000-8000-0000000000c9' }),
  ];
  const settlements = [settle('s1', AMIT, AMIT, ME, 500, '2026-11-13T09:00:00.000Z'), settle('s2', ME, ME, AMIT, 5, '2026-11-13T10:00:00.000Z')];
  const r = groupActivity(entries, settlements, G, ME, SINCE, name);
  assert.deepEqual(r.items.map((a) => a.kind), ['paid', 'changed', 'added']);
  assert.deepEqual(r.items.map((a) => a.text), ['Amit recorded that Amit paid You ₹500', 'Amit changed ₹300 (Dinner)', 'Priya added ₹1,200 (Dinner)']);
  assert.equal(r.more, 0);
});

test('at most five are listed and the rest are counted', () => {
  const entries = Array.from({ length: 8 }, (_, i) => entry(`e${i}`, PRIYA, 100 + i, `2026-11-1${i}T10:00:00.000Z`));
  const r = groupActivity(entries, [], G, ME, SINCE, name);
  assert.equal(r.items.length, 5);
  assert.equal(r.more, 3);
  assert.equal(r.items[0]!.text.includes('₹107'), true, 'newest first');
});

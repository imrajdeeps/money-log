import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupSummary, tripDatesLabel, tripLength, wholePercents } from '../../src/core/groupSummary.ts';
import type { Entry } from '../../src/core/logic.ts';

const G = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let n = 0;
const e = (o: Partial<Entry>): Entry => ({
  id: `e${++n}`, owner_id: A, entry_date: '2026-12-02', category: 'Food', amount: 100, note: '', method: null, created_at: '2026-12-02T10:00:00Z',
  updated_at: '2026-12-02T10:00:00Z', deleted_at: null, exported_at: null, group_id: G, paid_by: A, shares: { [A]: 50, [B]: 50 }, share_of: null, dirty: 0, ...o,
});

test('the total, who paid and whose share, by category and by day', () => {
  const s = groupSummary([
    e({ amount: 1000, category: 'Hotel', entry_date: '2026-12-01', paid_by: A, shares: { [A]: 500, [B]: 500 } }),
    e({ amount: 300, category: 'food', entry_date: '2026-12-02', paid_by: B, shares: { [A]: 100, [B]: 200 } }),
    e({ amount: 200, category: 'Food', entry_date: '2026-12-02', paid_by: B, shares: { [A]: 100, [B]: 100 } }),
  ], G);
  assert.equal(s.count, 3);
  assert.equal(s.total, 1500);
  assert.deepEqual(s.perPerson, [{ user: A, paid: 1000, share: 700 }, { user: B, paid: 500, share: 800 }]);
  assert.deepEqual(s.byCategory.map((c) => [c.category, c.total]), [['Hotel', 1000], ['Food', 500]]); // "food" and "Food" are one line
  assert.ok(Math.abs(s.byCategory[0]!.share - 2 / 3) < 1e-9);
  assert.deepEqual(s.byDay, [{ date: '2026-12-01', total: 1000 }, { date: '2026-12-02', total: 500 }]);
});

test('other groups, deleted expenses and (when asked) other months are left out', () => {
  const s = groupSummary([
    e({ amount: 100 }),
    e({ amount: 999, group_id: '22222222-2222-4222-8222-222222222222' }),
    e({ amount: 888, deleted_at: '2026-12-03T00:00:00Z' }),
    e({ amount: 50, entry_date: '2026-11-30', shares: { [A]: 25, [B]: 25 } }),
  ], G);
  assert.equal(s.total, 150);
  const dec = groupSummary([e({ amount: 100 }), e({ amount: 50, entry_date: '2026-11-30' })], G, { month: '2026-12' });
  assert.equal(dec.total, 100);
  assert.equal(dec.count, 1);
});

test('paisa add up exactly and an empty group is all zeros', () => {
  const s = groupSummary([e({ amount: 0.1, shares: { [A]: 0.05, [B]: 0.05 } }), e({ amount: 0.2, shares: { [A]: 0.1, [B]: 0.1 } })], G);
  assert.equal(s.total, 0.3);
  assert.deepEqual(groupSummary([], G), { count: 0, total: 0, perPerson: [], byCategory: [], byDay: [] });
});

test('trip length and dates label', () => {
  assert.equal(tripLength('2026-12-01', '2026-12-05'), 5);
  assert.equal(tripLength('2026-12-01', '2026-12-01'), 1);
  assert.equal(tripLength('2026-12-05', '2026-12-01'), null);
  assert.equal(tripLength(null, '2026-12-01'), null);
  assert.match(tripDatesLabel('2026-12-01', '2026-12-05')!, /1 Dec.* to 5 Dec/);
  assert.match(tripDatesLabel('2026-12-01', null)!, /^From 1 Dec/);
  assert.match(tripDatesLabel(null, '2026-12-05')!, /^Until 5 Dec/);
  assert.equal(tripDatesLabel(null, null), null);
});

test('whole percentages always add up to 100', () => {
  assert.deepEqual(wholePercents([0.625, 0.375]), [63, 37]);
  assert.deepEqual(wholePercents([1 / 3, 1 / 3, 1 / 3]), [34, 33, 33]);
  assert.deepEqual(wholePercents([1]), [100]);
  assert.deepEqual(wholePercents([]), []);
  assert.deepEqual(wholePercents([0, 0]), [0, 0]);
  for (const f of [[0.5, 0.25, 0.25], [0.07, 0.93], [0.333, 0.333, 0.334], [0.1, 0.2, 0.3, 0.4]]) assert.equal(wholePercents(f).reduce((a, b) => a + b, 0), 100);
});

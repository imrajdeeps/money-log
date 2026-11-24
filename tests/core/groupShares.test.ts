import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanShareSwitches, countsByDefault, countsShare, shareEntries } from '../../src/core/groupShares.ts';
import { budgetEntries, makeEntry } from '../../src/core/logic.ts';
import type { Entry } from '../../src/core/logic.ts';

const ME = '00000000-0000-4000-8000-0000000000a1';
const PRIYA = '00000000-0000-4000-8000-0000000000b2';
const FLAT = '00000000-0000-4000-8000-0000000000c1';
const TRIP = '00000000-0000-4000-8000-0000000000c2';
const groups = [{ id: FLAT, kind: 'flatmates' as const }, { id: TRIP, kind: 'trip' as const }];

const shared = (id: string, owner: string, group: string, amount: number, shares: Record<string, number>, over: Partial<Entry> = {}): Entry =>
  ({ ...makeEntry({ amount, category: 'Rent', date: '2026-11-05', method: null, note: '' }, '2026-11-05T10:00:00.000Z'), id, owner_id: owner, group_id: group, paid_by: owner, shares, ...over });

test('flatmates and couples count by default; family and trips do not; the person\'s own choice wins', () => {
  assert.equal(countsByDefault('flatmates'), true);
  assert.equal(countsByDefault('couple'), true);
  assert.equal(countsByDefault('family'), false);
  assert.equal(countsByDefault('trip'), false);
  assert.equal(countsShare(groups[0]!, {}), true);
  assert.equal(countsShare(groups[1]!, {}), false);
  assert.equal(countsShare(groups[0]!, { [FLAT]: false }), false);
  assert.equal(countsShare(groups[1]!, { [TRIP]: true }), true);
});

test('a friend\'s expense in a group that counts becomes your share, as a private payment of your own', () => {
  const rent = shared('e1', PRIYA, FLAT, 9000, { [ME]: 3000, [PRIYA]: 6000 });
  const out = shareEntries([rent], [], groups, {}, ME);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0]!.id, out[0]!.owner_id, out[0]!.group_id, out[0]!.amount, out[0]!.share_of, out[0]!.category], ['share:e1', ME, null, 3000, 'e1', 'Rent']);
  // and the one budget rule takes it from there, at that amount
  assert.equal(budgetEntries(out, ME)[0]!.amount, 3000);
});

test('what must NOT count: your own expense, a group that is off, a deleted one, an expense you owe nothing on', () => {
  const mine = shared('e1', ME, FLAT, 9000, { [ME]: 3000, [PRIYA]: 6000 });
  const trip = shared('e2', PRIYA, TRIP, 500, { [ME]: 250, [PRIYA]: 250 });
  const gone = shared('e3', PRIYA, FLAT, 100, { [ME]: 50, [PRIYA]: 50 }, { deleted_at: '2026-11-06T10:00:00.000Z' });
  const none = shared('e4', PRIYA, FLAT, 100, { [PRIYA]: 100 });
  assert.deepEqual(shareEntries([mine, trip, gone, none], [], groups, {}, ME), []);
  assert.equal(shareEntries([trip], [], groups, { [TRIP]: true }, ME).length, 1, 'the trip counts once its switch is on');
  assert.deepEqual(shareEntries([shared('e5', PRIYA, FLAT, 100, { [ME]: 50 })], [], groups, {}, null), [], 'nobody signed in');
});

test('an expense whose share you already added by hand is never counted twice', () => {
  const rent = shared('e1', PRIYA, FLAT, 9000, { [ME]: 3000, [PRIYA]: 6000 });
  const byHand: Entry = { ...makeEntry({ amount: 3000, category: 'Rent', date: '2026-11-05', method: null, note: 'my share', shareOf: 'e1' }, '2026-11-06T10:00:00.000Z'), owner_id: ME };
  assert.deepEqual(shareEntries([rent], [byHand], groups, {}, ME), []);
  const removed = { ...byHand, deleted_at: '2026-11-07T10:00:00.000Z' };
  assert.equal(shareEntries([rent], [removed], groups, {}, ME).length, 1, 'if the manual one was deleted, the share counts again');
});

test('choices read from storage are checked', () => {
  assert.deepEqual(cleanShareSwitches({ [FLAT.toUpperCase()]: false, [TRIP]: true, nope: true, [PRIYA]: 'yes' }), { [FLAT]: false, [TRIP]: true });
  for (const bad of [null, [], 'x', 5]) assert.deepEqual(cleanShareSwitches(bad), {});
});

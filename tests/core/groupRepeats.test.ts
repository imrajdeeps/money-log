import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeRepeats, changeFrom, cleanGroupRepeat, inRepeat, nextMonth, prevMonth, repeatDate, repeatState, scaleShares, sharesTotal, skipMonth } from '../../src/core/groupRepeats.ts';
import type { GroupRepeat } from '../../src/core/groupRepeats.ts';
import type { Entry } from '../../src/core/logic.ts';
import { cleanEntry, mergeRemote } from '../../src/core/logic.ts';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = U(1);
const AAKASH = U(2);
const RIA = U(3);
const G = U(10);
const T = '2026-11-01T10:00:00.000Z';

const rent = (over: Partial<GroupRepeat> = {}): GroupRepeat => ({
  id: U(20), group_id: G, category: 'Rent', note: '', amount: 15000, day: 1, paid_by: ME, shares: { [ME]: 9000, [AAKASH]: 6000 },
  done_through: '2026-11', created_by: ME, created_at: T, change: 'add', change_month: null, changed_by: ME, changed_at: T, stopped_at: null, ...over,
});

const logged = (month: string, by = AAKASH, over: Partial<Entry> = {}): Entry => ({
  id: U(30), owner_id: by, entry_date: `${month}-01`, kind: 'out', category: 'Rent', amount: 15000, note: '', method: null, created_at: T, updated_at: T,
  deleted_at: null, exported_at: null, group_id: G, paid_by: ME, shares: { [ME]: 9000, [AAKASH]: 6000 }, share_of: null, repeat_id: U(20), repeat_month: month, dirty: 0, ...over,
});

test('months roll over the year, and a day the month does not have moves to its last day', () => {
  assert.equal(nextMonth('2026-11'), '2026-12');
  assert.equal(nextMonth('2026-12'), '2027-01');
  assert.equal(prevMonth('2027-01'), '2026-12');
  assert.equal(prevMonth('2026-11'), '2026-10');
  assert.equal(repeatDate(31, '2026-11'), '2026-11-30');
  assert.equal(repeatDate(30, '2027-02'), '2027-02-28');
  assert.equal(repeatDate(29, '2028-02'), '2028-02-29');
  assert.equal(repeatDate(1, '2026-12'), '2026-12-01');
});

test('on its day and after, a month that is not done is due; before its day it is upcoming', () => {
  const r = rent({ day: 5 });
  assert.deepEqual(repeatState(r, '2026-12-05', []), { kind: 'due', month: '2026-12', date: '2026-12-05', today: true });
  assert.deepEqual(repeatState(r, '2026-12-09', []), { kind: 'due', month: '2026-12', date: '2026-12-05', today: false });
  assert.deepEqual(repeatState(r, '2026-12-04', []), { kind: 'upcoming', month: '2026-12', date: '2026-12-05' });
  // never done (a server row that lost its first month): this month is offered all the same
  assert.equal(repeatState(rent({ done_through: null }), '2026-12-01', []).kind, 'due');
  // months the app was not opened in are not offered: only this one
  assert.deepEqual(repeatState(rent({ done_through: '2026-08' }), '2026-12-02', []), { kind: 'due', month: '2026-12', date: '2026-12-01', today: false });
});

test('a done month says whether it was logged (with its expense), skipped (and by whom) or just done, and when the next one is', () => {
  const r = rent({ done_through: '2026-12' });
  const e = logged('2026-12');
  assert.deepEqual(repeatState(r, '2026-12-03', [e]), { kind: 'logged', month: '2026-12', entry: e, next: '2027-01-01' });
  // a deleted expense is not the month's log; the month stays done
  assert.deepEqual(repeatState(r, '2026-12-03', [{ ...e, deleted_at: T }]), { kind: 'done', month: '2026-12', next: '2027-01-01' });
  const skipped = rent({ done_through: '2026-12', change: 'skip', change_month: '2026-12', changed_by: AAKASH });
  assert.deepEqual(repeatState(skipped, '2026-12-03', []), { kind: 'skipped', month: '2026-12', by: AAKASH, next: '2027-01-01' });
  // next month skipped ahead too: the next one after that
  const ahead = rent({ done_through: '2027-01', change: 'skip', change_month: '2027-01' });
  assert.deepEqual(repeatState(ahead, '2026-12-03', [e]), { kind: 'logged', month: '2026-12', entry: e, next: '2027-02-01' });
});

test('Skip is for this month while it is open, then next month, then nothing; a change starts at the first month not done', () => {
  assert.equal(skipMonth({ done_through: '2026-11' }, '2026-12-10'), '2026-12');
  assert.equal(skipMonth({ done_through: null }, '2026-12-10'), '2026-12');
  assert.equal(skipMonth({ done_through: '2026-12' }, '2026-12-10'), '2027-01');
  assert.equal(skipMonth({ done_through: '2027-01' }, '2026-12-10'), null);
  assert.equal(changeFrom({ done_through: '2026-11' }, '2026-12-10'), '2026-12');
  assert.equal(changeFrom({ done_through: '2026-12' }, '2026-12-10'), '2027-01');
  assert.equal(changeFrom({ done_through: '2027-01' }, '2026-12-10'), '2027-02');
});

test('only the people in it act on it; the group page lists the ones still going by their day', () => {
  const r = rent();
  assert.ok(inRepeat(r, ME) && inRepeat(r, AAKASH));
  assert.ok(!inRepeat(r, RIA) && !inRepeat(r, null));
  assert.ok(inRepeat(rent({ paid_by: RIA }), RIA));
  const list = [rent({ id: U(21), day: 10, category: 'Wifi' }), rent({ id: U(22), stopped_at: T }), rent({ id: U(23), group_id: U(11) }), rent()];
  assert.deepEqual(activeRepeats(list, G).map((x) => x.id), [U(20), U(21)]);
});

test('a new amount scales the shares in proportion, in paise that add up exactly', () => {
  assert.deepEqual(scaleShares({ [ME]: 9000, [AAKASH]: 6000 }, 16000), { [ME]: 9600, [AAKASH]: 6400 });
  const odd = scaleShares({ [ME]: 1, [AAKASH]: 1, [RIA]: 1 }, 100);
  assert.equal(sharesTotal(odd), 100);
  assert.deepEqual(Object.values(odd).sort(), [33.33, 33.33, 33.34]);
  assert.deepEqual(scaleShares({ [ME]: 0, [AAKASH]: 0 }, 50), { [ME]: 50, [AAKASH]: 0 });
  assert.deepEqual(scaleShares({}, 50), {});
});

test('rows from the server are checked and anything malformed is dropped', () => {
  const row = { ...rent(), amount: '15000.00', shares: { [ME]: 9000, [AAKASH]: 6000 }, synced_at: T };
  const ok = cleanGroupRepeat(row);
  assert.ok(ok);
  assert.equal(ok.amount, 15000);
  assert.equal(cleanGroupRepeat({ ...row, id: 'nope' }), null);
  assert.equal(cleanGroupRepeat({ ...row, amount: 0 }), null);
  assert.equal(cleanGroupRepeat({ ...row, shares: { [ME]: 9000, [AAKASH]: 5000 } }), null, 'shares that do not add up');
  assert.equal(cleanGroupRepeat({ ...row, day: 32 }), null);
  assert.equal(cleanGroupRepeat({ ...row, done_through: '2026-13' }), null);
  assert.equal(cleanGroupRepeat({ ...row, change: 'log' }), null);
  assert.equal(cleanGroupRepeat({ ...row, stopped_at: 'later' }), null);
  assert.equal(cleanGroupRepeat({ ...row, category: '' }), null);
  assert.equal(cleanGroupRepeat(null), null);
});

test('an expense keeps the repeat and month it was logged for only when both are well formed and it is shared', () => {
  const base = { ...logged('2026-12'), dirty: undefined };
  const e = cleanEntry(base);
  assert.equal(e?.repeat_id, U(20));
  assert.equal(e?.repeat_month, '2026-12');
  assert.equal(cleanEntry({ ...base, repeat_month: '2026-1' })?.repeat_id, undefined);
  assert.equal(cleanEntry({ ...base, repeat_id: 'x' })?.repeat_month, undefined);
  const priv = cleanEntry({ ...base, group_id: null, paid_by: null, shares: null });
  assert.ok(priv && !('repeat_id' in priv));
  const plain = cleanEntry({ ...base, repeat_id: null, repeat_month: null });
  assert.ok(plain && !('repeat_id' in plain), 'an ordinary expense has no link at all, so it compares equal to one saved before 2.2');
});

test('a local copy that wins the merge still takes the repeat link from the server (pulled before 2.2, or saved after a lost answer)', () => {
  const remote = { ...logged('2026-12'), dirty: 0 as const };
  const { repeat_id: _id, repeat_month: _m, ...local } = remote;
  const same = mergeRemote({ ...local, dirty: 0 }, remote);
  assert.equal(same.repeat_id, U(20));
  assert.equal(same.repeat_month, '2026-12');
  const newer = mergeRemote({ ...local, note: 'flat', updated_at: '2026-12-02T00:00:00.000Z', dirty: 1 }, remote);
  assert.equal(newer.note, 'flat', 'the newer local edit still wins');
  assert.equal(newer.repeat_id, U(20));
  assert.equal(newer.dirty, 1);
  const plain = { ...local, dirty: 0 as const };
  assert.equal(mergeRemote(plain, { ...plain }), plain, 'nothing to take: the same object comes back, so nothing is written');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNotices, dismissNotice, dismissedKeys, enabledKinds, setNoticeKind, showDismissedAgain } from '../../src/core/notifications.ts';
import type { NoticeInput } from '../../src/core/notifications.ts';
import { NOTICE_KINDS } from '../../src/core/noticeKinds.ts';
import type { NoticeKind } from '../../src/core/noticeKinds.ts';
import { NOTICE_SETTINGS_ID, cleanGoals, mergeGoals, noticeId, sameGoals } from '../../src/core/goals.ts';
import type { Goal, Goals } from '../../src/core/goals.ts';
import { makeBackup, parseBackup } from '../../src/data/backup.ts';

const TODAY = '2026-11-11';
const NOW = Date.UTC(2026, 10, 11, 10);
const DAY = 86_400_000;
const T1 = '2026-11-11T10:00:00.000Z';
const T2 = '2026-11-11T11:00:00.000Z';
const ALL = new Set<NoticeKind>(NOTICE_KINDS);
const NONE = new Set<string>();

const empty = (): NoticeInput => ({
  today: TODAY, nowMs: NOW, dueItems: [], recurring: [], budgetRows: [], goals: [], groups: [], netWorth: null, lastBackupMs: null, hasPayments: false,
  sync: { mode: 'idle', pending: 0, lastSync: NOW, error: null },
});
const run = (over: Partial<NoticeInput>, kinds: ReadonlySet<NoticeKind> = ALL, dismissed: ReadonlySet<string> = NONE) => buildNotices({ ...empty(), ...over }, kinds, dismissed);
const due = (k: string, title: string, date: string | null, done = false, amount: number | null = null) => ({ k, kind: 'todo' as const, title, due: date, amount, done });

test('nothing needs attention on a quiet day', () => {
  assert.deepEqual(run({}), []);
});

test('a due item shows 3 days before its date, on the day and while overdue, and not before, done, or without a date', () => {
  const r = run({ dueItems: [
    due('a', 'In 3 days', '2026-11-14'), due('b', 'In 4 days', '2026-11-15'), due('c', 'Today', TODAY), due('d', 'Yesterday', '2026-11-10'),
    due('e', 'Done one', '2026-11-12', true), due('f', 'No date', null), due('g', 'Long ago', '2026-10-01', false, 1200),
  ] });
  assert.deepEqual(r.map((n) => n.title).sort(), ['In 3 days is due in 3 days', 'Long ago is overdue by 41 days', 'Today is due today', 'Yesterday is overdue by 1 day'].sort());
  const yesterday = r.find((n) => n.key === 'due:d:overdue')!;
  assert.equal(yesterday.tone, 'attention');
  assert.equal(r.find((n) => n.key === 'due:c:today')!.tone, 'soon');
  assert.match(r.find((n) => n.key === 'due:g:overdue')!.detail, /₹1,200/);
  assert.deepEqual(yesterday.open, { to: 'plan', part: 'due' });
});

test('a due item that moves from soon to today to overdue gets a new key, so a dismissal does not hide the next stage', () => {
  const item = due('a', 'Fee', '2026-11-12');
  const soon = run({ dueItems: [item] })[0]!;
  const today = run({ today: '2026-11-12', dueItems: [item] })[0]!;
  const late = run({ today: '2026-11-13', dueItems: [item] })[0]!;
  assert.deepEqual([soon.key, today.key, late.key], ['due:a:soon', 'due:a:today', 'due:a:overdue']);
  assert.equal(run({ dueItems: [item] }, ALL, new Set([soon.key])).length, 0);
  assert.equal(run({ today: '2026-11-13', dueItems: [item] }, ALL, new Set([soon.key])).length, 1);
});

test('a recurring payment shows once its day has come and not before', () => {
  const item = { id: 'r1', c: 'Rent', a: 9000, d: 5, m: null, n: '', x: 0 as const, t: T1, l: '' };
  const r = run({ recurring: [{ item, date: '2026-11-05', state: 'due' }, { item: { ...item, id: 'r2', c: 'SIP' }, date: '2026-11-20', state: 'upcoming' }] });
  assert.deepEqual(r.map((n) => [n.key, n.title]), [['rec:r1:2026-11', 'Rent is waiting to be logged']]);
  assert.deepEqual(r[0]!.open, { to: 'settings', part: 'recurring' });
});

test('a budget shows at 80 percent used and when over; Saving, unbudgeted and untouched ones do not', () => {
  const row = (category: string, spent: number, planned: number, group: 'Spending' | 'Saving' = 'Spending', budgeted = true) => ({ category, group, spent, planned, left: planned - spent, budgeted });
  const r = run({ budgetRows: [row('Edge', 800, 1000), row('Below', 799, 1000), row('Over', 1200, 1000), row('Full', 1000, 1000), row('Savings', 5000, 1000, 'Saving'), row('NoBudget', 900, 0, 'Spending', false), row('Untouched', 0, 1000)] });
  assert.deepEqual(r.map((n) => n.key).sort(), ['bud:edge:2026-11:near', 'bud:full:2026-11:near', 'bud:over:2026-11:over']);
  assert.equal(r.find((n) => n.key.endsWith(':over'))!.tone, 'attention');
  assert.match(r.find((n) => n.key.includes('edge'))!.title, /used 80% of its budget/);
});

test('a goal shows when its date has passed, 30 days before it, or when it is behind; not when reached or on track', () => {
  const goal = (id: string, date: string, made = '2026-01-01'): Goal => ({ id, k: 'g', n: `G ${id}`, a: 1000, d: date, s: 0, c: '', b: made, x: 0, t: T1 });
  const entry = (id: string, date: string, fraction: number, line: NoticeInput['goals'][number]['line'], made?: string) => ({
    goal: goal(id, date, made), progress: { fromStart: 0, fromTopUps: 0, fromPayments: 0, saved: fraction * 1000, remaining: 1000 - fraction * 1000, fraction, reached: fraction >= 1 }, line,
  });
  const needs = { state: 'needs' as const, monthly: 100, months: 5 };
  const r = run({ goals: [
    entry('reached', '2026-11-01', 1, { state: 'reached' }),
    entry('passed', '2026-11-01', 0.5, { state: 'passed', remaining: 500 }),
    entry('in30', '2026-12-11', 0.9, needs), // exactly 30 days
    entry('in31', '2026-12-12', 0.9, needs, '2026-06-01'), // 31 days, saved well ahead of the time
    entry('behind', '2027-01-01', 0.5, needs), // 86% of the time gone, 50% saved
    entry('ontrack', '2027-01-01', 0.7, needs), // 86% gone, 70% saved: 16 points behind, within 25
  ] });
  assert.deepEqual(r.map((n) => n.key.split(':')[1]).sort(), ['behind', 'in30', 'passed']);
  assert.equal(r.find((n) => n.key.includes('passed'))!.tone, 'attention');
  assert.match(r.find((n) => n.key.includes('behind'))!.detail, /50% saved, 86% of the time gone/);
});

test('a group balance shows from one rupee either way, as a reminder, and opens that group', () => {
  const r = run({ groups: [{ id: 'g1', name: 'Trip', balance: 1 }, { id: 'g2', name: 'Flat', balance: -250 }, { id: 'g3', name: 'Family', balance: 0.5 }, { id: 'g4', name: 'Even', balance: 0 }] });
  assert.deepEqual(r.map((n) => n.key).sort(), ['grp:g1:owed', 'grp:g2:owe']);
  assert.ok(r.every((n) => n.tone === 'reminder'));
  assert.deepEqual(r.find((n) => n.key === 'grp:g2:owe')!.open, { to: 'group', id: 'g2' });
  assert.match(r.find((n) => n.key === 'grp:g2:owe')!.title, /you owe ₹250/);
});

test('net worth is asked for again after 30 days, and never before one has been entered', () => {
  const nw = (date: string) => ({ value: 1, date, previous: null, change: null });
  assert.deepEqual(run({ netWorth: null }), []);
  assert.deepEqual(run({ netWorth: nw('2026-10-12') }), [], '30 days old');
  const r = run({ netWorth: nw('2026-10-11') });
  assert.deepEqual(r.map((n) => n.key), ['networth:2026-11']);
  assert.match(r[0]!.detail, /31 days ago/);
});

test('a backup reminder shows when the phone holds payments and none was downloaded for 30 days', () => {
  assert.deepEqual(run({ hasPayments: false }), []);
  assert.equal(run({ hasPayments: true, lastBackupMs: null })[0]!.key, 'backup:2026-11');
  assert.match(run({ hasPayments: true, lastBackupMs: null })[0]!.detail, /not downloaded one yet/);
  assert.deepEqual(run({ hasPayments: true, lastBackupMs: NOW - 30 * DAY }), []);
  const old = run({ hasPayments: true, lastBackupMs: NOW - 31 * DAY });
  assert.match(old[0]!.detail, /31 days ago/);
  assert.deepEqual(old[0]!.open, { to: 'settings', part: 'backup' });
});

test('a sync problem shows when the last sync failed, or changes have waited more than a day; never on a phone that does not sync', () => {
  const sync = (over: Partial<NoticeInput['sync']>) => ({ ...empty().sync, ...over });
  assert.deepEqual(run({ sync: sync({ mode: 'local', pending: 5, lastSync: null }) }), []);
  assert.deepEqual(run({ sync: sync({ mode: 'signedout', pending: 5, lastSync: null }) }), []);
  assert.deepEqual(run({ sync: sync({ pending: 3, lastSync: NOW - DAY }) }), [], 'exactly a day');
  assert.equal(run({ sync: sync({ pending: 3, lastSync: NOW - DAY - 1 }) })[0]!.title, 'Changes are not reaching the cloud');
  assert.deepEqual(run({ sync: sync({ pending: 0, lastSync: NOW - 9 * DAY }) }), [], 'nothing waiting');
  const failing = run({ sync: sync({ mode: 'error', error: 'Server said no' }) });
  assert.deepEqual([failing[0]!.title, failing[0]!.detail, failing[0]!.tone], ['Sync is not working', 'Server said no', 'attention']);
});

test('the list is sorted needs attention, then coming up, then reminders, and kinds that are off or dismissed are left out', () => {
  const input: Partial<NoticeInput> = {
    dueItems: [due('s', 'Soon', '2026-11-13'), due('o', 'Late', '2026-11-01')],
    groups: [{ id: 'g', name: 'Trip', balance: 100 }],
    hasPayments: true,
  };
  const r = run(input);
  assert.deepEqual(r.map((n) => n.tone), ['attention', 'soon', 'reminder', 'reminder']);
  assert.deepEqual(run(input, new Set<NoticeKind>(['due'])).map((n) => n.kind), ['due', 'due']);
  assert.deepEqual(run(input, new Set<NoticeKind>()), []);
  assert.deepEqual(run(input, ALL, new Set(['due:o:overdue', 'backup:2026-11'])).map((n) => n.key), ['due:s:soon', 'grp:g:owed']);
});

test('a dismissal is one item per key, hides that key everywhere, and dismissing twice changes nothing', () => {
  let g: Goals = {};
  g = dismissNotice(g, 'due:a:soon', T1);
  assert.deepEqual([...dismissedKeys(g)], ['due:a:soon']);
  assert.equal(dismissNotice(g, 'due:a:soon', T2), g);
  g = dismissNotice(g, 'backup:2026-11', T2);
  assert.deepEqual([...dismissedKeys(g)].sort(), ['backup:2026-11', 'due:a:soon']);
  assert.equal(g[noticeId('due:a:soon')]!.k, 'k');
});

test('showing dismissed ones again brings them all back, and a later dismissal of the same key works again', () => {
  let g = dismissNotice(dismissNotice({}, 'a:1', T1), 'b:2', T1);
  g = showDismissedAgain(g, T2);
  assert.equal(dismissedKeys(g).size, 0);
  assert.equal(showDismissedAgain(g, T2), g, 'nothing left to bring back');
  g = dismissNotice(g, 'a:1', '2026-11-11T12:00:00.000Z');
  assert.deepEqual([...dismissedKeys(g)], ['a:1']);
});

test('only the newest 500 dismissals are kept', () => {
  let g: Goals = {};
  for (let i = 0; i < 520; i++) g = dismissNotice(g, `k:${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString());
  const keys = dismissedKeys(g);
  assert.equal(keys.size, 500);
  assert.ok(!keys.has('k:0') && !keys.has('k:19'));
  assert.ok(keys.has('k:20') && keys.has('k:519'));
});

test('every kind is on until it is switched off; the switches are one item and each can be turned back on', () => {
  assert.equal(enabledKinds({}).size, NOTICE_KINDS.length);
  let g = setNoticeKind({}, 'backup', false, T1);
  g = setNoticeKind(g, 'sync', false, T1);
  assert.deepEqual([...enabledKinds(g)].sort(), NOTICE_KINDS.filter((k) => k !== 'backup' && k !== 'sync').sort());
  assert.equal(Object.values(g).filter((x) => x.k === 's').length, 1);
  assert.equal(g[NOTICE_SETTINGS_ID]!.id, NOTICE_SETTINGS_ID);
  assert.equal(setNoticeKind(g, 'backup', false, T2), g, 'already off: nothing changes');
  g = setNoticeKind(g, 'backup', true, T2);
  assert.ok(enabledKinds(g).has('backup') && !enabledKinds(g).has('sync'));
});

test('two phones: both dismissals are kept, the later switch wins, and the copies compare equal once merged', () => {
  const a = dismissNotice({}, 'one', T1);
  const b = dismissNotice({}, 'two', T1);
  const m = mergeGoals(a, b);
  assert.deepEqual([...dismissedKeys(m)].sort(), ['one', 'two']);
  assert.equal(sameGoals(m, mergeGoals(b, a)), true);
  const early = setNoticeKind({}, 'due', false, T1);
  const late = setNoticeKind({}, 'group', false, T2);
  assert.deepEqual([...enabledKinds(mergeGoals(early, late))].includes('due'), true, 'the later change replaces the earlier one');
  assert.equal(enabledKinds(mergeGoals(early, late)).has('group'), false);
  assert.equal(sameGoals(a, b), false);
});

test('dismissals and switches read back from the cloud or a backup are validated; damaged ones are dropped', () => {
  const g = setNoticeKind(dismissNotice({}, 'due:a:soon', T1), 'sync', false, T1);
  assert.deepEqual(cleanGoals(JSON.parse(JSON.stringify(g))), g);
  const id = noticeId('x');
  const base = { id, k: 'k', key: 'x', x: 0, t: T1 };
  for (const bad of [{ ...base, key: '' }, { ...base, key: 'y' }, { ...base, key: 'x'.repeat(121), id: noticeId('x'.repeat(121)) }, { ...base, x: 2 }, { ...base, t: 'later' }]) {
    assert.deepEqual(cleanGoals({ [bad.id]: bad }), {}, JSON.stringify(bad).slice(0, 60));
  }
  const s = { id: NOTICE_SETTINGS_ID, k: 's', off: ['sync'], x: 0, t: T1 };
  for (const bad of [{ ...s, off: ['nope'] }, { ...s, off: 'sync' }, { ...s, id: noticeId('z') }, { ...s, t: 'later' }]) {
    assert.deepEqual(cleanGoals({ [bad.id]: bad }), {}, JSON.stringify(bad).slice(0, 60));
  }
  assert.deepEqual(cleanGoals({ [NOTICE_SETTINGS_ID]: { ...s, off: ['sync', 'sync', 'backup'] } })[NOTICE_SETTINGS_ID], { ...s, off: ['backup', 'sync'] }, 'duplicates are folded');
});

test('dismissals and switches are in the backup file and come back from it', () => {
  const g = setNoticeKind(dismissNotice({}, 'backup:2026-11', T1), 'goal', false, T1);
  const back = parseBackup(JSON.stringify(makeBackup([], T1, { goals: g })));
  assert.ok(back.ok);
  assert.deepEqual(back.ok && back.goals, g);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount, fmtINR, isValidDate, shiftMonth, parseTs, isoDate, monthOf,
  cleanPlan, summarizeMonth, budgetState,
  cleanEntry, mergeRemote, frequentCategories, makeEntry, editEntry, softDelete,
  newId, restoreEntry,
} from '../../src/core/logic.ts';
import { makeBackup, parseBackup } from '../../src/data/backup.ts';
import type { Entry, PlanData } from '../../src/core/logic.ts';

const T0 = '2026-11-09T10:00:00.000Z';
const mk = (over: Partial<Entry> = {}): Entry => ({ ...makeEntry({ amount: 100, category: 'Rent', method: 'UPI', note: '', date: '2026-11-09' }, T0), ...over });

test('parseAmount accepts rupee text and refuses the rest', () => {
  assert.equal(parseAmount('1,200.50'), 1200.5);
  assert.equal(parseAmount('₹ 500'), 500);
  assert.equal(parseAmount('.5'), 0.5);
  assert.equal(parseAmount('999999999.99'), 999999999.99);
  for (const bad of ['', '.', '0', '0.00', '-5', 'abc', '1e3', '1.234', '1000000000', '12 34a']) assert.equal(parseAmount(bad), null, bad);
});

test('fmtINR uses lakh grouping and shows paise only when present', () => {
  const f = (n: number) => fmtINR(n).replace(/ /g, ' ');
  assert.equal(f(100000), '₹1,00,000');
  assert.equal(f(9000), '₹9,000');
  assert.equal(f(1234.5), '₹1,234.50');
  assert.equal(f(0), '₹0');
});

test('dates and months', () => {
  assert.ok(isValidDate('2026-11-09'));
  for (const bad of ['2026-02-30', '2026-13-01', '1999-01-01', 'x', '2026-1-1', null, 5]) assert.ok(!isValidDate(bad), String(bad));
  assert.equal(shiftMonth('2026-11', 2), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 12), '2027-12');
  assert.equal(monthOf('2026-11-09'), '2026-11');
  assert.equal(isoDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(parseTs('2026-11-09T10:11:12.123456+00:00'), Date.parse('2026-11-09T10:11:12.123Z'));
  assert.ok(Number.isNaN(parseTs('nonsense')));
});

test('cleanPlan validates the old imported plans that come from the server or a backup', () => {
  const ok = { v: 1, months: ['2026-11', '2026-12', '2027-01'], rows: [{ c: 'Rent', g: 'Spending', p: [9000, 9000, 9000] }, { c: 'Bike EMI', g: 'EMI', p: [0, 0, 12554.5] }] };
  assert.deepEqual(cleanPlan(JSON.parse(JSON.stringify(ok))), ok);
  assert.equal(cleanPlan({ ...ok, v: 2 }), null);
  assert.equal(cleanPlan({ ...ok, rows: [{ c: 'x', g: 'Spending', p: [1] }] }), null); // wrong length
  assert.equal(cleanPlan({ ...ok, rows: [{ c: 'x', g: 'Nope', p: [1, 1, 1] }] }), null);
  assert.equal(cleanPlan({ ...ok, rows: [{ c: 'x', g: 'Saving', p: [1, -1, 1] }] }), null);
  assert.equal(cleanPlan(null), null);
});

const PLAN: PlanData = {
  v: 1,
  months: ['2026-11', '2026-12'],
  rows: [
    { c: 'Rent', g: 'Spending', p: [9000, 9000] },
    { c: 'Bike EMI', g: 'EMI', p: [0, 12554] },
    { c: 'Long-term equity', g: 'Saving', p: [50000, 50000] },
  ],
};

test('summarizeMonth adds up spending by category, group and unplanned categories', () => {
  const entries = [
    mk({ category: 'Rent', amount: 9000, entry_date: '2026-11-01' }),
    mk({ category: 'Rent', amount: 500, entry_date: '2026-11-15', deleted_at: T0 }), // deleted: ignored
    mk({ category: 'Rent', amount: 700, entry_date: '2026-12-02' }), // other month
    mk({ category: 'Groceries', amount: 300, entry_date: '2026-11-20' }), // not in the plan
    mk({ category: 'Long-term equity', amount: 20000, entry_date: '2026-11-05' }),
  ];
  const s = summarizeMonth(entries, PLAN, '2026-11');
  assert.equal(s.count, 3);
  assert.equal(s.hasPlan, true);
  const rent = s.rows.find((r) => r.category === 'Rent');
  assert.deepEqual([rent?.spent, rent?.planned, rent?.left], [9000, 9000, 0]);
  assert.deepEqual(s.groups.Spending, { spent: 9000, planned: 9000, budgeted: true });
  assert.deepEqual(s.groups.Saving, { spent: 20000, planned: 50000, budgeted: true });
  assert.deepEqual(s.extra, [{ category: 'Groceries', spent: 300 }]);
  assert.equal(s.totalSpent, 29300);
  const outside = summarizeMonth(entries, PLAN, '2030-01');
  assert.equal(outside.hasPlan, false);
  assert.equal(outside.rows[0]?.planned, 0);
  assert.equal(summarizeMonth(entries, null, '2026-11').rows.length, 0);
});

test('budgetState judges spending and saving differently', () => {
  assert.equal(budgetState('Spending', 100, 200, false), 'ok');
  assert.equal(budgetState('Spending', 201, 200, false), 'over');
  assert.equal(budgetState('Spending', 5, 0, false), 'over'); // unplanned spend
  assert.equal(budgetState('Spending', 0, 0, false), 'idle');
  assert.equal(budgetState('Saving', 50000, 50000, false), 'ok');
  assert.equal(budgetState('Saving', 10, 50000, false), 'idle'); // month still running
  assert.equal(budgetState('Saving', 10, 50000, true), 'short'); // month finished, saved too little
});

test('cleanEntry refuses anything malformed', () => {
  const good = mk();
  assert.ok(cleanEntry(good));
  const bads: Record<string, unknown> = {
    'bad id': { ...good, id: 'abc' },
    'bad date': { ...good, entry_date: '2026-02-30' },
    'zero amount': { ...good, amount: 0 },
    'negative amount': { ...good, amount: -1 },
    'three decimals': { ...good, amount: 0.001 },
    'NaN amount': { ...good, amount: NaN },
    'huge amount': { ...good, amount: 1e9 },
    'empty category': { ...good, category: '' },
    'long category': { ...good, category: 'x'.repeat(81) },
    'bad method': { ...good, method: 'Bitcoin' },
    'long note': { ...good, note: 'x'.repeat(501) },
    'bad created_at': { ...good, created_at: 'yesterday' },
    'not an object': 'hello',
  };
  for (const [label, e] of Object.entries(bads)) assert.equal(cleanEntry(e), null, label);
  assert.equal(cleanEntry({ ...good, amount: '123.45' })?.amount, 123.45); // numeric strings from the server are accepted
});

test('mergeRemote: the latest edit wins, whichever side it is on', () => {
  const older = mk({ updated_at: '2026-11-09T10:00:00.000Z', note: 'older', dirty: 0 });
  const newer = { ...older, updated_at: '2026-11-09T11:00:00.000Z', note: 'newer' };
  assert.equal(mergeRemote(undefined, newer).dirty, 0);
  assert.equal(mergeRemote(undefined, newer).note, 'newer');
  assert.equal(mergeRemote(older, newer).note, 'newer'); // newer cloud copy replaces an older clean one
  assert.equal(mergeRemote({ ...older, dirty: 1 }, newer).note, 'newer'); // ...and an older edit still waiting to be pushed
  assert.equal(mergeRemote({ ...older, dirty: 1 }, newer).dirty, 0);
  assert.equal(mergeRemote(newer, older).note, 'newer'); // an older cloud copy never overwrites a newer local one
  assert.equal(mergeRemote({ ...newer, dirty: 1 }, older).dirty, 1); // a newer waiting edit stays and will be pushed
  assert.equal(mergeRemote(newer, { ...newer, note: 'same time' }).note, 'newer'); // a tie keeps the local copy
});

test('edit and delete helpers mark the entry as changed on this phone', () => {
  const e = mk({ dirty: 0 });
  const t1 = '2026-11-10T00:00:00.000Z';
  const edited = editEntry(e, { amount: 5, date: '2026-11-08', note: 'n' }, t1);
  assert.equal(edited.amount, 5);
  assert.equal(edited.entry_date, '2026-11-08');
  assert.equal(edited.dirty, 1);
  assert.equal(edited.updated_at, t1);
  const gone = softDelete(e, t1);
  assert.equal(gone.deleted_at, t1);
  assert.equal(gone.dirty, 1);
});

test('frequentCategories ranks by use in the last 90 days', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  const mkc = (category: string, created_at: string, over: Partial<Entry> = {}) => mk({ category, created_at, ...over });
  const list = [
    mkc('Groceries', '2026-11-01T00:00:00Z'), mkc('Groceries', '2026-11-02T00:00:00Z'), mkc('Groceries', '2026-11-03T00:00:00Z'),
    mkc('Rent', '2026-11-01T00:00:00Z'), mkc('Rent', '2026-10-01T00:00:00Z'),
    mkc('Travel', '2026-10-15T00:00:00Z'),
    mkc('Old', '2026-01-01T00:00:00Z'), // older than 90 days
    mkc('Deleted', '2026-11-01T00:00:00Z', { deleted_at: T0 }),
  ];
  assert.deepEqual(frequentCategories(list, now, 2), ['Groceries', 'Rent']);
  assert.deepEqual(frequentCategories(list, now), ['Groceries', 'Rent', 'Travel']);
});

test('backup round trip keeps entries, and skips bad rows', () => {
  const entries = [mk({ id: newId(), note: 'a' }), mk({ id: newId(), note: 'b', deleted_at: T0 })];
  const text = JSON.stringify(makeBackup(entries, T0));
  const back = parseBackup(text);
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.equal(back.entries.length, 2);
  assert.equal(back.skipped, 0);
  assert.ok(back.entries.every((e) => e.dirty === 1)); // restored entries are pushed to the cloud on the next sync
  assert.equal(back.plan, null, 'a new backup holds no spreadsheet plan');
  const withBad = JSON.parse(text);
  withBad.entries.push({ id: 'nope' });
  const r2 = parseBackup(JSON.stringify(withBad));
  assert.ok(r2.ok && r2.skipped === 1 && r2.entries.length === 2);
  assert.ok(!parseBackup('not json').ok);
  assert.ok(!parseBackup('{"app":"other","v":1,"entries":[]}').ok);
});

test('an edit always sorts after the version it was based on, even when this phone clock is behind', () => {
  const ahead = mk({ updated_at: '2030-01-01T00:00:00.000Z', dirty: 0 });
  const behind = '2026-11-09T10:00:00.000Z'; // this phone's "now", years earlier than the stored edit
  const edited = editEntry(ahead, { note: 'x' }, behind);
  assert.ok(parseTs(edited.updated_at) > parseTs(ahead.updated_at));
  assert.equal(edited.updated_at, '2030-01-01T00:00:00.001Z');
  const gone = softDelete(ahead, behind);
  assert.ok(parseTs(gone.updated_at) > parseTs(ahead.updated_at));
  assert.equal(gone.deleted_at, gone.updated_at);
  assert.equal(mergeRemote(ahead, edited).note, 'x'); // so the edit survives the merge
});

test('the link from a private payment to the shared expense it records is kept and checked', () => {
  const src = '10000000-0000-4000-8000-0000000000aa';
  const e = makeEntry({ amount: 450, category: 'Eating out', method: null, note: 'my share', date: '2026-11-09', shareOf: src }, T0);
  assert.equal(e.share_of, src);
  assert.equal(makeEntry({ amount: 5, category: 'x', method: null, note: '', date: '2026-11-09' }, T0).share_of, null);
  assert.equal(cleanEntry({ ...e, share_of: src.toUpperCase() })!.share_of, src);
  assert.equal(cleanEntry({ ...e, share_of: 'nope' }), null);
  assert.equal(cleanEntry({ ...e, share_of: undefined })!.share_of, null, 'older rows have none');
  assert.equal(editEntry(e, { note: 'x' }, '2026-11-10T00:00:00.000Z').share_of, src, 'edits keep the link');
});

test('a budget is "nearly used" from 80% up to and including 100%, never with no budget or once over', async () => {
  const { nearBudget } = await import('../../src/core/logic.ts');
  assert.equal(nearBudget(799, 1000), false);
  assert.equal(nearBudget(800, 1000), true);
  assert.equal(nearBudget(1000, 1000), true);
  assert.equal(nearBudget(1001, 1000), false, 'over has its own state');
  assert.equal(nearBudget(500, 0), false);
  assert.equal(nearBudget(0, 0), false);
});

test('undo puts an edited or deleted payment back as it was, as a newer change', () => {
  const made = makeEntry({ amount: 250, category: 'Groceries', method: 'UPI', note: 'milk', date: '2026-11-05' }, '2026-11-05T10:00:00.000Z');
  const edited = editEntry(made, { amount: 999, category: 'Shopping', note: 'oops', date: '2026-11-06' }, '2026-11-05T10:01:00.000Z');
  const back = restoreEntry(edited, made, '2026-11-05T10:01:05.000Z');
  assert.equal(back.amount, 250);
  assert.equal(back.category, 'Groceries');
  assert.equal(back.note, 'milk');
  assert.equal(back.entry_date, '2026-11-05');
  assert.equal(back.id, made.id);
  assert.equal(back.dirty, 1);
  assert.ok(parseTs(back.updated_at) > parseTs(edited.updated_at), 'newer than the edit, so it wins when devices merge');

  const gone = softDelete(made, '2026-11-05T11:00:00.000Z');
  assert.notEqual(gone.deleted_at, null);
  const alive = restoreEntry(gone, made, '2026-11-05T11:00:30.000Z');
  assert.equal(alive.deleted_at, null);
  assert.equal(alive.amount, 250);
  assert.ok(parseTs(alive.updated_at) > parseTs(gone.updated_at), 'newer than the delete');

  // even when the clock has not moved on (or went back), the restored copy is still later
  const same = restoreEntry(gone, made, gone.updated_at);
  assert.ok(parseTs(same.updated_at) > parseTs(gone.updated_at));
});

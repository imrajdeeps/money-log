import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAmount, fmtINR, isValidDate, shiftMonth, parseTs, isoDate, monthOf,
  parsePlanText, cleanPlan, summarizeMonth, budgetState,
  safeCell, exportNote, amountText, exportRows, toTSV, toCSV,
  cleanEntry, mergeRemote, frequentCategories, makeEntry, editEntry, softDelete,
  newId, markExportedEntry, changedAfterExport,
} from '../src/logic.ts';
import { makeBackup, parseBackup } from '../src/backup.ts';
import type { Entry, PlanData } from '../src/logic.ts';

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

const BLOCK = [
  'Category\tGroup\t2026-11\t2026-12\t2027-01',
  'Rent\tSpending\t9000\t9000\t9000',
  'Bike EMI\tEMI\t0\t0\t12554.5',
  'Long-term equity\tSaving\t50000\t50000\t50000',
  '\t\t\t\t',
  'Family support\tfamily\t10000\t10000\t10000',
].join('\n');

test('parsePlanText reads the App export block (tab separated)', () => {
  const r = parsePlanText(BLOCK);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.plan.months, ['2026-11', '2026-12', '2027-01']);
  assert.equal(r.plan.rows.length, 4);
  assert.equal(r.plan.rows[1]?.p[2], 12554.5);
  assert.equal(r.plan.rows[3]?.g, 'Family'); // group names are case-insensitive
  assert.deepEqual(r.summary.byGroup, { Spending: 1, EMI: 1, Family: 1, Saving: 1 });
  assert.equal(r.summary.first, '2026-11');
  assert.equal(r.summary.last, '2027-01');
});

test('parsePlanText also reads CSV with quotes, a BOM, and trailing empty header cells', () => {
  const csv = '﻿Category,Group,2026-11,\r\n"Eating out, orders",Spending,"1,500",\r\n';
  const r = parsePlanText(csv);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.plan.rows[0]?.c, 'Eating out, orders');
  assert.equal(r.plan.rows[0]?.p[0], 1500);
});

test('parsePlanText refuses bad input with a readable reason', () => {
  const err = (t: string) => { const r = parsePlanText(t); assert.ok(!r.ok); return r.ok ? '' : r.error; };
  assert.match(err(''), /Nothing to import/);
  assert.match(err('Name\tGroup\t2026-11\nRent\tSpending\t1'), /must start with/);
  assert.match(err('Category\tGroup\t2026-13\nRent\tSpending\t1'), /2026-13/);
  assert.match(err('Category\tGroup\t2026-12\t2026-11\nRent\tSpending\t1\t1'), /increasing/);
  assert.match(err('Category\tGroup\t2026-11\nRent\tMisc\t1'), /must be one of/);
  assert.match(err('Category\tGroup\t2026-11\nRent\tSpending\t1\nrent\tSpending\t2'), /twice/);
  assert.match(err('Category\tGroup\t2026-11\nRent\tSpending\tabc'), /not a number/);
  assert.match(err('Category\tGroup\t2026-11\nRent\tSpending\t-5'), /not a number/);
  assert.match(err('Category\tGroup\t2026-11\n\t\t'), /No category rows/);
  assert.match(err('Category\tGroup'), /No month columns/);
});

test('cleanPlan validates plans that come from the server or a backup', () => {
  const ok = parsePlanText(BLOCK);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.deepEqual(cleanPlan(ok.plan), ok.plan);
  assert.equal(cleanPlan({ ...ok.plan, v: 2 }), null);
  assert.equal(cleanPlan({ ...ok.plan, rows: [{ c: 'x', g: 'Spending', p: [1] }] }), null); // wrong length
  assert.equal(cleanPlan({ ...ok.plan, rows: [{ c: 'x', g: 'Nope', p: [1, 1, 1] }] }), null);
  assert.equal(cleanPlan({ ...ok.plan, rows: [{ c: 'x', g: 'Saving', p: [1, -1, 1] }] }), null);
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
  assert.deepEqual(s.groups.Spending, { spent: 9000, planned: 9000 });
  assert.deepEqual(s.groups.Saving, { spent: 20000, planned: 50000 });
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

test('exports are safe to paste into Excel', () => {
  assert.equal(safeCell('=SUM(A1)'), ' =SUM(A1)');
  assert.equal(safeCell('+1'), ' +1');
  assert.equal(safeCell('@cmd'), ' @cmd');
  assert.equal(safeCell('-2'), ' -2');
  assert.equal(safeCell('a\tb\nc'), 'a b c');
  assert.equal(exportNote({ note: 'lunch', method: 'UPI' }), '[UPI] lunch');
  assert.equal(exportNote({ note: '', method: 'Cash' }), '[Cash]');
  assert.equal(exportNote({ note: 'x', method: null }), 'x');
  assert.equal(exportNote({ note: '=1+1', method: null }), ' =1+1');
  assert.equal(amountText(1200.5), '1200.5');
  assert.equal(amountText(9000), '9000');
  assert.equal(amountText(0.1 + 0.2), '0.3');
  assert.equal(amountText(12.05), '12.05');
});

test('export rows are ordered, skip deleted entries, and format as TSV and CSV', () => {
  const rows = exportRows([
    mk({ id: newId(), entry_date: '2026-11-03', category: 'Groceries', amount: 250.5, note: 'milk, eggs', method: 'UPI' }),
    mk({ id: newId(), entry_date: '2026-11-01', category: 'Rent', amount: 9000, note: '' , method: null }),
    mk({ id: newId(), entry_date: '2026-11-02', category: 'Rent', amount: 1, deleted_at: T0 }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(toTSV(rows), '2026-11-01\tRent\t9000\t\n2026-11-03\tGroceries\t250.5\t[UPI] milk, eggs');
  const csv = toCSV(rows);
  assert.ok(csv.startsWith('﻿Date,Category,Amount,Note\r\n'));
  assert.ok(csv.includes('2026-11-03,Groceries,250.5,"[UPI] milk, eggs"\r\n'));
  assert.equal(toTSV([]), '');
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

test('backup round trip keeps entries and plan, and skips bad rows', () => {
  const entries = [mk({ id: newId(), note: 'a' }), mk({ id: newId(), note: 'b', deleted_at: T0 })];
  const plan = { ...PLAN, importedAt: T0, dirty: 0 as const };
  const text = JSON.stringify(makeBackup(entries, plan, T0));
  const back = parseBackup(text);
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.equal(back.entries.length, 2);
  assert.equal(back.skipped, 0);
  assert.ok(back.entries.every((e) => e.dirty === 1)); // restored entries are pushed to the cloud on the next sync
  assert.deepEqual(back.plan?.rows, PLAN.rows);
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

test('marking as exported is detectably older than any later edit or delete', () => {
  const e = mk({ id: newId(), dirty: 0 });
  const t1 = '2026-11-10T00:00:00.000Z';
  const exported = markExportedEntry(e, t1);
  assert.equal(exported.exported_at, exported.updated_at);
  assert.equal(exported.dirty, 1);
  assert.deepEqual(changedAfterExport([exported]), []); // freshly exported: nothing to flag
  assert.deepEqual(changedAfterExport([e]), []); // never exported: nothing to flag
  const edited = editEntry(exported, { amount: 5 }, t1); // same clock instant, still sorts later
  assert.deepEqual(changedAfterExport([edited]).map((c) => c.kind), ['edited']);
  const deleted = softDelete(exported, '2026-11-11T00:00:00.000Z');
  assert.deepEqual(changedAfterExport([deleted]).map((c) => c.kind), ['deleted']);
  assert.deepEqual(changedAfterExport([markExportedEntry(edited, '2026-11-12T00:00:00.000Z')]), []); // acknowledged again
});

test('Excel-hostile text gets a leading space: formulas, a leading quote, dates and numbers', () => {
  assert.equal(safeCell('"=1+1"'), ' "=1+1"');
  assert.equal(safeCell('"'), ' "');
  assert.equal(safeCell('1/2'), ' 1/2');
  assert.equal(safeCell('00123'), ' 00123');
  assert.equal(safeCell('12-11'), ' 12-11');
  assert.equal(safeCell('lunch 1/2'), 'lunch 1/2'); // has words, so Excel leaves it alone
  assert.equal(safeCell('Rent'), 'Rent');
  assert.equal(exportNote({ note: '1/2', method: null }), ' 1/2');
  assert.equal(exportNote({ note: '1/2', method: 'UPI' }), '[UPI] 1/2'); // the method prefix already makes it text
});

test('plan import accepts dashes where an accounting format shows zero, but not negatives', () => {
  const ok = parsePlanText('Category\tGroup\t2026-11\t2026-12\nRent\tSpending\t₹ -\t–\nFood\tSpending\t100\t—');
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.deepEqual(ok.plan.rows.map((r) => r.p), [[0, 0], [100, 0]]);
  assert.ok(!parsePlanText('Category\tGroup\t2026-11\nRent\tSpending\t-5').ok);
});

// Contract check against the real spreadsheet export. The exported blocks are never in the repo: set MONEY_LOG_REAL_DIR to
// the folder that holds them (for example your Finance folder); without it these tests are skipped.
const REAL = process.env.MONEY_LOG_REAL_DIR ? join(process.env.MONEY_LOG_REAL_DIR, 'Money Log - plan block (Base).tsv') : '';
test('the spreadsheet App export block imports cleanly', { skip: !REAL || !existsSync(REAL) }, () => {
  const r = parsePlanText(readFileSync(REAL, 'utf8'));
  assert.ok(r.ok, r.ok ? '' : r.error);
  if (!r.ok) return;
  assert.equal(r.summary.months, 36);
  assert.ok(r.summary.categories >= 5);
  assert.ok(r.plan.rows.every((row) => row.p.length === 36));
  console.log(`  real block: ${r.summary.categories} categories x ${r.summary.months} months (${r.summary.first} to ${r.summary.last})`);
});

// ---------------------------------------------------------------- Log layout with a Method column, and the my-share link
test('with a Method column the export has five input columns and the note carries no [UPI] prefix', () => {
  const upi = mk({ entry_date: '2026-11-03', category: 'Groceries', amount: 500, method: 'UPI', note: 'weekly shop' });
  const none = mk({ entry_date: '2026-11-04', category: 'Rent', amount: 9000, method: null, note: '' });
  const eq = mk({ entry_date: '2026-11-05', category: 'Misc', amount: 10, method: 'Cash', note: '=1+1' });
  const rows = exportRows([upi, none, eq], null, 'column');
  assert.equal(toTSV(rows, 'column'), ['2026-11-03\tGroceries\t500\tUPI\tweekly shop', '2026-11-04\tRent\t9000\t\t', '2026-11-05\tMisc\t10\tCash\t =1+1'].join('\n'));
  assert.equal(toTSV(exportRows([upi, none, eq]), 'note').split('\n')[0], '2026-11-03\tGroceries\t500\t[UPI] weekly shop', 'the default layout is unchanged');
  assert.equal(toTSV(exportRows([upi])), '2026-11-03\tGroceries\t500\t[UPI] weekly shop', 'toTSV without a layout is the original four columns');
  assert.ok(toCSV(rows, 'column').startsWith('﻿Date,Category,Amount,Method,Note\r\n'));
  assert.ok(toCSV(rows).startsWith('﻿Date,Category,Amount,Note\r\n'));
  assert.equal(exportNote({ note: 'x', method: 'UPI' }, undefined, 'column'), 'x');
  assert.equal(exportNote({ note: 'x', method: 'UPI' }), '[UPI] x');
});

test('a shared expense keeps its "my share of" note in the Method-column layout too', () => {
  const me = '00000000-0000-4000-8000-0000000000aa';
  const other = '00000000-0000-4000-8000-0000000000bb';
  const e: Entry = { ...mk({ amount: 1800, method: 'UPI', note: 'dinner', category: 'Eating out' }), owner_id: me, group_id: '10000000-0000-4000-8000-000000000001', paid_by: me, shares: { [me]: 600, [other]: 1200 } };
  assert.equal(toTSV(exportRows([e], me, 'column'), 'column'), '2026-11-09\tEating out\t600\tUPI\tdinner, my share of 1,800');
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

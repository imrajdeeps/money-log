import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseDueText, cleanDue, dueKey, setDone, mergeDone, sameDone, cleanDoneMap, pruneDone, isDone, isRemoved, removeDue, classifyDue, daysBetween, dueRelative,
  alertTrigger, buildIcs, cleanAlert, DEFAULT_ALERT, parseBlockText,
} from '../../src/core/blocks.ts';
import type { DoneMap, DueData } from '../../src/core/blocks.ts';

const due = readFileSync(new URL('../support/fixtures/due-block.tsv', import.meta.url), 'utf8');
const budget = readFileSync(new URL('../support/fixtures/plan-block.tsv', import.meta.url), 'utf8');
const IMPORTED = '2026-11-09T10:00:00.000Z';
const parsedDue = (): DueData => { const r = parseDueText(due); assert.ok(r.ok); return r.data; };

// ---------------------------------------------------------------- due list import
test('the due block imports one-off payments and to-dos, skipping empty slots', () => {
  const r = parseDueText(due);
  assert.ok(r.ok);
  assert.deepEqual(r.summary, { oneoffs: 2, todos: 3, undated: 1 });
  const [fee, gadget, passport, bank, policy] = r.data.items;
  assert.equal(fee!.title, 'Annual fee');
  assert.equal(fee!.amount, 12000);
  assert.equal(fee!.due, '2027-03-31');
  assert.equal(fee!.done, false);
  assert.equal(gadget!.amount, 45000);
  assert.equal(passport!.amount, null);
  assert.equal(bank!.done, true, 'status Done from the sheet');
  assert.equal(bank!.title, 'Call the bank, ask about fees; then "confirm"', 'commas, semicolons and quotes survive');
  assert.equal(policy!.due, null);
  assert.equal(new Set(r.data.items.map((i) => i.k)).size, 5);
});

test('the due block also reads CSV, accepts rupee text and a dash for no amount', () => {
  const csv = 'Kind,Title,Due,Amount,Status\noneoff,Fee,2027-01-05,"₹1,200",Planned\ntodo,Call,2027-01-06,-,To do\n';
  const r = parseDueText(csv);
  assert.ok(r.ok);
  assert.equal(r.data.items[0]!.amount, 1200);
  assert.equal(r.data.items[1]!.amount, null);
});

test('the due block refuses what it cannot trust, naming the item', () => {
  const bad = (rows: string, re: RegExp) => { const r = parseDueText(rows); assert.ok(!r.ok); assert.match(r.error, re); };
  bad('Title\tDue\nx\t2027-01-01', /Kind, Title and Due/);
  bad('Kind\tTitle\tDue\nloan\tx\t2027-01-01', /kind "loan"/);
  bad('Kind\tTitle\tDue\ntodo\tCall\t15/12/2026', /"Call".*must look like/);
  bad('Kind\tTitle\tDue\ntodo\tCall\t2027-02-30', /must look like/);
  bad('Kind\tTitle\tDue\tAmount\noneoff\tFee\t2027-01-01\tabc', /not a valid amount/);
  bad('Kind\tTitle\tDue\nTODO\t\t', /No due items/);
  bad('', /Kind, Title and Due/);
  bad(`Kind\tTitle\tDue\ntodo\t${'x'.repeat(121)}\t`, /longer than 120/);
});

test('two identical to-dos get different keys', () => {
  const r = parseDueText('Kind\tTitle\tDue\ntodo\tPay rent\t2027-01-01\ntodo\tPay rent\t2027-01-01\n');
  assert.ok(r.ok);
  assert.notEqual(r.data.items[0]!.k, r.data.items[1]!.k);
  assert.equal(r.data.items[0]!.k, dueKey('todo', 'Pay rent', '2027-01-01'));
});

test('cleanDue accepts what parseDueText made and rejects tampered data', () => {
  const d = parsedDue();
  assert.deepEqual(cleanDue(JSON.parse(JSON.stringify(d))), d);
  assert.equal(cleanDue({ ...d, v: 2 }), null);
  assert.equal(cleanDue({ v: 1, items: [{ ...d.items[0], kind: 'loan' }] }), null);
  assert.equal(cleanDue({ v: 1, items: [{ ...d.items[0], due: '2027-13-01' }] }), null);
  assert.equal(cleanDue({ v: 1, items: [{ ...d.items[0], amount: -5 }] }), null);
  assert.equal(cleanDue({ v: 1, items: [d.items[0], d.items[0]] }), null, 'duplicate key');
  assert.equal(cleanDue(null), null);
});

// ---------------------------------------------------------------- due list states and Done marks
test('classifyDue orders overdue first, then by date, undated after, finished last', () => {
  const v = classifyDue(parsedDue().items, {}, IMPORTED, '2026-12-20');
  assert.deepEqual(v.map((i) => [i.title.slice(0, 12), i.state]), [
    ['Renew passpo', 'overdue'], // 2026-12-15 is 5 days ago
    ['Annual fee', 'later'],
    ['Gadget purch', 'later'],
    ['Read the pol', 'nodate'],
    ['Call the ban', 'done'],
  ]);
  assert.equal(v[0]!.days, -5);
  const today = classifyDue(parsedDue().items, {}, IMPORTED, '2026-12-15');
  assert.equal(today[0]!.state, 'today');
  const soon = classifyDue(parsedDue().items, {}, IMPORTED, '2026-12-10');
  assert.equal(soon[0]!.state, 'soon');
});

test('daysBetween and dueRelative', () => {
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2026-03-01', '2026-02-28'), -1);
  assert.equal(daysBetween('2026-03-28', '2026-03-29'), 1, 'a daylight-saving change never shifts a date');
  assert.deepEqual([0, 1, -1, 5, -3, null].map(dueRelative), ['today', 'tomorrow', 'yesterday', 'in 5 days', '3 days ago', 'no date']);
});

test('a Done mark made after the import wins over the sheet; one made before does not', () => {
  const item = parsedDue().items.find((i) => i.title === 'Renew passport')!;
  const sheetDone = parsedDue().items.find((i) => i.title.startsWith('Call the bank'))!;
  const after: DoneMap = { [item.k]: { d: 1, t: '2026-11-10T00:00:00.000Z' }, [sheetDone.k]: { d: 0, t: '2026-11-10T00:00:00.000Z' } };
  assert.equal(isDone(item, after, IMPORTED), true);
  assert.equal(isDone(sheetDone, after, IMPORTED), false, 'un-doing something the sheet marked Done');
  const before: DoneMap = { [item.k]: { d: 1, t: '2026-11-08T00:00:00.000Z' } };
  assert.equal(isDone(item, before, IMPORTED), false, 'the newer import replaces the old mark');
  assert.equal(isDone(item, {}, IMPORTED), false);
});

test('setDone is always later than the mark it replaces, even on a slow clock', () => {
  const m1 = setDone({}, 'k', true, '2026-11-09T10:00:00.000Z');
  const m2 = setDone(m1, 'k', false, '2026-11-09T09:00:00.000Z'); // this phone's clock is an hour behind
  assert.ok(Date.parse(m2.k!.t) > Date.parse(m1.k!.t));
  assert.equal(m2.k!.d, 0);
});

test('mergeDone keeps the latest mark per key and is the same from either side', () => {
  const a: DoneMap = { x: { d: 1, t: '2026-11-09T10:00:00.000Z' }, y: { d: 1, t: '2026-11-09T10:00:00.000Z' } };
  const b: DoneMap = { x: { d: 0, t: '2026-11-09T11:00:00.000Z' }, z: { d: 1, t: '2026-11-09T09:00:00.000Z' } };
  const ab = mergeDone(a, b);
  assert.deepEqual(ab, { x: b.x, y: a.y, z: b.z });
  assert.ok(sameDone(ab, mergeDone(b, a)));
  assert.ok(sameDone(ab, mergeDone(ab, a)), 'merging again changes nothing');
});

test('pruneDone drops marks for items that are no longer listed; cleanDoneMap drops junk', () => {
  const items = parsedDue().items;
  const m: DoneMap = { [items[0]!.k]: { d: 1, t: IMPORTED }, gone: { d: 1, t: IMPORTED } };
  assert.deepEqual(Object.keys(pruneDone(m, items)), [items[0]!.k]);
  assert.deepEqual(cleanDoneMap({ a: { d: 1, t: IMPORTED }, b: { d: 2, t: IMPORTED }, c: { d: 1, t: 'nope' }, d: 'x' }), { a: { d: 1, t: IMPORTED } });
  assert.deepEqual(cleanDoneMap(null), {});
});

// ---------------------------------------------------------------- calendar file
test('the alert trigger is relative to midnight of the due date', () => {
  assert.equal(alertTrigger(DEFAULT_ALERT), '-P1DT15H', '2 days before at 9:00 = 39 hours before midnight');
  assert.equal(alertTrigger({ daysBefore: 0, hour: 9 }), 'PT9H', 'on the day itself, after midnight');
  assert.equal(alertTrigger({ daysBefore: 1, hour: 0 }), '-P1D');
  assert.equal(alertTrigger({ daysBefore: 0, hour: 0 }), 'PT0S');
  assert.equal(alertTrigger({ daysBefore: 3, hour: 18 }), '-P2DT6H');
  assert.equal(alertTrigger({ daysBefore: 7, hour: 9 }), '-P6DT15H');
});

test('cleanAlert falls back to the default for anything odd', () => {
  assert.deepEqual(cleanAlert(null), DEFAULT_ALERT);
  assert.deepEqual(cleanAlert({ daysBefore: 5, hour: 20 }), { daysBefore: 5, hour: 20 });
  assert.deepEqual(cleanAlert({ daysBefore: -1, hour: 24 }), DEFAULT_ALERT);
  assert.deepEqual(cleanAlert({ daysBefore: 2.5, hour: '9' }), DEFAULT_ALERT);
});

test('buildIcs writes one all-day event with an alert per dated, unfinished item', () => {
  const views = classifyDue(parsedDue().items, {}, IMPORTED, '2026-11-09');
  const ics = buildIcs(views, DEFAULT_ALERT, '2026-11-09T12:34:56.789Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 3, 'fee, gadget, passport; not the Done one, not the undated one');
  assert.ok(!ics.includes('Call the bank') && !ics.includes('Read the policy'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270331\r\nDTEND;VALUE=DATE:20270401\r\n'));
  assert.ok(ics.includes('DTSTAMP:20261109T123456Z'));
  assert.equal(ics.split('TRIGGER:-P1DT15H').length - 1, 3);
  assert.ok(ics.includes('SUMMARY:Annual fee (₹12\\,000)'), 'the amount is in the title, with its comma escaped');
});

test('buildIcs: month and year rollover, escaping, folding and stable ids', () => {
  const r = parseDueText('Kind\tTitle\tDue\nTodo\tPay; rent, now \\ done\t2026-12-31\ntodo\t' + 'long '.repeat(20) + 'é\t2027-02-28\n');
  assert.ok(r.ok);
  const views = classifyDue(r.data.items, {}, IMPORTED, '2026-11-09');
  const a = buildIcs(views, DEFAULT_ALERT, '2026-11-09T00:00:00.000Z');
  const b = buildIcs(views, { daysBefore: 1, hour: 8 }, '2026-12-01T00:00:00.000Z');
  assert.ok(a.includes('DTEND;VALUE=DATE:20270101'), 'Dec 31 ends on Jan 1');
  assert.ok(a.includes('DTEND;VALUE=DATE:20270301'), 'Feb 28 ends on Mar 1');
  assert.ok(a.includes('SUMMARY:Pay\\; rent\\, now \\\\ done'), 'semicolon, comma and backslash are escaped');
  const enc = new TextEncoder();
  for (const line of a.split('\r\n')) assert.ok(enc.encode(line).length <= 75, `line too long: ${line.slice(0, 30)}`);
  assert.ok(a.includes('\r\n '), 'the long title was folded');
  const uid = (s: string) => [...s.matchAll(/UID:(\S+)/g)].map((m) => m[1]);
  assert.deepEqual(uid(a), uid(b), 'the same items keep the same ids, so a second import updates them');
  assert.equal(new Set(uid(a)).size, 2);
  assert.ok(b.includes('TRIGGER:-PT16H'));
});

test('buildIcs honours Done marks made in the app', () => {
  const items = parsedDue().items;
  const fee = items.find((i) => i.title === 'Annual fee')!;
  const views = classifyDue(items, { [fee.k]: { d: 1, t: '2026-11-10T00:00:00.000Z' } }, IMPORTED, '2026-11-09');
  assert.ok(!buildIcs(views, DEFAULT_ALERT, IMPORTED).includes('Annual fee'));
});

// ---------------------------------------------------------------- telling the blocks apart
test('parseBlockText tells the two blocks apart by their header, and no longer knows a net worth block', () => {
  assert.equal((parseBlockText(budget) as { kind: string }).kind, 'budget');
  assert.equal((parseBlockText(due) as { kind: string }).kind, 'due');
  const oldNet = parseBlockText('Label\tValue\tUnit\nNet worth now\t450000\t₹');
  assert.ok(!oldNet.ok, 'net worth is typed in the app now');
  const unknown = parseBlockText('Date\tAmount\n2026-11-09\t5');
  assert.ok(!unknown.ok);
  assert.match(unknown.error, /Category or Kind/);
  const empty = parseBlockText('  \n\t\n');
  assert.ok(!empty.ok);
  assert.match(empty.error, /Nothing to import/);
  const badDue = parseBlockText('Kind\tTitle\tDue\nloan\tx\t');
  assert.ok(!badDue.ok);
});

// Contract check against the real spreadsheet export; see tests/logic.test.ts for MONEY_LOG_REAL_DIR.
const REAL_DUE = process.env.MONEY_LOG_REAL_DIR ? join(process.env.MONEY_LOG_REAL_DIR, 'Money Log - due block.tsv') : '';
test('the spreadsheet due block imports cleanly', { skip: !REAL_DUE || !existsSync(REAL_DUE) }, () => {
  const d = parseDueText(readFileSync(REAL_DUE, 'utf8'));
  assert.ok(d.ok, d.ok ? '' : d.error);
  assert.ok(d.data.items.length >= 1);
  console.log(`  real due block: ${d.summary.oneoffs} one-offs, ${d.summary.todos} to-dos`);
});

test('a removed item leaves the list, the calendar file and the counts; importing again brings it back', () => {
  const items = parsedDue().items;
  const gone = items[0]!;
  const map = removeDue({}, gone.k, '2026-12-05T10:00:00.000Z'); // after the import
  assert.ok(isRemoved(gone, map, IMPORTED));
  assert.ok(!isRemoved(items[1]!, map, IMPORTED));
  const views = classifyDue(items, map, IMPORTED, '2026-12-10');
  assert.equal(views.length, items.length - 1);
  assert.ok(!views.some((v) => v.k === gone.k));
  assert.ok(!buildIcs(views, DEFAULT_ALERT, '2026-12-10T00:00:00Z').includes(gone.title)); // nothing about it in a new calendar file
  // a list imported later than the removal shows it again
  assert.ok(!isRemoved(gone, map, '2026-12-08T00:00:00.000Z'));
  assert.equal(classifyDue(items, map, '2026-12-08T00:00:00.000Z', '2026-12-10').length, items.length);
});

test('a removed mark keeps its Done state, is later than the mark it replaces, and syncs like a Done mark', () => {
  const done = setDone({}, 'k', true, '2026-12-05T10:00:00.000Z');
  const removed = removeDue(done, 'k', '2026-12-05T09:00:00.000Z'); // a slow clock
  assert.equal(removed.k!.d, 1);
  assert.equal(removed.k!.x, 1);
  assert.ok(Date.parse(removed.k!.t) > Date.parse(done.k!.t));
  // survives cleaning and compares as different from the same mark without it
  assert.deepEqual(cleanDoneMap(removed), removed);
  assert.ok(!sameDone(removed, { k: { d: 1, t: removed.k!.t } }));
  assert.ok(sameDone(removed, cleanDoneMap(JSON.parse(JSON.stringify(removed)))));
  // the latest change wins: another phone's later Done toggle undoes the removal, an earlier one does not
  assert.equal(mergeDone(removed, { k: { d: 0, t: '2026-12-06T00:00:00.000Z' } }).k!.x, undefined);
  assert.equal(mergeDone(removed, { k: { d: 0, t: '2026-12-05T00:00:00.000Z' } }).k!.x, 1);
  // junk in the x field is dropped
  assert.equal(cleanDoneMap({ k: { d: 0, t: '2026-12-05T10:00:00.000Z', x: 'yes' } }).k!.x, undefined);
});

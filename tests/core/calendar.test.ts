import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, classifyDue, DEFAULT_ALERT, icsUid, removeDue, setDone } from '../../src/core/blocks.ts';
import type { DoneMap, DueItem } from '../../src/core/blocks.ts';
import { afterExport, cleanSent, toCancel } from '../../src/core/calendar.ts';
import type { SentMap } from '../../src/core/calendar.ts';

const IMPORTED = '2026-11-01T00:00:00.000Z';
const item = (k: string, title: string, due: string | null = '2026-12-10', amount: number | null = 500): DueItem => ({ k, kind: 'oneoff', title, due, amount, done: false });
const views = (items: DueItem[], map: DoneMap = {}, today = '2026-11-10') => classifyDue(items, map, IMPORTED, today);

test('what was sent is remembered by the events\' uids, and an event that is sent again stays one', () => {
  const a = item('a', 'Renew passport');
  const first = afterExport({}, views([a]), []);
  assert.deepEqual(Object.keys(first), [icsUid(a)]);
  assert.deepEqual(afterExport(first, views([a]), []), first, 'the same file again changes nothing');
  assert.equal(first[icsUid(a)]!.due, '2026-12-10');
});

test('nothing is cancelled while the item is open, dated or not, and its date has passed or not', () => {
  const a = item('a', 'Renew passport', '2026-11-05'); // the date has passed: the event stays in the calendar
  const sent = afterExport({}, views([a], {}, '2026-11-01'), []);
  assert.deepEqual(toCancel(sent, [a], {}, IMPORTED), []);
});

test('an item finished, removed, renamed or gone from the list is cancelled', () => {
  const a = item('a', 'Renew passport');
  const b = item('b', 'Annual fee');
  const c = item('c', 'Gadget purchase');
  const d = item('d', 'Insurance');
  const sent = afterExport({}, views([a, b, c, d]), []);
  const map1 = setDone({}, 'a', true, '2026-11-09T10:00:00.000Z');
  const map2 = removeDue(map1, 'b', '2026-11-09T10:01:00.000Z');
  const renamed = item('c', 'Gadget purchase (new)');
  const out = toCancel(sent, [a, b, renamed], map2, IMPORTED); // d is gone from the list
  assert.deepEqual(out.map((e) => e.title).sort(), ['Annual fee', 'Gadget purchase', 'Insurance', 'Renew passport'], 'finished, removed, renamed (the old one) and gone');
  assert.equal(out.find((e) => e.title === 'Gadget purchase')!.uid, icsUid(c), 'the OLD event is the one cancelled');
});

test('a mark made before the list was imported does not cancel anything', () => {
  const a = item('a', 'Renew passport');
  const sent = afterExport({}, views([a]), []);
  const old = setDone({}, 'a', true, '2026-10-01T00:00:00.000Z'); // older than the import: the sheet's status stands
  assert.deepEqual(toCancel(sent, [a], old, IMPORTED), []);
});

test('after a file the cancelled events are forgotten and the new ones remembered', () => {
  const a = item('a', 'Renew passport');
  const b = item('b', 'Annual fee');
  const sent = afterExport({}, views([a, b]), []);
  const cancelled = toCancel(sent, [b], {}, IMPORTED); // a is gone
  assert.equal(cancelled.length, 1);
  const next = afterExport(sent, views([b]), cancelled);
  assert.deepEqual(Object.keys(next), [icsUid(b)]);
  assert.deepEqual(toCancel(next, [b], {}, IMPORTED), [], 'nothing left to cancel');
});

test('the calendar file writes a cancelled event with the same uid, a later sequence and the old date', () => {
  const a = item('a', 'Renew passport');
  const sent = afterExport({}, views([a]), []);
  const cancels = toCancel(sent, [], {}, IMPORTED);
  const ics = buildIcs([], DEFAULT_ALERT, '2026-11-09T12:00:00.000Z', cancels);
  assert.match(ics, /BEGIN:VEVENT\r\nUID:[0-9a-f]{16}@money-log\r\n/);
  assert.ok(ics.includes(`UID:${icsUid(a)}`));
  assert.ok(ics.includes('STATUS:CANCELLED\r\n'));
  assert.ok(ics.includes('SEQUENCE:1\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261210'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261211'));
  assert.ok(!ics.includes('VALARM'), 'a cancelled event needs no alert');
  assert.ok(!buildIcs([], DEFAULT_ALERT, '2026-11-09T12:00:00.000Z').includes('CANCELLED'), 'no cancels, no cancelled events');
});

test('the remembered list is validated when read back', () => {
  const a = item('a', 'Renew passport');
  const good = afterExport({}, views([a]), []);
  assert.deepEqual(cleanSent(JSON.parse(JSON.stringify(good))), good);
  const uid = icsUid(a);
  for (const bad of [null, 7, 'x', { [uid]: null }, { [uid]: { ...good[uid]!, uid: 'other' } }, { [uid]: { ...good[uid]!, due: 'tomorrow' } }, { [uid]: { ...good[uid]!, title: '' } }, { nope: { uid: 'nope' } }]) {
    assert.deepEqual(cleanSent(bad), {}, JSON.stringify(bad));
  }
});
test('a map stays a plain record', () => { const m: SentMap = {}; assert.equal(Object.keys(m).length, 0); });

import test from 'node:test';
import assert from 'node:assert/strict';
import { axisDays, chartPoints, historyRows, inRange, looksWrong, typedCheck } from '../../src/core/worthHistory.ts';
import { addNetUpdate, editNetUpdate, netUpdates, removeNetUpdate, restoreNetUpdate } from '../../src/core/goals.ts';
import type { Goals, NetUpdate } from '../../src/core/goals.ts';

const T = '2026-11-27T10:00:00.000Z';
const u = (id: string, d: string, a: number): NetUpdate => ({ id, k: 'n', a, d, x: 0, t: T });
// newest first, as netUpdates gives them: the owner's case, a ₹0 typed by mistake between two real figures
const history = [u('e', '2026-11-26', 570000), u('z', '2026-11-25', 0), u('d', '2026-09-24', 430000), u('c', '2026-07-12', 340000)];

test('a ₹0 between real figures, or a dip or spike that comes straight back, looks wrong; ordinary moves do not', () => {
  assert.equal(looksWrong(0, 430000, 570000), true);
  assert.equal(looksWrong(0, 430000, undefined), true, 'the newest can be a mistake too');
  assert.equal(looksWrong(0, 0, undefined), false, 'nothing to compare with');
  assert.equal(looksWrong(50000, 430000, 570000), true, 'a dip far below both');
  assert.equal(looksWrong(5_000_000, 430000, 570000), true, 'a spike far above both');
  assert.equal(looksWrong(480000, 430000, 570000), false);
  assert.equal(looksWrong(100000, 430000, undefined), false, 'one side only: a real drop is possible');
  assert.equal(looksWrong(-20000, -10000, -30000), false, 'below zero: no guessing');
});

test('the rows say how each update moved from the one before, and flag the mistake', () => {
  const rows = historyRows(history);
  assert.deepEqual(rows.map((r) => r.change), [570000, -430000, 90000, null]);
  assert.deepEqual(rows.map((r) => r.odd), [false, true, false, false]);
  assert.equal(rows[1]!.before?.id, 'd');
});

test('a range keeps the updates of the last 6 or 12 months', () => {
  assert.deepEqual(inRange(history, '6m', '2026-11-27').map((x) => x.id), ['e', 'z', 'd', 'c']);
  assert.deepEqual(inRange(history, '6m', '2027-02-01').map((x) => x.id), ['e', 'z', 'd']);
  assert.deepEqual(inRange(history, '1y', '2027-08-01').map((x) => x.id), ['e', 'z', 'd']);
  assert.equal(inRange(history, 'all', '2030-01-01').length, 4);
});

test('the chart goes across by day and up from ₹0 or the lowest figure to the highest', () => {
  const c = chartPoints(history, 300, 100, 10);
  assert.equal(c.lo, 0);
  assert.equal(c.hi, 570000);
  assert.deepEqual(c.pts.map((p) => p.id), ['c', 'd', 'z', 'e'], 'oldest on the left');
  assert.equal(c.pts[0]!.x, 10);
  assert.equal(c.pts.at(-1)!.x, 290);
  assert.equal(c.pts.at(-1)!.y, 10, 'the highest at the top');
  assert.equal(c.pts[2]!.y, 90, '₹0 at the bottom');
  assert.deepEqual(chartPoints([u('a', '2026-11-01', 100)], 300, 100).pts, [{ x: 150, y: 50, id: 'a' }]);
  assert.deepEqual(chartPoints([], 300, 100).pts, []);
});

test('a typed ₹0, or a figure under half or over double the last one, is asked about first', () => {
  assert.equal(typedCheck(0, 565430), 'zero');
  assert.equal(typedCheck(0, 0), null);
  assert.equal(typedCheck(200000, 565430), 'jump');
  assert.equal(typedCheck(1_200_000, 565430), 'jump');
  assert.equal(typedCheck(600000, 565430), null);
  assert.equal(typedCheck(0, null), null, 'the first figure is never questioned');
});

test('an update can be changed, deleted and brought back, and keeps its id', () => {
  const add = addNetUpdate({}, 0, '2026-11-25', '2026-11-27', T, 'z');
  assert.ok(add.ok);
  const items: Goals = add.items;
  const edited = editNetUpdate(items, 'z', 450000, '2026-11-24', '2026-11-27', '2026-11-27T11:00:00.000Z');
  assert.ok(edited.ok);
  assert.deepEqual(netUpdates(edited.items).map((x) => [x.id, x.a, x.d]), [['z', 450000, '2026-11-24']]);
  assert.equal(editNetUpdate(items, 'z', 1, '2026-12-01', '2026-11-27', T).ok, false, 'not a day in the future');
  assert.equal(editNetUpdate(items, 'nope', 1, '2026-11-01', '2026-11-27', T).ok, false);
  const gone = removeNetUpdate(edited.items, 'z', '2026-11-27T12:00:00.000Z');
  assert.equal(netUpdates(gone).length, 0);
  const back = restoreNetUpdate(gone, 'z', '2026-11-27T12:00:01.000Z');
  assert.deepEqual(netUpdates(back).map((x) => [x.id, x.a]), [['z', 450000]]);
  assert.equal(restoreNetUpdate(back, 'z', T), back, 'nothing to bring back');
});

test('the chart scale uses short amounts', async () => {
  const { compactINR } = await import('../../src/core/worthHistory.ts');
  assert.deepEqual([600000, 12500000, 45000, 800, 0, -250000].map(compactINR), ['₹6L', '₹1.3Cr', '₹45k', '₹800', '₹0', '−₹2.5L']);
});

test('the labels under the chart spread across the updates, and an only-zero first update is not flagged', () => {
  assert.deepEqual(axisDays(history), ['2026-07-12', '2026-08-27', '2026-10-11', '2026-11-26'], '137 days in thirds');
  assert.deepEqual(axisDays([u('a', '2026-11-01', 5)]), ['2026-11-01']);
  assert.deepEqual(axisDays([]), []);
  assert.deepEqual(historyRows([u('b', '2026-11-02', 500000), u('a', '2026-11-01', 0)]).map((r) => r.odd), [false, false]);
});

test('a check-in marks its update, a typed figure says so, and the mark survives a sync', async () => {
  const { snapshotWorth } = await import('../../src/core/worth.ts');
  const { mergeGoals } = await import('../../src/core/goals.ts');
  const typed = addNetUpdate({}, 100, '2026-11-01', '2026-11-27', T, 'a');
  assert.ok(typed.ok);
  const both = snapshotWorth(typed.items, 200, '2026-11-27', T);
  assert.deepEqual(netUpdates(both).map((x) => [x.a, x.s]), [[200, 'c'], [100, 't']]);
  const merged = mergeGoals({}, JSON.parse(JSON.stringify(both)));
  assert.deepEqual(netUpdates(merged).map((x) => x.s), ['c', 't']);
});

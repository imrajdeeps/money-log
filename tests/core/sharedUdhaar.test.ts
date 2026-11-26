import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSharedUdhaar, personLines, sharedCounts, splitShared, withShared } from '../../src/core/sharedUdhaar.ts';
import type { SharedUdhaar } from '../../src/core/sharedUdhaar.ts';

const AMAN = '11111111-1111-4111-8111-111111111111';
const ROHAN = '22222222-2222-4222-8222-222222222222';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n: number, extra: Record<string, unknown>) => ({ id: id(n), mine: true, way: 'gave', amount: 100, date: '2026-11-20', note: '', who: 'Aman', who_id: AMAN, state: 'active', settled: false, settled_by_me: false, ...extra });

test('the shared udhaar document is cleaned row by row (2.0)', () => {
  const list = parseSharedUdhaar({ entries: [row(1, { amount: '5000.004', note: '  bike ' }), row(2, { way: 'sideways' }), row(3, { amount: -1 }), row(4, { date: '2026-13-01' }), { id: 'x' }, null] });
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { id: id(1), mine: true, way: 'gave', amount: 5000, date: '2026-11-20', note: 'bike', who: 'Aman', whoId: AMAN, state: 'active', settled: false, settledByMe: false });
  assert.deepEqual(parseSharedUdhaar(null), []);
  assert.deepEqual(parseSharedUdhaar({ entries: 'no' }), []);
});

test('entries sort into to answer, open, declined and settled', () => {
  const list = parseSharedUdhaar({ entries: [row(1, { mine: false, state: 'invited' }), row(2, { state: 'invited' }), row(3, {}), row(4, { state: 'declined' }), row(5, { settled: true })] });
  const p = splitShared(list);
  assert.deepEqual(p.toAnswer.map((e) => e.id), [id(1)]);
  assert.deepEqual(p.open.map((e) => e.id), [id(2), id(3)], 'my own waiting entry is open for me');
  assert.deepEqual(p.declined.map((e) => e.id), [id(4)]);
  assert.deepEqual(p.settled.map((e) => e.id), [id(5)]);
});

test('what counts: accepted and open, or mine while the other person decides', () => {
  const [incoming, mineWaiting, active, settled, declined] = parseSharedUdhaar({ entries: [row(1, { mine: false, state: 'invited' }), row(2, { state: 'invited' }), row(3, {}), row(4, { settled: true }), row(5, { state: 'declined' })] }) as SharedUdhaar[];
  assert.deepEqual([incoming, mineWaiting, active, settled, declined].map(sharedCounts), [false, true, true, false, false]);
});

test('shared entries add to the private totals, one line per Circle person', () => {
  const shared = parseSharedUdhaar({ entries: [row(1, { amount: 5000 }), row(2, { way: 'took', amount: 1200, who: 'Rohan', who_id: ROHAN, state: 'invited' }), row(3, { mine: false, state: 'invited', amount: 300 })] });
  const t = withShared({ owedToMe: 800, iOwe: 0, people: [{ key: 'ravi', name: 'Ravi', net: 800, open: 1 }] }, shared);
  assert.equal(t.owedToMe, 5800);
  assert.equal(t.iOwe, 1200);
  assert.deepEqual(t.people.map((p) => [p.name, p.net]), [['Aman', 5000], ['Rohan', -1200], ['Ravi', 800]]);
});

test('the Groups page lines: net per person, waiting while unanswered, nothing when it nets to zero', () => {
  const shared = parseSharedUdhaar({ entries: [row(1, { amount: 5000 }), row(2, { way: 'took', amount: 1200, who: 'Rohan', who_id: ROHAN, state: 'invited' }), row(3, { way: 'took', amount: 5000, id: id(9) })] });
  assert.deepEqual(personLines(shared), [{ whoId: ROHAN, who: 'Rohan', net: -1200, waiting: true }]);
  assert.deepEqual(personLines(shared.slice(0, 2)), [{ whoId: AMAN, who: 'Aman', net: 5000, waiting: false }, { whoId: ROHAN, who: 'Rohan', net: -1200, waiting: true }]);
});

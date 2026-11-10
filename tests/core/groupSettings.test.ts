import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanGroup, cleanUsualSplit } from '../../src/core/groups.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const base = { id: ID, name: 'x', created_at: '2026-11-10T00:00:00Z' };

test('a trip keeps its dates and its closed time; other kinds never carry them', () => {
  const trip = cleanGroup({ ...base, kind: 'trip', starts_on: '2026-12-01', ends_on: '2026-12-05', closed_at: '2026-12-06T10:00:00Z' });
  assert.equal(trip?.starts_on, '2026-12-01');
  assert.equal(trip?.ends_on, '2026-12-05');
  assert.equal(trip?.closed_at, '2026-12-06T10:00:00Z');
  const family = cleanGroup({ ...base, kind: 'family', starts_on: '2026-12-01', closed_at: '2026-12-06T10:00:00Z', usual_split: { mode: 'equal' } });
  assert.deepEqual([family?.starts_on, family?.ends_on, family?.closed_at, family?.usual_split], [null, null, null, null]);
});

test('missing or damaged settings become "not set", never an error', () => {
  const g = cleanGroup({ ...base, kind: 'trip', starts_on: 'tomorrow', ends_on: '2026-02-31', closed_at: 'soon' });
  assert.deepEqual([g?.starts_on, g?.ends_on, g?.closed_at], [null, null, null]);
  const plain = cleanGroup({ ...base, kind: 'trip' });
  assert.deepEqual([plain?.starts_on, plain?.ends_on, plain?.closed_at, plain?.usual_split], [null, null, null, null]);
});

test('the usual split: equal, or percentages that add up to 100', () => {
  assert.deepEqual(cleanUsualSplit({ mode: 'equal' }), { mode: 'equal' });
  assert.deepEqual(cleanUsualSplit({ mode: 'percent', percent: { [A]: 60, [B]: 40 } }), { mode: 'percent', percent: { [A]: 60, [B]: 40 } });
  assert.deepEqual(cleanUsualSplit({ mode: 'percent', percent: { [A]: 33.33, [B]: 33.33, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc': 33.34 } })?.mode, 'percent');
  for (const bad of [null, undefined, 5, 'equal', {}, { mode: 'weird' }, { mode: 'percent' }, { mode: 'percent', percent: [] },
    { mode: 'percent', percent: { [A]: 50, [B]: 40 } }, { mode: 'percent', percent: { [A]: 150, [B]: -50 } },
    { mode: 'percent', percent: { 'not-an-id': 100 } }, { mode: 'percent', percent: { [A]: '60', [B]: 40 } }]) {
    assert.equal(cleanUsualSplit(bad), null, JSON.stringify(bad));
  }
});

test('flatmates keep a valid usual split and drop a broken one', () => {
  assert.deepEqual(cleanGroup({ ...base, kind: 'flatmates', usual_split: { mode: 'percent', percent: { [A]: 70, [B]: 30 } } })?.usual_split, { mode: 'percent', percent: { [A]: 70, [B]: 30 } });
  assert.equal(cleanGroup({ ...base, kind: 'flatmates', usual_split: { mode: 'percent', percent: { [A]: 70 } } })?.usual_split, null);
});

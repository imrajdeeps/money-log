import test from 'node:test';
import assert from 'node:assert/strict';
import { splitColumns } from '../../src/core/columns.ts';

const size = (x: { n: number }) => x.n;

test('the long Spending group gets a column; EMI, Family and Saving stack in the other (the owner\'s screenshot)', () => {
  const groups = [{ g: 'Spending', n: 12 }, { g: 'EMI', n: 2 }, { g: 'Family', n: 1 }, { g: 'Saving', n: 2 }];
  const cols = splitColumns(groups, size);
  assert.deepEqual(cols.map((c) => c.map((x) => x.g)), [['Spending'], ['EMI', 'Family', 'Saving']]);
});

test('the order is kept: the first column holds the first blocks', () => {
  const blocks = [{ n: 2 }, { n: 2 }, { n: 2 }, { n: 2 }];
  const cols = splitColumns(blocks, size);
  assert.deepEqual(cols, [[{ n: 2 }, { n: 2 }], [{ n: 2 }, { n: 2 }]]);
  assert.deepEqual(cols.flat(), blocks);
});

test('one block, or none, makes one column', () => {
  assert.deepEqual(splitColumns([{ n: 5 }], size), [[{ n: 5 }]]);
  assert.deepEqual(splitColumns([], size), [[]]);
});

test('the cut is where the columns come closest', () => {
  const cols = splitColumns([{ n: 1 }, { n: 1 }, { n: 1 }, { n: 6 }], size);
  assert.deepEqual(cols, [[{ n: 1 }, { n: 1 }, { n: 1 }], [{ n: 6 }]]);
});

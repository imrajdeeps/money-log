import test from 'node:test';
import assert from 'node:assert/strict';
import { splitQuestion } from '../../src/core/question.ts';

test('a question becomes a heading and the line under it', () => {
  assert.deepEqual(splitQuestion('Delete this entry with Neha? This cannot be undone.'), { title: 'Delete this entry with Neha?', body: 'This cannot be undone.' });
  assert.deepEqual(splitQuestion('Take admin rights away from Meera?'), { title: 'Take admin rights away from Meera?', body: '' });
  assert.deepEqual(splitQuestion('No question here.'), { title: 'No question here.', body: '' });
  assert.deepEqual(splitQuestion('Is "a?b" fine? Yes.'), { title: 'Is "a?b" fine?', body: 'Yes.' });
});

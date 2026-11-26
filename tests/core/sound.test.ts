import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIME_GAP_MS, chimeDue } from '../../src/core/sound.ts';

test('the notification chime plays only when the count goes up, at most once a minute (2.0)', () => {
  assert.equal(chimeDue(2, 3, 0, 100_000), true);
  assert.equal(chimeDue(3, 3, 0, 100_000), false, 'same count');
  assert.equal(chimeDue(3, 2, 0, 100_000), false, 'a note went away');
  assert.equal(chimeDue(2, 4, 100_000, 100_000 + CHIME_GAP_MS - 1), false, 'within a minute of the last chime');
  assert.equal(chimeDue(2, 4, 100_000, 100_000 + CHIME_GAP_MS), true, 'a minute later');
});

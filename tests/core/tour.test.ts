import test from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE, FIRST_STEPS, NEWS_STEPS, compareVersions, newsSince, pickTour, replay } from '../../src/core/tour.ts';

test('versions compare part by part, not as text', () => {
  assert.ok(compareVersions('1.13.0', '1.9.0') > 0, '13 is later than 9');
  assert.ok(compareVersions('1.9.0', '1.10.0') < 0);
  assert.equal(compareVersions('1.13', '1.13.0'), 0);
  assert.ok(compareVersions('2.0.0', '1.99.9') > 0);
});

test('every step has an id of its own and a title and text; news steps name their version', () => {
  const all = [...FIRST_STEPS, ...NEWS_STEPS];
  assert.equal(new Set(all.map((s) => s.id)).size, all.length);
  for (const s of all) { assert.ok(s.title.length > 0 && s.text.length > 0, s.id); }
  for (const s of NEWS_STEPS) assert.match(s.since ?? '', /^\d+\.\d+\.\d+$/, s.id);
  const versions = NEWS_STEPS.map((s) => s.since!);
  assert.deepEqual([...versions].sort(compareVersions), versions, 'news steps are oldest first');
});

test('a new person gets the whole tour; someone with data gets only what is new', () => {
  assert.equal(pickTour(null, '1.14.0', false)?.kind, 'first');
  assert.equal(pickTour(null, '1.14.0', false)?.steps, FIRST_STEPS);
  const news = pickTour(null, '1.14.0', true);
  assert.equal(news?.kind, 'news');
  assert.deepEqual(news?.steps.map((s) => s.since), ['1.13.0', '1.13.0', '1.14.0']);
});

test('after the tour was seen, only later versions bring a news tour, and only when they brought something', () => {
  assert.equal(pickTour('1.14.0', '1.14.0', true), null, 'already seen');
  assert.equal(pickTour('1.15.0', '1.14.0', true), null, 'a phone ahead of the app shows nothing');
  assert.deepEqual(pickTour('1.13.0', '1.14.0', true)?.steps.map((s) => s.id), ['news-tour']);
  assert.equal(pickTour('1.14.0', '1.14.1', true), null, 'nothing new in a version without news steps');
  assert.equal(pickTour('1.13.0', '1.13.0', true), null);
});

test('news never shows a step of a version the app has not reached', () => {
  assert.deepEqual(newsSince('1.12.0', '1.13.0').map((s) => s.since), ['1.13.0', '1.13.0']);
  assert.deepEqual(newsSince('1.12.0', '1.12.5'), []);
});

test('replaying gives the full tour or everything new since the baseline', () => {
  assert.equal(replay('first', '1.14.0').steps, FIRST_STEPS);
  assert.deepEqual(replay('news', '1.14.0').steps, newsSince(BASELINE, '1.14.0'));
});

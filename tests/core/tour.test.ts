import test from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE, FIRST_STEPS, NEWS_MAX, NEWS_STEPS, compareVersions, firstSteps, newsSince, pickTour, replay } from '../../src/core/tour.ts';
import type { TourContext } from '../../src/core/tour.ts';
import type { Feature } from '../../src/core/featureKinds.ts';

const ALL_ON: ReadonlySet<Feature> = new Set(['plan', 'worth', 'udhaar', 'insights']);
const nov = (day: string, on: ReadonlySet<Feature> = ALL_ON): TourContext => ({ today: `2026-11-${day}`, on });

test('versions compare part by part, not as text', () => {
  assert.ok(compareVersions('1.13.0', '1.9.0') > 0, '13 is later than 9');
  assert.ok(compareVersions('1.9.0', '1.10.0') < 0);
  assert.equal(compareVersions('1.13', '1.13.0'), 0);
  assert.ok(compareVersions('2.0.0', '1.99.9') > 0);
});

test('every step has an id of its own and a title and text; news steps name their version and its release day, oldest first', () => {
  const all = [...FIRST_STEPS, ...NEWS_STEPS];
  assert.equal(new Set(all.map((s) => s.id)).size, all.length);
  for (const s of all) { assert.ok(s.title.length > 0 && s.text.length > 0, s.id); }
  for (const s of NEWS_STEPS) {
    assert.match(s.since ?? '', /^\d+\.\d+\.\d+$/, s.id);
    assert.match(s.on ?? '', /^\d{4}-\d{2}-\d{2}$/, s.id);
  }
  const versions = NEWS_STEPS.map((s) => s.since!);
  assert.deepEqual([...versions].sort(compareVersions), versions, 'news steps are oldest first');
  const days = NEWS_STEPS.map((s) => s.on!);
  assert.deepEqual([...days].sort(), days, 'and so are their days');
});

test('the tour is short and follows the bar, Groups first; the Plan card shows only while Plan is on', () => {
  assert.ok(FIRST_STEPS.length <= 7, 'seven cards at most');
  assert.deepEqual(FIRST_STEPS.map((s) => s.id), ['welcome', 'groups', 'add', 'home', 'month', 'plan', 'done']);
  assert.deepEqual(firstSteps(new Set(['udhaar', 'insights'])).map((s) => s.id), ['welcome', 'groups', 'add', 'home', 'month', 'done']);
  for (const s of FIRST_STEPS) assert.ok(s.text.length <= 140, `${s.id} is short`);
});

test('a new person gets the whole tour; someone with data gets only what is new', () => {
  assert.equal(pickTour(null, '1.14.0', false, nov('11'))?.kind, 'first');
  assert.deepEqual(pickTour(null, '1.14.0', false, nov('11'))?.steps, FIRST_STEPS);
  const news = pickTour(null, '1.14.0', true, nov('11'));
  assert.equal(news?.kind, 'news');
  assert.deepEqual(news?.steps.map((s) => s.since), ['1.13.0', '1.13.0', '1.14.0']);
});

test('what is new shows only what was released this month, the newest three at most (the owner, 2026-11-27)', () => {
  const late = newsSince(BASELINE, '2.0.0', nov('27'));
  assert.equal(late.length, NEWS_MAX);
  assert.deepEqual(late.map((s) => s.since), ['1.33.0', '1.34.0', '2.0.0']);
  assert.deepEqual(newsSince(BASELINE, '2.0.0', { today: '2026-12-02', on: ALL_ON }), [], 'nothing from November in December');
  assert.equal(pickTour('1.34.0', '2.0.0', true, { today: '2026-12-02', on: ALL_ON }), null, 'an update next month with only old news shows nothing');
});

test('after the tour was seen, only later versions bring a news tour, and only when they brought something', () => {
  assert.equal(pickTour('1.14.0', '1.14.0', true, nov('11')), null, 'already seen');
  assert.equal(pickTour('1.15.0', '1.14.0', true, nov('11')), null, 'a phone ahead of the app shows nothing');
  assert.deepEqual(pickTour('1.13.0', '1.14.0', true, nov('11'))?.steps.map((s) => s.id), ['news-tour']);
  assert.equal(pickTour('1.14.0', '1.14.1', true, nov('11')), null, 'nothing new in a version without news steps');
  assert.equal(pickTour('1.13.0', '1.13.0', true, nov('11')), null);
});

test('news never shows a step of a version the app has not reached', () => {
  assert.deepEqual(newsSince('1.12.0', '1.13.0', nov('11')).map((s) => s.since), ['1.13.0', '1.13.0']);
  assert.deepEqual(newsSince('1.12.0', '1.12.5', nov('11')), []);
});

test('replaying gives the full tour or what is new this month', () => {
  assert.deepEqual(replay('first', '1.14.0', nov('11')).steps, FIRST_STEPS);
  assert.deepEqual(replay('news', '1.14.0', nov('11')).steps, newsSince(BASELINE, '1.14.0', nov('11')));
});

test('a person who has never seen the app gets the short welcome (a "first" tour), not twenty what\'s-new steps, when they have no payments', () => {
  // the shell passes hasData = "has at least one payment": a friend who just joined a group by an invitation has a group and nothing else
  assert.equal(pickTour(null, '1.32.0', false, nov('24'))!.kind, 'first');
  assert.equal(pickTour(null, '1.32.0', true, nov('24'))!.kind, 'news', 'someone with payments who never saw the tour gets what is new since the baseline');
});

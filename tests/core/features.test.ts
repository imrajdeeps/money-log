import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ON, chosenFeatures, featuresOn, lastTab, noticeKindsShown, setFeature } from '../../src/core/features.ts';
import { FEATURES_ID, cleanGoals, mergeGoals, sameGoals } from '../../src/core/goals.ts';
import type { Goals } from '../../src/core/goals.ts';
import { NOTICE_KINDS } from '../../src/core/noticeKinds.ts';

const T1 = '2026-11-27T10:00:00.000Z';
const T2 = '2026-11-27T11:00:00.000Z';

test('an account starts with Plan and Net worth off, Udhaar and Insights on', () => {
  assert.deepEqual([...featuresOn({})].sort(), ['insights', 'udhaar']);
  assert.deepEqual([...DEFAULT_ON], ['udhaar', 'insights']);
});

test('turning parts on and off keeps one item, in a fixed order', () => {
  let items: Goals = setFeature({}, 'plan', true, T1);
  items = setFeature(items, 'worth', true, T2);
  assert.deepEqual(Object.keys(items), [FEATURES_ID]);
  assert.deepEqual(items[FEATURES_ID], { id: FEATURES_ID, k: 'f', on: ['plan', 'worth', 'udhaar', 'insights'], x: 0, t: T2 });
  items = setFeature(items, 'udhaar', false, T2);
  assert.deepEqual([...featuresOn(items)], ['plan', 'worth', 'insights']);
});

test('Net worth lives inside Plan: with Plan off it does not show, and comes back with Plan', () => {
  let items = setFeature(setFeature({}, 'plan', true, T1), 'worth', true, T1);
  items = setFeature(items, 'plan', false, T2);
  assert.ok(chosenFeatures(items).has('worth'), 'the choice is kept');
  assert.ok(!featuresOn(items).has('worth'), 'but it does not show');
  items = setFeature(items, 'plan', true, T2);
  assert.ok(featuresOn(items).has('worth'));
});

test('switching a part to what it already is changes nothing once there is an item', () => {
  const items = setFeature({}, 'plan', true, T1);
  assert.equal(setFeature(items, 'plan', true, T2), items);
  const first = setFeature({}, 'udhaar', true, T1);
  assert.ok(first[FEATURES_ID], 'the first change writes the item even when it matches the defaults');
});

test('the item survives the cleaner and merges by its latest change, like the other settings', () => {
  const a = setFeature({}, 'plan', true, T1);
  const b = setFeature({}, 'insights', false, T2);
  assert.deepEqual(cleanGoals(JSON.parse(JSON.stringify(a))), a);
  const merged = mergeGoals(a, b);
  assert.deepEqual([...featuresOn(merged)], ['udhaar'], 'the later change wins');
  assert.ok(sameGoals(a, cleanGoals(JSON.parse(JSON.stringify(a)))));
  assert.ok(!sameGoals(a, b));
});

test('the cleaner refuses a wrong id, an unknown part and a second item', () => {
  const bad = { [FEATURES_ID]: { id: FEATURES_ID, k: 'f', on: ['plan', 'hacker'], x: 0, t: T1 } };
  assert.deepEqual(cleanGoals(bad), {});
  const otherId = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(cleanGoals({ [otherId]: { id: otherId, k: 'f', on: ['plan'], x: 0, t: T1 } }), {});
  const dup = cleanGoals({ [FEATURES_ID]: { id: FEATURES_ID, k: 'f', on: ['worth', 'plan', 'plan'], x: 0, t: T1 } });
  assert.deepEqual(dup[FEATURES_ID], { id: FEATURES_ID, k: 'f', on: ['plan', 'worth'], x: 0, t: T1 });
});

test('a part that is off takes its notes off the bell', () => {
  const all = new Set(NOTICE_KINDS);
  const shown = noticeKindsShown(all, featuresOn({}));
  for (const k of ['due', 'goal', 'networth'] as const) assert.ok(!shown.has(k), k);
  assert.ok(shown.has('group') && shown.has('budget'));
  const withPlan = noticeKindsShown(all, featuresOn(setFeature({}, 'plan', true, T1)));
  assert.ok(withPlan.has('due') && withPlan.has('goal') && !withPlan.has('networth'));
});

test('the bottom bar ends with Plan, else Udhaar, else All payments', () => {
  assert.equal(lastTab(new Set(['plan', 'udhaar'])), 'plan');
  assert.equal(lastTab(new Set(['udhaar'])), 'udhaar');
  assert.equal(lastTab(new Set()), 'payments');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSharedInput, parseSharedGoals, sharedName, sharedProgress } from '../../src/core/sharedGoals.ts';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const goal = (over: object = {}) => ({
  id: ID(1), name: 'Trip fund', target: 30000, date: '2027-02-01', created_by: ID(10), me: 'active', creator_name: 'Asha',
  members: [{ user_id: ID(10), name: 'Asha', state: 'active' }, { user_id: ID(11), name: 'Ravi', state: 'active' }, { user_id: ID(12), name: '', state: 'invited' }, { user_id: ID(13), name: 'Cee', state: 'left' }],
  topups: [
    { id: ID(21), user_id: ID(10), amount: 1000, date: '2026-11-10' },
    { id: ID(22), user_id: ID(11), amount: '500.50', date: '2026-11-11' },
    { id: ID(23), user_id: ID(13), amount: 250, date: '2026-11-09' },
  ],
  ...over,
});

test('the document from the server is checked row by row', () => {
  const [g] = parseSharedGoals({ goals: [goal()] });
  assert.equal(g!.name, 'Trip fund');
  assert.equal(g!.topups[1]!.amount, 500.5, 'a numeric string from the database becomes a number');
  assert.equal(g!.members.length, 4);
  assert.deepEqual(parseSharedGoals(null), []);
  assert.deepEqual(parseSharedGoals({ goals: 'x' }), []);
  assert.equal(parseSharedGoals({ goals: [goal({ id: 'nope' }), goal({ target: 0 }), goal({ me: 'left' }), goal({ date: '2027-02-30' }), goal({ name: '' })] }).length, 0, 'bad goals are dropped');
  const messy = parseSharedGoals({ goals: [goal({ topups: [{ id: 'x', user_id: ID(10), amount: 5, date: '2026-11-10' }, { id: ID(24), user_id: ID(10), amount: -5, date: '2026-11-10' }, { id: ID(25), user_id: ID(10), amount: 7, date: '2026-11-10' }], members: [{ user_id: 'x', state: 'active' }, { user_id: ID(10), state: 'boss' }] })] });
  assert.equal(messy[0]!.topups.length, 1, 'bad top-ups are dropped');
  assert.equal(messy[0]!.members.length, 0, 'bad people are dropped');
});

test('progress adds up everyone, lists those who left, and never passes the target', () => {
  const p = sharedProgress(parseSharedGoals({ goals: [goal()] })[0]!);
  assert.equal(p.saved, 1750.5);
  assert.equal(p.remaining, 28249.5);
  assert.equal(p.reached, false);
  assert.deepEqual(p.people.map((x) => [x.name, x.amount, x.state]), [['Asha', 1000, 'active'], ['Ravi', 500.5, 'active'], ['Cee', 250, 'left']], 'the invited are not listed as people yet');
  const done = sharedProgress(parseSharedGoals({ goals: [goal({ target: 1000 })] })[0]!);
  assert.equal(done.fraction, 1);
  assert.equal(done.remaining, 0);
  assert.equal(done.reached, true);
  const stray = sharedProgress(parseSharedGoals({ goals: [goal({ members: [], topups: [{ id: ID(30), user_id: ID(99), amount: 40, date: '2026-11-10' }] })] })[0]!);
  assert.deepEqual(stray.people.map((x) => [x.user_id, x.amount, x.state]), [[ID(99), 40, 'left']], 'a top-up from someone not listed still counts and shows');
});

test('what is typed for a shared goal', () => {
  const ok = checkSharedInput({ name: '  Trip   fund ', target: '30000', date: '2026-12-01' }, '2026-11-14', true);
  assert.deepEqual(ok, { ok: true, name: 'Trip fund', target: 30000, date: '2026-12-01' });
  const bad = (i: object, isNew = true) => checkSharedInput({ name: 'x', target: '10', date: '2026-12-01', ...i }, '2026-11-14', isNew);
  assert.equal(bad({ name: ' ' }).ok, false);
  assert.equal(bad({ name: 'x'.repeat(61) }).ok, false);
  assert.equal(bad({ target: '0' }).ok, false);
  assert.equal(bad({ target: '1.005' }).ok, false);
  assert.equal(bad({ date: '' }).ok, false);
  assert.equal(bad({ date: '2026-11-14' }).ok, false, 'a new goal needs a day after today');
  assert.equal(bad({ date: '2026-11-14' }, false).ok, true, 'an existing goal may keep a day that has come');
});

test('a person is called what they chose, else what the Circle calls them', () => {
  const circle = (id: string) => (id === ID(12) ? 'Zed' : '');
  assert.equal(sharedName({ user_id: ID(11), name: 'Ravi' }, circle), 'Ravi');
  assert.equal(sharedName({ user_id: ID(12), name: '' }, circle), 'Zed');
  assert.equal(sharedName({ user_id: ID(13), name: '' }, circle), 'Someone');
});

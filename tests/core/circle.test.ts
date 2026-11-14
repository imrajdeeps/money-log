import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleCodeFromHash, circleCodeLooksValid, circleHow, circleLink, circleName, cleanCircleMember, sortCircle } from '../../src/core/circle.ts';
import { joinCodeFromHash } from '../../src/core/groups.ts';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n: number, over: object = {}) => ({ user_id: ID(n), name: 'Ravi', linked: false, shared_groups: [], ...over });

test('a Circle row from the server is checked before it is trusted', () => {
  assert.deepEqual(cleanCircleMember(row(1, { user_id: ID(1).toUpperCase(), linked: true, shared_groups: ['Goa', 7, 'Flat'] })),
    { user_id: ID(1), name: 'Ravi', linked: true, shared_groups: ['Goa', 'Flat'] });
  for (const bad of [null, {}, row(1, { user_id: 'nope' }), { name: 'x' }]) assert.equal(cleanCircleMember(bad), null);
  assert.equal(cleanCircleMember(row(1, { name: null }))!.name, '', 'no name is an empty name');
  assert.equal(cleanCircleMember(row(1, { linked: 'yes' }))!.linked, false, 'only a real true counts as linked');
  assert.equal(cleanCircleMember(row(1, { name: 'x'.repeat(100) }))!.name.length, 40);
  assert.deepEqual(cleanCircleMember(row(1, { shared_groups: 'Goa' }))!.shared_groups, []);
});

test('how someone is named and how they came to be in the Circle', () => {
  const m = (over: object) => cleanCircleMember(row(1, over))!;
  assert.equal(circleName(m({ name: 'Ravi' })), 'Ravi');
  assert.equal(circleName(m({ name: '' })), 'Someone');
  assert.equal(circleHow(m({ linked: true })), 'Added with a code');
  assert.equal(circleHow(m({ shared_groups: ['Goa', 'Flat'] })), 'In Goa, Flat');
  assert.equal(circleHow(m({ linked: true, shared_groups: ['Goa'] })), 'Added with a code · In Goa');
});

test('the Circle is listed by name, and people with no name come last', () => {
  const list = [row(3, { name: '' }), row(2, { name: 'Zara' }), row(1, { name: 'Asha' })].map((r) => cleanCircleMember(r)!);
  assert.deepEqual(sortCircle(list).map((p) => p.name), ['Asha', 'Zara', '']);
});

test('a Circle link carries the code after the #, and is not mistaken for a group invite', () => {
  const code = 'abcdef0123456789abcd';
  const link = circleLink('https://x.github.io/money-log/?a=1', code);
  assert.equal(link, `https://x.github.io/money-log/#circle=${code}`);
  assert.equal(circleCodeFromHash(new URL(link).hash), code);
  assert.equal(circleCodeFromHash('#circle=ABCD-EF01-2345-6789-ABCD'), code);
  assert.equal(circleCodeFromHash('#circle=short'), null);
  assert.equal(circleCodeFromHash('#circle=abcdef012345'), null, 'a group-sized code is not a Circle code');
  assert.equal(circleCodeFromHash(`#join=${code}`), null);
  assert.equal(joinCodeFromHash(`#circle=${code}`), null, 'a Circle link never opens the group join form');
  assert.ok(circleCodeLooksValid('ABCD-EF01-2345-6789-ABCD') && !circleCodeLooksValid('ABCD-EF01-2345'));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanGroup } from '../src/groups.ts';
import { GROUP_KINDS, hasRoom, isGroupKind, kindLabel, kindMax } from '../src/groupKinds.ts';

const ID = '11111111-1111-4111-8111-111111111111';

test('the four kinds are known, anything else is not', () => {
  assert.deepEqual(GROUP_KINDS.map((k) => k.id), ['family', 'trip', 'flatmates', 'couple']);
  for (const k of GROUP_KINDS) assert.ok(isGroupKind(k.id));
  for (const bad of ['party', '', 'Family', null, undefined, 3]) assert.ok(!isGroupKind(bad));
});

test('a group of any known kind is accepted from the server, an unknown kind is dropped', () => {
  for (const k of GROUP_KINDS) assert.equal(cleanGroup({ id: ID, name: 'x', kind: k.id, created_at: '2026-11-10T00:00:00Z' })?.kind, k.id);
  assert.equal(cleanGroup({ id: ID, name: 'x', kind: 'party', created_at: '2026-11-10T00:00:00Z' }), null);
});

test('a couple is two people, the others are twenty', () => {
  assert.equal(kindMax('couple'), 2);
  assert.ok(hasRoom('couple', 0) && hasRoom('couple', 1) && !hasRoom('couple', 2));
  assert.ok(hasRoom('family', 19) && !hasRoom('family', 20));
  assert.ok(hasRoom('flatmates', 19) && !hasRoom('trip', 20));
});

test('labels', () => {
  assert.equal(kindLabel('flatmates'), 'Flatmates');
  assert.equal(kindLabel('couple'), 'Couple');
});

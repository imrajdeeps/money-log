import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedFor } from '../../../src/features/groups/personPowers.ts';
import type { Powers } from '../../../src/features/groups/personPowers.ts';
import type { Group, Member } from '../../../src/core/groups.ts';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRIMARY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const group = (primary: string | null): Group => ({ id: 'g', name: 'Flat', kind: 'family', created_at: '2026-11-01T00:00:00Z', starts_on: null, ends_on: null, closed_at: null, usual_split: null, primary_admin: primary, simplify: true, simplify_by: null, simplify_at: null });
const member = (user_id: string, role: Member['role']): Member => ({ group_id: 'g', user_id, display_name: 'X', role, joined_at: '2026-11-01T00:00:00Z', left_at: null });
const NONE = { rename: false, makeAdmin: false, revokeAdmin: false, makePrimary: false, remove: false };
const primaryPowers: Powers = { isAdmin: true, manageAdmins: true };
const adminPowers: Powers = { isAdmin: true, manageAdmins: false };
const memberPowers: Powers = { isAdmin: false, manageAdmins: false };

test('about yourself you may only rename, whatever your powers', () => {
  for (const p of [primaryPowers, adminPowers, memberPowers]) assert.deepEqual(allowedFor(group(ME), member(ME, 'admin'), ME, p), { ...NONE, rename: true });
});

test('the primary admin may make a member an admin, hand over the primary role, or remove them', () => {
  assert.deepEqual(allowedFor(group(PRIMARY), member(OTHER, 'member'), PRIMARY, primaryPowers), { ...NONE, makeAdmin: true, makePrimary: true, remove: true });
});

test('the primary admin may take admin rights away from another admin, and remove them', () => {
  assert.deepEqual(allowedFor(group(PRIMARY), member(OTHER, 'admin'), PRIMARY, primaryPowers), { ...NONE, revokeAdmin: true, makePrimary: true, remove: true });
});

test('another admin may remove a member but not make admins, and may not touch an admin', () => {
  assert.deepEqual(allowedFor(group(PRIMARY), member(OTHER, 'member'), ME, adminPowers), { ...NONE, remove: true });
  assert.deepEqual(allowedFor(group(PRIMARY), member(OTHER, 'admin'), ME, adminPowers), NONE);
});

test('nobody removes the primary admin, and a member may do nothing about anyone', () => {
  assert.equal(allowedFor(group(PRIMARY), member(PRIMARY, 'admin'), ME, adminPowers).remove, false);
  assert.equal(allowedFor(group(PRIMARY), member(PRIMARY, 'admin'), ME, adminPowers).revokeAdmin, false);
  assert.deepEqual(allowedFor(group(PRIMARY), member(OTHER, 'member'), ME, memberPowers), NONE);
});

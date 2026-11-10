import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_STORAGE_BYTES, MAX_ACCOUNT_PHOTOS, MAX_BYTES, photoRoom, cleanReceipt, fitWithin, liveFor, makeReceipt, markDeleted, markPurged, markUploaded, mergeRemoteReceipt,
  needsPurge, needsUpload, quota, receiptPath, sizeText, usedBytes,
} from '../../src/core/receipts.ts';
import { cleanHistory, describeHistory } from '../../src/core/history.ts';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ENTRY = '10000000-0000-4000-8000-000000000001';
const T0 = '2026-11-10T10:00:00.000Z';

test('a new photo is declared at <owner>/<id>.jpg, not yet uploaded', () => {
  const r = makeReceipt(ENTRY, ME, 123456, T0);
  assert.equal(r.path, `${ME}/${r.id}.jpg`);
  assert.equal(r.path, receiptPath(ME, r.id));
  assert.deepEqual([r.uploaded_at, r.deleted_at, r.purged_at, r.dirty], [null, null, null, 1]);
  assert.ok(needsUpload(r, ME) && !needsUpload(r, OTHER));
  assert.ok(!needsPurge(r, ME));
});

test('cleanReceipt accepts what the server sends and refuses anything off', () => {
  const r = makeReceipt(ENTRY, ME, 5000, T0);
  const row = { ...r, dirty: undefined };
  assert.deepEqual(cleanReceipt(row), { ...r, dirty: 0 });
  assert.equal(cleanReceipt({ ...row, id: r.id.toUpperCase(), path: r.path })!.id, r.id, 'ids are lower-cased');
  const bad = (over: object) => assert.equal(cleanReceipt({ ...row, ...over }), null, JSON.stringify(over).slice(0, 60));
  bad({ path: `${OTHER}/${r.id}.jpg` });          // a path in someone else's folder
  bad({ path: `${ME}/${r.id}.png` });
  bad({ path: `${ME}/x/${r.id}.jpg` });
  bad({ bytes: 0 }); bad({ bytes: MAX_BYTES + 1 }); bad({ bytes: 1.5 }); bad({ bytes: '5000' });
  bad({ entry_id: 'nope' }); bad({ id: 5 }); bad({ created_at: 'x' }); bad({ deleted_at: 'x' });
  assert.equal(cleanReceipt(null), null);
});

test('uploading, deleting and purging each make a later change that is still waiting to be sent', () => {
  let r = makeReceipt(ENTRY, ME, 5000, T0);
  r = { ...r, dirty: 0 };
  const up = markUploaded(r, '2026-11-10T09:00:00.000Z'); // a slow clock
  assert.ok(Date.parse(up.updated_at) > Date.parse(r.updated_at));
  assert.equal(up.dirty, 1);
  assert.ok(up.uploaded_at);
  assert.ok(!needsUpload(up, ME));
  const del = markDeleted(up, '2026-11-10T11:00:00.000Z');
  assert.ok(del.deleted_at && needsPurge(del, ME) && !needsPurge(del, OTHER));
  assert.equal(markDeleted(del, '2026-11-10T12:00:00.000Z'), del, 'deleting twice changes nothing');
  const gone = markPurged(del, '2026-11-10T12:00:00.000Z');
  assert.ok(gone.purged_at && !needsPurge(gone, ME));
  assert.equal(markPurged(gone, '2026-11-10T13:00:00.000Z'), gone);
});

test('a deleted photo is not "to upload" and stays out of the live list', () => {
  const a = makeReceipt(ENTRY, ME, 1000, '2026-11-10T10:00:00.000Z');
  const b = makeReceipt(ENTRY, ME, 1000, '2026-11-10T10:01:00.000Z');
  const c = markDeleted(makeReceipt(ENTRY, ME, 1000, '2026-11-10T10:02:00.000Z'), '2026-11-10T10:03:00.000Z');
  const elsewhere = makeReceipt('10000000-0000-4000-8000-000000000002', ME, 1000, T0);
  assert.deepEqual(liveFor([c, b, a, elsewhere], ENTRY).map((r) => r.id), [a.id, b.id], 'oldest first');
  assert.ok(!needsUpload(c, ME));
});

test('the newest change wins when merging a server copy', () => {
  const local = { ...makeReceipt(ENTRY, ME, 1000, T0), dirty: 1 as const };
  const older = { ...local, updated_at: '2026-11-10T09:00:00.000Z', uploaded_at: T0, dirty: 0 as const };
  const newer = { ...local, updated_at: '2026-11-10T11:00:00.000Z', deleted_at: '2026-11-10T11:00:00.000Z', dirty: 0 as const };
  assert.equal(mergeRemoteReceipt(local, older), local);
  assert.equal(mergeRemoteReceipt(local, newer).deleted_at, newer.deleted_at);
  assert.equal(mergeRemoteReceipt(undefined, older).dirty, 0);
});

test('storage used counts photos whose file may still be stored, and warns at 80% of the free 1 GB', () => {
  const r = (bytes: number, patch: object = {}) => ({ ...makeReceipt(ENTRY, ME, bytes, T0), ...patch });
  const all = [r(1000), r(2000, { uploaded_at: T0 }), r(4000, { deleted_at: T0, uploaded_at: T0 }), r(8000, { deleted_at: T0 }), r(16000, { deleted_at: T0, uploaded_at: T0, purged_at: T0 })];
  assert.equal(usedBytes(all), 1000 + 2000 + 4000, 'declared, uploaded, and deleted-but-not-yet-removed count; never-uploaded deleted and purged do not');
  assert.equal(quota(0).level, 'ok');
  assert.equal(quota(FREE_STORAGE_BYTES * 0.79).level, 'ok');
  assert.equal(quota(FREE_STORAGE_BYTES * 0.8).level, 'warn');
  assert.equal(quota(FREE_STORAGE_BYTES).level, 'full');
  assert.equal(quota(FREE_STORAGE_BYTES * 3).pct, 100);
  assert.deepEqual([512, 2048, 1_572_864].map(sizeText), ['512 B', '2 KB', '1.5 MB']);
});

test('a photo is drawn at most 1,600 pixels on its longest side, never enlarged', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1600, 1600), { width: 1600, height: 1600 });
  assert.deepEqual(fitWithin(10000, 10), { width: 1600, height: 2 });
  assert.deepEqual(fitWithin(100000, 1), { width: 1600, height: 1 }, 'never a zero side');
  assert.deepEqual(fitWithin(0, 0), { width: 1, height: 1 });
  assert.deepEqual(fitWithin(4000, 3000, 1000), { width: 1000, height: 750 });
});

// ---------------------------------------------------------------- history
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const names = (uid: string) => ({ [U(1)]: 'Asha', [U(2)]: 'Ravi' }[uid] ?? 'Former member');
const row = (kind: string, changes: object) => cleanHistory({ id: U(9), entry_id: U(8), group_id: U(7), changed_by: U(1), changed_at: T0, kind, changes })!;

test('history rows from the server are checked', () => {
  assert.ok(row('edited', {}));
  for (const bad of [null, {}, { id: U(9), entry_id: U(8), group_id: U(7), changed_by: U(1), changed_at: T0, kind: 'hacked', changes: {} },
    { id: U(9), entry_id: U(8), group_id: U(7), changed_by: U(1), changed_at: 'x', kind: 'edited', changes: {} },
    { id: U(9), entry_id: U(8), group_id: U(7), changed_by: U(1), changed_at: T0, kind: 'edited', changes: [] },
    { id: 'x', entry_id: U(8), group_id: U(7), changed_by: U(1), changed_at: T0, kind: 'edited', changes: {} }]) assert.equal(cleanHistory(bad), null);
});

test('history is described in plain words', () => {
  assert.deepEqual(describeHistory(row('created', { amount: 600, category: 'Eating out', note: 'dinner', paid_by: U(1), shares: { [U(1)]: 100, [U(2)]: 500 } }), names),
    ['Added: ₹600 · Eating out · “dinner”', 'Paid by Asha', 'Split: Asha ₹100, Ravi ₹500']);
  assert.deepEqual(describeHistory(row('edited', { amount: { from: 500, to: '600.00' }, note: { from: '', to: 'with tip' } }), names), ['Amount ₹500 → ₹600', 'Note nothing → “with tip”']);
  assert.deepEqual(describeHistory(row('edited', { paid_by: { from: U(1), to: U(2) }, shares: { from: {}, to: { [U(2)]: 50, [U(1)]: 0 } } }), names), ['Paid by Asha → Ravi', 'Split now: Ravi ₹50']);
  assert.deepEqual(describeHistory(row('edited', { paid_by: { from: U(3), to: U(1) } }), names), ['Paid by Former member → Asha']);
  assert.deepEqual(describeHistory(row('deleted', {}), names), ['Deleted']);
  assert.deepEqual(describeHistory(row('moved', { group_id: { from: U(7), to: null } }), names), ['Taken out of this group']);
  assert.deepEqual(describeHistory(row('edited', {}), names), ['Changed']);
  const odd = describeHistory(row('edited', { amount: { from: null, to: 'abc' }, entry_date: { from: 'x', to: '2026-11-09' } }), names);
  assert.equal(odd[0], 'Amount ? → ?');
  assert.ok(odd[1]!.startsWith('Date ? → '));
});

test('an account may keep 300 photos; deleted ones count until their file is removed', () => {
  const mk = (patch: object = {}) => ({ ...makeReceipt(ENTRY, ME, 1000, T0), ...patch });
  const all = [mk(), mk({ deleted_at: T0 }), mk({ deleted_at: T0, purged_at: T0 }), { ...mk(), owner_id: OTHER }];
  assert.equal(MAX_ACCOUNT_PHOTOS, 300);
  assert.equal(photoRoom(all, ME), 298, 'mine: one live and one deleted-not-removed count; the removed one and the other person\'s do not');
  assert.equal(photoRoom(Array.from({ length: 300 }, () => mk()), ME), 0);
  assert.equal(photoRoom(Array.from({ length: 305 }, () => mk()), ME), 0, 'never negative');
  assert.equal(photoRoom([], null), 300);
});

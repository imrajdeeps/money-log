import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMock, API_KEY } from './mock-supabase.ts';
import type { Mock } from './mock-supabase.ts';
import { createSync, SyncError } from '../src/sync.ts';
import { memoryStore } from '../src/store.ts';
import { makeEntry, editEntry, softDelete } from '../src/logic.ts';
import type { Entry, Plan } from '../src/logic.ts';

let mock: Mock;
before(async () => { mock = await startMock(); });
after(async () => { await mock.close(); });

interface Net {
  offline: boolean;
  beforePost?: () => Promise<void>; // runs just before the next push of entries
  holdPull?: Promise<void>; // delays the response of the next pull of entries until it settles
  afterGet?: () => void; // runs after each page of entries has been served
}
function device(email = 'me@example.com', cfg?: { supabaseUrl: string; supabaseKey: string }) {
  const net: Net = { offline: false };
  const store = memoryStore();
  const fetchFn = (async (input: any, init?: any) => {
    if (net.offline) throw new TypeError('fetch failed');
    if (net.beforePost && init?.method === 'POST' && String(input).includes('/rest/v1/entries')) { const f = net.beforePost; net.beforePost = undefined; await f(); }
    const res = await fetch(input, init);
    if (String(input).includes('/rest/v1/entries?select')) {
      net.afterGet?.();
      if (net.holdPull) { const g = net.holdPull; net.holdPull = undefined; await g; }
    }
    return res;
  }) as typeof fetch;
  const sync = createSync({ store, config: cfg ?? { supabaseUrl: mock.url, supabaseKey: API_KEY }, fetchFn });
  const signIn = async () => { await sync.init(); await sync.requestCode(email); await sync.verifyCode(email, '123456'); };
  return { net, store, sync, signIn };
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const entry = (over: Partial<Parameters<typeof makeEntry>[0]> = {}): Entry =>
  makeEntry({ amount: 100, category: 'Rent', method: 'UPI', note: 'n', date: '2026-11-09', ...over }, iso());
const reset = () => { mock.state.entries.clear(); mock.state.plans.clear(); mock.state.users.clear(); mock.state.requests.length = 0; mock.state.failNext = null; mock.state.accessTtlSec = 3600; };

test('without a Supabase URL and key the app stays local and never touches the network', async () => {
  reset();
  const d = device('x@example.com', { supabaseUrl: '', supabaseKey: '' });
  await d.sync.init();
  assert.equal(d.sync.getState().mode, 'local');
  await d.sync.sync();
  assert.equal(d.sync.getState().mode, 'local');
  await assert.rejects(d.sync.requestCode('a@b.co'));
  assert.equal(mock.state.requests.length, 0);
});

test('sign-in: a wrong code is refused with a readable message, the right one signs in', async () => {
  reset();
  const d = device();
  await d.sync.init();
  assert.equal(d.sync.getState().mode, 'signedout');
  await assert.rejects(d.sync.requestCode('not-an-email'), /valid email/);
  await d.sync.requestCode('me@example.com');
  await assert.rejects(d.sync.verifyCode('me@example.com', '000000'), /invalid|expired/i);
  await assert.rejects(d.sync.verifyCode('me@example.com', 'abc'), /6 digits/);
  assert.equal(await d.store.getMeta('session'), undefined);
  await d.sync.verifyCode('me@example.com', '123456');
  assert.equal(d.sync.getState().mode, 'idle');
  assert.equal(d.sync.getState().email, 'me@example.com');
  assert.ok(await d.store.getMeta('session'));
});

test('push: entries made on the phone reach the cloud and are marked clean', async () => {
  reset();
  const d = device();
  await d.signIn();
  await d.store.putEntries([entry(), entry({ category: 'Groceries' }), entry({ amount: 12.5 })]);
  await d.sync.refreshPending();
  assert.equal(d.sync.getState().pending, 3);
  await d.sync.sync();
  const s = d.sync.getState();
  assert.equal(s.mode, 'idle');
  assert.equal(s.pending, 0);
  assert.equal(mock.state.entries.size, 3);
  const uid = mock.state.users.get('me@example.com');
  for (const r of mock.state.entries.values()) { assert.equal(r.owner_id, uid); assert.ok(r.synced_at); }
  assert.ok((await d.store.allEntries()).every((e) => e.dirty === 0 && e.owner_id === uid));
});

test('an entry edited while a push is in flight stays waiting and goes out on the next sync', async () => {
  reset();
  const d = device();
  await d.signIn();
  const e = entry({ note: 'before' });
  await d.store.putEntries([e]);
  d.net.beforePost = async () => { await d.store.putEntries([editEntry(e, { note: 'edited mid-flight' }, iso(1000))]); };
  await d.sync.sync();
  const mid = (await d.store.getEntry(e.id))!;
  assert.equal(mid.note, 'edited mid-flight');
  assert.equal(mid.dirty, 1);
  assert.equal(mock.state.entries.get(e.id).note, 'before');
  await d.sync.sync();
  assert.equal((await d.store.getEntry(e.id))!.dirty, 0);
  assert.equal(mock.state.entries.get(e.id).note, 'edited mid-flight');
});

test('pull: a second phone receives entries, edits and deletions', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  const e1 = entry({ note: 'one' }); const e2 = entry({ note: 'two' });
  await a.store.putEntries([e1, e2]);
  await a.sync.sync(); await b.sync.sync();
  assert.equal((await b.store.allEntries()).length, 2);
  await a.store.putEntries([softDelete({ ...e1, dirty: 0 }, iso(2000))]);
  await a.sync.sync(); await b.sync.sync();
  const got = (await b.store.getEntry(e1.id))!;
  assert.ok(got.deleted_at);
  assert.equal(got.dirty, 0);
});

for (const [label, bAt, winner] of [['B edited later', 2000, 'from B'], ['B edited earlier', 500, 'from A']] as const) {
  test(`both phones edit the same entry (${label}): the latest edit wins and both phones end up identical`, async () => {
    reset();
    const a = device(); const b = device();
    await a.signIn(); await b.signIn();
    const e = entry({ note: 'start' });
    await a.store.putEntries([e]);
    await a.sync.sync(); await b.sync.sync();
    await a.store.putEntries([editEntry({ ...e, dirty: 0 }, { note: 'from A' }, iso(1000))]);
    await a.sync.sync();
    await b.store.putEntries([editEntry({ ...e, dirty: 0 }, { note: 'from B' }, iso(bAt))]); // still waiting when B syncs
    await b.sync.sync();
    await a.sync.sync();
    assert.equal((await b.store.getEntry(e.id))!.note, winner);
    assert.equal((await a.store.getEntry(e.id))!.note, winner);
    assert.equal(mock.state.entries.get(e.id).note, winner);
    assert.equal(b.sync.getState().pending, 0);
    assert.equal(a.sync.getState().pending, 0);
  });
}

test('an older cloud copy never overwrites a newer clean local copy', async () => {
  reset();
  const d = device();
  await d.signIn();
  const fresh = { ...entry({ note: 'fresh' }), updated_at: iso(10_000), dirty: 0 as const };
  await d.store.putEntries([fresh]);
  mock.state.entries.set(fresh.id, { ...fresh, owner_id: mock.state.users.get('me@example.com'), note: 'stale', updated_at: iso(-10_000), synced_at: new Date().toISOString().replace('Z', '000+00:00'), dirty: undefined });
  await d.sync.sync();
  assert.equal((await d.store.getEntry(fresh.id))!.note, 'fresh');
});

test('an expired access token is refreshed once and the request is retried', async () => {
  reset();
  const d = device();
  await d.signIn();
  await d.store.putEntries([entry()]);
  mock.expireAllAccess();
  mock.state.requests.length = 0;
  await d.sync.sync();
  assert.equal(d.sync.getState().mode, 'idle');
  assert.equal(mock.state.requests.filter((r) => r.includes('grant_type=refresh_token')).length, 1);
  assert.equal(mock.state.entries.size, 1);
});

test('a revoked refresh token signs the phone out and keeps its data', async () => {
  reset();
  const d = device();
  await d.signIn();
  await d.store.putEntries([entry()]);
  mock.state.refresh.clear();
  mock.expireAllAccess();
  await d.sync.sync();
  const s = d.sync.getState();
  assert.equal(s.mode, 'signedout');
  assert.match(s.error ?? '', /sign in again/i);
  assert.equal(await d.store.getMeta('session'), undefined);
  const kept = await d.store.allEntries();
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.dirty, 1);
});

test('offline: nothing is lost, the app says offline, and the next sync catches up', async () => {
  reset();
  const d = device();
  await d.signIn();
  await d.store.putEntries([entry()]);
  d.net.offline = true;
  await d.sync.sync();
  assert.equal(d.sync.getState().mode, 'offline');
  assert.equal(d.sync.getState().pending, 1);
  assert.equal(mock.state.entries.size, 0);
  d.net.offline = false;
  await d.sync.sync();
  assert.equal(d.sync.getState().mode, 'idle');
  assert.equal(d.sync.getState().pending, 0);
  assert.equal(mock.state.entries.size, 1);
});

test('data from a different account on this phone blocks sign-in', async () => {
  reset();
  const d = device();
  await d.sync.init();
  await d.store.setMeta('localOwner', '11111111-1111-4111-8111-111111111111');
  await d.sync.requestCode('me@example.com');
  await assert.rejects(d.sync.verifyCode('me@example.com', '123456'), (e: unknown) => e instanceof SyncError && e.kind === 'owner-mismatch');
  assert.equal(await d.store.getMeta('session'), undefined);
});

test('the plan travels between phones, and a newer unsynced local plan is not overwritten', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  const plan: Plan = { v: 1, months: ['2026-11'], rows: [{ c: 'Rent', g: 'Spending', p: [9000] }], importedAt: iso(), dirty: 1 };
  await a.store.setMeta('plan', plan);
  await a.sync.sync();
  assert.equal(mock.state.plans.size, 1);
  await b.sync.sync();
  const got = (await b.store.getMeta<Plan>('plan'))!;
  assert.deepEqual(got.rows, plan.rows);
  assert.equal(got.dirty, 0);
  // B imports a different plan locally; a sync must push it, not replace it
  const mine: Plan = { v: 1, months: ['2026-11'], rows: [{ c: 'Rent', g: 'Spending', p: [8000] }], importedAt: iso(5000), dirty: 1 };
  await b.store.setMeta('plan', mine);
  await b.sync.sync();
  assert.equal((await b.store.getMeta<Plan>('plan'))!.rows[0]!.p[0], 8000);
  assert.equal(mock.state.plans.values().next().value.payload.rows[0].p[0], 8000);
});

test('more than one page of entries is pulled completely', async () => {
  reset();
  const a = device();
  await a.signIn();
  const uid = mock.state.users.get('me@example.com')!;
  for (let i = 0; i < 2300; i++) {
    const e = entry({ amount: 1 + (i % 50) });
    mock.state.entries.set(e.id, { ...e, owner_id: uid, dirty: undefined, synced_at: new Date(Date.now() + i).toISOString().replace('Z', '000+00:00') });
  }
  await a.sync.sync();
  assert.equal((await a.store.allEntries()).length, 2300);
  assert.ok(mock.state.requests.filter((r) => r.includes('/rest/v1/entries?')).length >= 3);
});

test('once it has seen the cloud copy, later syncs ask only for recent changes', async () => {
  reset();
  const d = device();
  await d.signIn();
  await d.store.putEntries([entry()]);
  await d.sync.sync(); // pulls first (nothing there yet), then pushes
  await d.sync.sync(); // first pull that sees the data: reads everything once and remembers where it got to
  mock.state.requests.length = 0;
  await d.sync.sync();
  const pull = mock.state.requests.find((r) => r.startsWith('GET /rest/v1/entries'))!;
  assert.match(pull, /synced_at=gte\./);
});

test('server errors show the message and the next sync recovers', async () => {
  reset();
  const d = device();
  await d.signIn();
  await d.store.putEntries([entry()]);
  mock.state.failNext = { status: 500, body: { message: 'boom' } };
  await d.sync.sync();
  assert.equal(d.sync.getState().mode, 'error');
  assert.equal(d.sync.getState().error, 'boom');
  assert.equal(d.sync.getState().pending, 1);
  await d.sync.sync();
  assert.equal(d.sync.getState().mode, 'idle');
  assert.equal(d.sync.getState().error, null);
});

test('server rows that fail validation are ignored, not trusted', async () => {
  reset();
  const d = device();
  await d.signIn();
  const uid = mock.state.users.get('me@example.com')!;
  const bad = { ...entry(), amount: -5, owner_id: uid, dirty: undefined, synced_at: iso().replace('Z', '000+00:00') };
  const good = { ...entry({ note: 'ok' }), owner_id: uid, dirty: undefined, synced_at: iso().replace('Z', '001+00:00') };
  mock.state.entries.set(bad.id, bad);
  mock.state.entries.set(good.id, good);
  await d.sync.sync();
  const all = await d.store.allEntries();
  assert.equal(all.length, 1);
  assert.equal(all[0]!.note, 'ok');
});

test('another account cannot read or overwrite these entries', async () => {
  reset();
  const me = device('me@example.com'); const other = device('other@example.com');
  await me.signIn(); await other.signIn();
  const e = entry({ note: 'mine' });
  await me.store.putEntries([e]);
  await me.sync.sync();
  await other.sync.sync();
  assert.equal((await other.store.allEntries()).length, 0);
  // the other account tries to push a row with the same id
  await other.store.putEntries([{ ...e, note: 'taken over', owner_id: null, dirty: 1 }]);
  await other.sync.sync();
  assert.equal(other.sync.getState().mode, 'error');
  assert.equal(mock.state.entries.get(e.id).note, 'mine');
});

test('signing out stops syncing; erasing wipes the phone', async () => {
  reset();
  const d = device();
  await d.signIn();
  await d.store.putEntries([entry()]);
  await d.sync.signOut();
  assert.equal(d.sync.getState().mode, 'signedout');
  await d.sync.sync();
  assert.equal(mock.state.entries.size, 0); // nothing pushed while signed out
  assert.equal((await d.store.allEntries()).length, 1);
  await d.sync.eraseAll();
  assert.equal((await d.store.allEntries()).length, 0);
  assert.equal(await d.store.getMeta('localOwner'), undefined);
});

test('erasing while a sync is running waits for it, so nothing is written back afterwards', async () => {
  reset();
  const d = device();
  await d.signIn();
  await d.store.putEntries([entry(), entry(), entry(), entry()]);
  await d.sync.sync();
  await d.sync.sync(); // everything uploaded and the pull cursor stored
  let i = 0; // make three server rows look old, so a pull that uses the cursor would never fetch them again
  for (const r of mock.state.entries.values()) if (i++ < 3) r.synced_at = new Date(Date.now() - 86400000).toISOString().replace('Z', '000+00:00');
  let release!: () => void;
  d.net.holdPull = new Promise<void>((r) => { release = r; });
  const running = d.sync.sync();
  await new Promise((r) => setTimeout(r, 30));
  const erasing = d.sync.eraseAll(); // must wait for the sync that is still waiting for its response
  await new Promise((r) => setTimeout(r, 30));
  release();
  await Promise.all([running, erasing]);
  assert.equal((await d.store.allEntries()).length, 0);
  assert.equal(await d.store.getMeta('pullCursor'), undefined);
  assert.equal(await d.store.getMeta('lastSync'), undefined);
  assert.equal(d.sync.getState().mode, 'signedout');
  await d.signIn();
  await d.sync.sync();
  assert.equal((await d.store.allEntries()).length, 4); // the whole history comes back, nothing hidden by an old cursor
});

test('rows edited on another phone while a long pull is paging are not skipped', async () => {
  reset();
  const d = device();
  await d.signIn();
  const uid = mock.state.users.get('me@example.com')!;
  const ids: string[] = [];
  for (let i = 0; i < 2300; i++) {
    const e = entry({ amount: 1 + (i % 50) });
    ids.push(e.id);
    mock.state.entries.set(e.id, { ...e, owner_id: uid, dirty: undefined, synced_at: new Date(Date.now() - 60000 + i).toISOString().replace('Z', '000+00:00') });
  }
  let pages = 0;
  d.net.afterGet = () => {
    if (++pages !== 1) return;
    for (const id of ids.slice(0, 3)) { // another phone edits three early rows right after page 1 was served
      const r = mock.state.entries.get(id);
      r.note = 'edited elsewhere';
      r.updated_at = new Date(Date.now() + 5000).toISOString();
      r.synced_at = new Date().toISOString().replace('Z', '999+00:00');
    }
  };
  await d.sync.sync();
  assert.equal((await d.store.allEntries()).length, 2300);
  for (const id of ids.slice(0, 3)) assert.equal((await d.store.getEntry(id))!.note, 'edited elsewhere');
});

test('one refused row does not block the rest of the batch', async () => {
  reset();
  const d = device();
  await d.signIn();
  const bad = { ...entry(), category: '' }; // the database refuses an empty category
  await d.store.putEntries([entry({ note: 'a' }), bad, entry({ note: 'b' })]);
  await d.sync.sync();
  assert.equal(mock.state.entries.size, 2);
  assert.equal(d.sync.getState().mode, 'error');
  assert.equal(d.sync.getState().pending, 1);
  assert.equal((await d.store.getEntry(bad.id))!.dirty, 1);
});

test('signing out asks the server to end this phone only', async () => {
  reset();
  const d = device();
  await d.signIn();
  mock.state.requests.length = 0;
  await d.sync.signOut();
  assert.ok(mock.state.requests.includes('POST /auth/v1/logout?scope=local'), mock.state.requests.join(' | '));
});

test('a payment restored from another account gets a fresh id instead of clashing with that account', async () => {
  reset();
  const x = device('x@example.com'); const y = device('y@example.com');
  await x.signIn(); await y.signIn();
  const e = entry({ note: 'x private' });
  await x.store.putEntries([e]);
  await x.sync.sync();
  const xRow = (await x.store.getEntry(e.id))!; // carries X's owner_id now
  await y.store.putEntries([{ ...xRow, dirty: 1 }]); // Y restores X's backup: same id, owner X
  await y.sync.sync();
  assert.equal(y.sync.getState().mode, 'idle');
  assert.equal(mock.state.entries.size, 2);
  assert.equal(mock.state.entries.get(e.id).owner_id, mock.state.users.get('x@example.com')); // X's row untouched
  const mine = await y.store.allEntries();
  assert.equal(mine.length, 1);
  assert.notEqual(mine[0]!.id, e.id);
  assert.equal(mine[0]!.dirty, 0);
});

test('a newer edit pushed by another phone mid-sync is not overwritten, and the phones converge', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  const e = entry({ note: 'start' });
  await a.store.putEntries([e]);
  await a.sync.sync(); await b.sync.sync();
  await a.store.putEntries([editEntry((await a.store.getEntry(e.id))!, { note: 'from A (older)' }, iso(1000))]);
  await b.store.putEntries([editEntry((await b.store.getEntry(e.id))!, { note: 'from B (newer)' }, iso(2000))]);
  a.net.beforePost = async () => { await b.sync.sync(); }; // B's push lands between A's pull and A's push
  await a.sync.sync();
  assert.equal(mock.state.entries.get(e.id).note, 'from B (newer)'); // the older write was ignored
  await a.sync.sync(); // A now pulls B's version
  assert.equal((await a.store.getEntry(e.id))!.note, 'from B (newer)');
  assert.equal((await b.store.getEntry(e.id))!.note, 'from B (newer)');
  assert.equal(a.sync.getState().pending, 0);
});

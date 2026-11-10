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
  beforeBlockPost?: () => Promise<void>; // runs just before the next push of a plan block or the Done marks
  holdPull?: Promise<void>; // delays the response of the next pull of entries until it settles
  afterGet?: () => void; // runs after each page of entries has been served
}
function device(email = 'me@example.com', cfg?: { supabaseUrl: string; supabaseKey: string }) {
  const net: Net = { offline: false };
  const store = memoryStore();
  const fetchFn = (async (input: any, init?: any) => {
    if (net.offline) throw new TypeError('fetch failed');
    if (net.beforePost && init?.method === 'POST' && String(input).includes('/rest/v1/entries')) { const f = net.beforePost; net.beforePost = undefined; await f(); }
    if (net.beforeBlockPost && init?.method === 'POST' && String(input).includes('/rest/v1/plan_blocks')) { const f = net.beforeBlockPost; net.beforeBlockPost = undefined; await f(); }
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
const reset = () => { mock.state.entries.clear(); mock.state.plans.clear(); mock.state.groups.clear(); mock.state.members.clear(); mock.state.invites.clear(); mock.state.settlements.clear(); mock.state.receipts.clear(); mock.state.objects.clear(); mock.state.history.length = 0; mock.state.users.clear(); mock.state.requests.length = 0; mock.state.failNext = null; mock.state.accessTtlSec = 3600; };

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

// ------------------------------------------------------------------ Release 2: due list, net worth, Done marks
import { cleanDoneMap, mergeDone, parseDueText, parseNetText, setDone } from '../src/blocks.ts';
import type { DoneMap, DueBlock, NetBlock } from '../src/blocks.ts';
import type { DueDone } from '../src/sync.ts';

const DUE_TEXT = 'Kind\tTitle\tDue\tAmount\tStatus\noneoff\tAnnual fee\t2027-03-31\t12000\tPlanned\ntodo\tRenew passport\t2026-12-15\t\tTo do\ntodo\tCall the bank\t2026-11-20\t\tTo do\n';
const dueBlock = (text = DUE_TEXT, at = iso()): DueBlock => {
  const r = parseDueText(text);
  assert.ok(r.ok);
  return { ...r.data, importedAt: at, dirty: 1 };
};
const netBlock = (at = iso()): NetBlock => {
  const r = parseNetText('Label\tValue\tUnit\nPlan month (as of)\t2026-11-01\tdate\nNet worth now\t₹4,50,000\t₹\n');
  assert.ok(r.ok);
  return { ...r.data, importedAt: at, dirty: 1 };
};
const marks = async (d: ReturnType<typeof device>): Promise<DoneMap> => (await d.store.getMeta<DueDone>('dueDone'))?.items ?? {};
const mark = (d: ReturnType<typeof device>, key: string, done: boolean, at = iso()) =>
  d.store.mutateMeta<DueDone>('dueDone', (cur) => ({ items: setDone(cur?.items ?? {}, key, done, at), dirty: 1 }));

test('the due list, the net worth figures and the Done marks travel between phones', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  const due = dueBlock();
  await a.store.setMeta('block:due', due);
  await a.store.setMeta('block:networth', netBlock());
  await mark(a, due.items[1]!.k, true);
  await a.sync.refreshPending();
  assert.equal(a.sync.getState().pending, 3, 'two blocks and the marks wait to upload');
  await a.sync.sync();
  assert.equal(a.sync.getState().pending, 0);
  assert.equal((await a.store.getMeta<DueBlock>('block:due'))!.dirty, 0);
  assert.equal((await a.store.getMeta<DueDone>('dueDone'))!.dirty, 0);

  await b.sync.sync();
  const got = await b.store.getMeta<DueBlock>('block:due');
  assert.deepEqual(got!.items, due.items);
  assert.equal(got!.dirty, 0);
  assert.equal((await b.store.getMeta<NetBlock>('block:networth'))!.items[0]!.value, 450000);
  assert.deepEqual(Object.keys(await marks(b)), [due.items[1]!.k]);
  assert.equal(b.sync.getState().pending, 0);
});

test('Done marks made on two phones are merged, and the latest mark for an item wins', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  const due = dueBlock();
  await a.store.setMeta('block:due', due);
  await a.sync.sync(); await b.sync.sync();
  const [fee, passport, bank] = due.items.map((i) => i.k) as [string, string, string];

  a.net.offline = true;
  await mark(a, fee, true, iso(-5000));            // on A, offline
  await mark(b, passport, true, iso(-4000));       // on B, online
  await b.sync.sync();
  a.net.offline = false;
  await a.sync.sync();                              // A pulls B's mark, keeps its own, pushes the union
  await b.sync.sync();
  const want = [fee, passport].sort();
  assert.deepEqual(Object.keys(await marks(a)).sort(), want);
  assert.deepEqual(Object.keys(await marks(b)).sort(), want);

  await mark(b, fee, false, iso(-1000));            // B un-does the item A marked, later
  await b.sync.sync(); await a.sync.sync();
  assert.equal((await marks(a))[fee]!.d, 0);
  assert.equal((await marks(a))[passport]!.d, 1);

  await mark(a, bank, true, iso(-3000));
  await a.sync.sync(); await b.sync.sync();
  assert.deepEqual(await marks(a), await marks(b), 'both phones end with the same marks');
  assert.equal(a.sync.getState().pending, 0);
  assert.equal(b.sync.getState().pending, 0);
});

test('a newer due list replaces an older one, and a newer unsynced local one is not overwritten', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  await a.store.setMeta('block:due', dueBlock(DUE_TEXT, iso(-60000)));
  await a.sync.sync(); await b.sync.sync();

  const newer = dueBlock('Kind\tTitle\tDue\ntodo\tOnly item\t2027-01-01\n', iso(-1000));
  await a.store.setMeta('block:due', newer);
  await a.sync.sync(); await b.sync.sync();
  assert.deepEqual((await b.store.getMeta<DueBlock>('block:due'))!.items.map((i) => i.title), ['Only item']);

  const local = dueBlock('Kind\tTitle\tDue\ntodo\tLocal one\t2027-02-01\n', iso(5000)); // B imported after A, not yet pushed
  await b.store.setMeta('block:due', local);
  await a.store.setMeta('block:due', dueBlock('Kind\tTitle\tDue\ntodo\tStale one\t2027-02-02\n', iso(-500)));
  await a.sync.sync();                               // pushes the stale one (older than B's local)
  await b.sync.sync();                               // B keeps its newer local copy and pushes it
  await a.sync.sync();
  assert.deepEqual((await a.store.getMeta<DueBlock>('block:due'))!.items.map((i) => i.title), ['Local one']);
});

test('importing a new due list keeps the marks for items still on it and drops the rest', async () => {
  const d = dueBlock();
  const m: DoneMap = { [d.items[0]!.k]: { d: 1, t: iso() }, gone: { d: 1, t: iso() } };
  const { pruneDone } = await import('../src/blocks.ts');
  assert.deepEqual(Object.keys(pruneDone(m, d.items)), [d.items[0]!.k]);
});

test('blocks from the server that are unknown or fail validation are ignored', async () => {
  reset();
  const a = device();
  await a.signIn();
  const uid = [...mock.state.users.values()][0]!;
  const row = (block: string, payload: unknown) => mock.state.plans.set(`${uid}|${block}`, { block, imported_at: iso(), payload });
  row('due', { v: 1, items: [{ k: 1, kind: 'loan' }] });
  row('networth', { v: 1, items: [] });
  row('constructor', { v: 1, items: [] });
  row('__proto__', { v: 1 });
  row('due_done', { garbage: true, items: { x: { d: 7, t: 'nope' }, ok: { d: 1, t: iso() } } });
  await a.sync.sync();
  assert.equal(a.sync.getState().mode, 'idle', a.sync.getState().error ?? '');
  assert.equal(await a.store.getMeta('block:due'), undefined);
  assert.equal(await a.store.getMeta('block:networth'), undefined);
  assert.deepEqual(Object.keys(await marks(a)), ['ok'], 'only the valid mark was kept');
  assert.equal(({} as any).v, undefined, 'the object prototype was not touched');
});

test('another account cannot read these blocks or marks', async () => {
  reset();
  const a = device('a@example.com'); const x = device('x@example.com');
  await a.signIn(); await x.signIn();
  await a.store.setMeta('block:due', dueBlock());
  await mark(a, 'k', true);
  await a.sync.sync();
  await x.sync.sync();
  assert.equal(await x.store.getMeta('block:due'), undefined);
  assert.deepEqual(await marks(x), {});
});

test('mergeDone and cleanDoneMap are exported helpers that agree with what sync stores', () => {
  const x: DoneMap = { a: { d: 1, t: '2026-01-01T00:00:00.000Z' } };
  assert.deepEqual(mergeDone(x, cleanDoneMap(x)), x);
});

test('a due list imported while the previous one is being pushed stays waiting and goes out next', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  await a.store.setMeta('block:due', dueBlock(DUE_TEXT, iso(-2000)));
  const second = dueBlock('Kind\tTitle\tDue\ntodo\tSecond import\t2027-05-05\n', iso(1000));
  a.net.beforeBlockPost = async () => { await a.store.setMeta('block:due', second); };
  await a.sync.sync();
  assert.equal((await a.store.getMeta<DueBlock>('block:due'))!.dirty, 1, 'the newer import was not marked as uploaded');
  assert.equal(a.sync.getState().pending, 1);
  await a.sync.sync();
  assert.equal(a.sync.getState().pending, 0);
  await b.sync.sync();
  assert.deepEqual((await b.store.getMeta<DueBlock>('block:due'))!.items.map((i) => i.title), ['Second import']);
});

test('a Done mark lost to another phone\'s push at the same moment is put back by the phone that made it', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  const due = dueBlock();
  await a.store.setMeta('block:due', due);
  await a.sync.sync(); await b.sync.sync();
  const [fee, passport] = due.items.map((i) => i.k) as [string, string];

  await mark(b, passport, true, iso(-2000));
  // B has pulled the cloud copy (which has no marks); before B pushes, A marks an item and pushes. B's push then replaces A's.
  b.net.beforeBlockPost = async () => { await mark(a, fee, true, iso(-3000)); await a.sync.sync(); };
  await b.sync.sync();
  const cloud = () => [...mock.state.plans.values()].find((p) => p.block === 'due_done')!.payload.items as DoneMap;
  assert.deepEqual(Object.keys(cloud()), [passport], "the cloud lost A's mark in the overlap");
  await a.sync.sync();                                // A sees its mark is missing from the cloud and sends it again
  assert.deepEqual(Object.keys(cloud()).sort(), [fee, passport].sort());
  await b.sync.sync();
  assert.deepEqual(Object.keys(await marks(b)).sort(), [fee, passport].sort());
});

test('a Done mark made while the marks are being pushed stays waiting and goes out next', async () => {
  reset();
  const a = device(); const b = device();
  await a.signIn(); await b.signIn();
  const due = dueBlock();
  await a.store.setMeta('block:due', due);
  await a.sync.sync(); await b.sync.sync();
  const [fee, passport] = due.items.map((i) => i.k) as [string, string];
  await mark(a, fee, true, iso(-2000));
  a.net.beforeBlockPost = async () => { await mark(a, passport, true, iso(-1000)); };
  await a.sync.sync();
  assert.equal(a.sync.getState().pending, 1, 'the second mark was not counted as uploaded');
  await a.sync.sync();
  assert.equal(a.sync.getState().pending, 0);
  await b.sync.sync();
  assert.deepEqual(Object.keys(await marks(b)).sort(), [fee, passport].sort());
});

// ------------------------------------------------------------------ Release 2: groups, shared expenses, settlements
import { groupBalances, makeSettlement } from '../src/groups.ts';
import type { Group, Invite, Member, Settlement } from '../src/groups.ts';

type Dev = ReturnType<typeof device>;
const uidOf = async (d: Dev): Promise<string> => (await d.store.getMeta<{ user_id: string }>('session'))!.user_id;
const groupsOf = async (d: Dev) => (await d.store.getMeta<Group[]>('groups')) ?? [];
const membersOf = async (d: Dev) => (await d.store.getMeta<Member[]>('members')) ?? [];
const codeOf = async (d: Dev, gid: string) => (await d.store.getMeta<Invite[]>('invites'))!.find((i) => i.group_id === gid)!.code;
const shared = (gid: string, payer: string, shares: Record<string, number>, over: Partial<Parameters<typeof makeEntry>[0]> = {}): Entry =>
  entry({ amount: Object.values(shares).reduce((a, v) => a + Math.round(v * 100), 0) / 100, category: 'Dinner', group: { group_id: gid, paid_by: payer, shares }, ...over });

// A is the admin of a new group; B has joined it.
async function twoInAGroup() {
  reset();
  const a = device('a@example.com'); const b = device('b@example.com');
  await a.signIn(); await b.signIn();
  const gid = await a.sync.createGroup('Home', 'family', 'Asha');
  await b.sync.joinGroup(await codeOf(a, gid), 'Ravi');
  await a.sync.sync();
  return { a, b, gid, A: await uidOf(a), B: await uidOf(b) };
}

test('creating and joining a group: both phones see the group and its members; only the admin sees the code', async () => {
  const { a, b, gid } = await twoInAGroup();
  assert.deepEqual((await groupsOf(a)).map((g) => [g.name, g.kind]), [['Home', 'family']]);
  assert.deepEqual((await membersOf(a)).map((m) => [m.display_name, m.role]).sort(), [['Asha', 'admin'], ['Ravi', 'member']]);
  assert.equal((await groupsOf(b))[0]!.id, gid);
  assert.equal(((await b.store.getMeta<Invite[]>('invites')) ?? []).length, 0, 'a plain member never gets the code');
  assert.equal((await membersOf(b)).length, 2);
});

test('a wrong or reused-after-reset code is refused with the server\'s message', async () => {
  const { a, b, gid } = await twoInAGroup();
  const c = device('c@example.com'); await c.signIn();
  await assert.rejects(c.sync.joinGroup('000000000000', 'Cee'), /not valid or has expired/);
  const old = await codeOf(a, gid);
  await a.sync.resetInvite(gid);
  assert.notEqual(await codeOf(a, gid), old);
  await assert.rejects(c.sync.joinGroup(old, 'Cee'), /not valid or has expired/);
  await assert.rejects(b.sync.resetInvite(gid), /admin/i);
  assert.equal((await groupsOf(c)).length, 0);
});

test('a shared expense reaches the other member, who holds it read-only and never sends it back', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const e = shared(gid, A, { [A]: 50, [B]: 50 });
  await a.store.putEntries([e]);
  await a.sync.sync(); await b.sync.sync();
  const got = (await b.store.allEntries()).find((x) => x.id === e.id)!;
  assert.equal(got.owner_id, A);
  assert.equal(got.group_id, gid);
  assert.deepEqual(got.shares, { [A]: 50, [B]: 50 });
  assert.equal(got.dirty, 0);
  b.net.offline = false;
  const before = mock.state.requests.length;
  await b.sync.sync();
  assert.equal(b.sync.getState().mode, 'idle', b.sync.getState().error ?? '');
  assert.equal(b.sync.getState().pending, 0, "someone else's expense is not B's to upload");
  assert.ok(!mock.state.requests.slice(before).some((r) => r.startsWith('POST /rest/v1/entries')), 'nothing was posted for B');
  assert.equal((await b.store.getEntry(e.id))!.dirty, 0);
  // deleting it on A's phone reaches B
  await a.store.mutateEntries([e.id], (cur) => softDelete(cur!, iso(120000)));
  await a.sync.sync();
  await b.store.putEntries([{ ...(await b.store.getEntry(e.id))!, updated_at: '2000-01-01T00:00:00.000Z', dirty: 0, note: 'old' }]);
  await b.sync.sync();
  assert.ok((await b.store.getEntry(e.id))!.deleted_at);
});

test('joining later brings in the expenses that were shared before, although the phone has synced since', async () => {
  reset();
  const a = device('a@example.com'); const b = device('b@example.com');
  await a.signIn(); await b.signIn();
  await b.store.putEntries([entry({ category: 'Own' })]);
  await b.sync.sync();
  await b.store.setMeta('pullCursor', iso(3600000));     // B's phone has read the cloud up to a later time than anything A will write
  const gid = await a.sync.createGroup('Trip', 'trip', 'Asha');
  const A = await uidOf(a);
  const old = shared(gid, A, { [A]: 80 });
  old.created_at = old.updated_at = iso(-86400000);
  await a.store.putEntries([old]);
  await a.sync.sync();
  await new Promise((r) => setTimeout(r, 5));
  await b.sync.joinGroup(await codeOf(a, gid), 'Ravi');
  assert.ok(await b.store.getEntry(old.id), 'B received the expense made before B joined');
});

test('leaving needs a zero balance; afterwards the phone forgets the group but keeps its own expenses', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const owed = shared(gid, A, { [A]: 40, [B]: 60 });                 // B owes A 60
  const mine = shared(gid, B, { [B]: 20 });                            // B paid for B alone
  await a.store.putEntries([owed]); await b.store.putEntries([mine]);
  await a.sync.sync(); await b.sync.sync(); await a.sync.sync();
  await assert.rejects(b.sync.leaveGroup(gid), /Settle up first/);
  assert.equal((await groupsOf(b)).length, 1, 'still a member');
  const pay = makeSettlement({ group_id: gid, from_user: B, to_user: A, amount: 60, settle_date: '2026-11-09' }, B, iso());
  await b.store.putSettlements([pay]);
  await b.sync.sync(); await a.sync.sync();
  assert.deepEqual(Object.fromEntries(Object.entries(groupBalances(gid, await a.store.allEntries(), await a.store.allSettlements())).filter(([, v]) => v)), {}, 'both phones agree the group is settled');
  await b.sync.leaveGroup(gid);
  assert.equal((await groupsOf(b)).length, 0);
  assert.equal((await b.store.allSettlements()).length, 0, "the group's settlements are forgotten");
  const left = await b.store.allEntries();
  assert.deepEqual(left.map((e) => e.id), [mine.id], "A's expense is forgotten, B's own stays");
  await a.sync.sync();
  assert.equal((await a.store.allEntries()).length, 2, 'A still sees both, including the one B made before leaving');
});

test('an admin can remove a member who has settled up; the removed phone drops the group on its next sync', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  await a.store.putEntries([shared(gid, A, { [A]: 10 })]);
  await a.sync.sync(); await b.sync.sync();
  assert.equal((await b.store.allEntries()).length, 1);
  await a.sync.removeMember(gid, B);
  await b.sync.sync();
  assert.equal((await groupsOf(b)).length, 0);
  assert.equal((await b.store.allEntries()).length, 0);
  await assert.rejects(b.sync.joinGroup('000000000000', 'x'));
});

test('an expense made offline in a group the phone has since been removed from is not sent, and does not block syncing', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  b.net.offline = true;
  const stranded = shared(gid, B, { [B]: 30 });
  await b.store.putEntries([stranded, entry({ category: 'Own' })]);
  await a.sync.removeMember(gid, B);                     // B owed nothing, so B can be removed
  b.net.offline = false;
  await b.sync.sync();
  assert.equal(b.sync.getState().mode, 'idle', b.sync.getState().error ?? '');
  assert.equal(b.sync.getState().pending, 0, 'the stranded expense is not counted as waiting');
  assert.ok(mock.state.entries.has((await b.store.allEntries()).find((e) => e.category === 'Own')!.id), 'B\'s private payment did go up');
  assert.ok(!mock.state.entries.has(stranded.id));
  void A;
});

test('a settlement travels to the other member and a refused one does not block the rest', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const ok = makeSettlement({ group_id: gid, from_user: B, to_user: A, amount: 25, settle_date: '2026-11-09' }, B, iso());
  await b.store.putSettlements([ok]);
  await b.sync.sync(); await a.sync.sync();
  assert.deepEqual((await a.store.allSettlements()).map((x) => [x.amount, x.from_user === B]), [[25, true]]);
  assert.equal((await b.store.allSettlements())[0]!.dirty, 0);
  // A settlement between two other people is refused; the valid one beside it still goes up.
  const bad = makeSettlement({ group_id: gid, from_user: A, to_user: B, amount: 5, settle_date: '2026-11-09' }, B, iso());
  bad.from_user = A; bad.to_user = A; // not a valid pair at all
  const good = makeSettlement({ group_id: gid, from_user: B, to_user: A, amount: 5, settle_date: '2026-11-10' }, B, iso());
  await b.store.putSettlements([bad as Settlement, good]);
  await b.sync.sync();
  assert.equal(b.sync.getState().mode, 'error', 'the refusal is reported');
  assert.ok(mock.state.settlements.has(good.id), 'the valid settlement was sent despite the refused one');
  assert.ok(!mock.state.settlements.has(bad.id));
});

test('an expense restored from another account becomes a private payment, whatever group it came from', async () => {
  const { a, gid, A } = await twoInAGroup();
  const foreign = { ...shared(gid, A, { [A]: 90 }), owner_id: '99999999-9999-4999-8999-999999999999', dirty: 1 as const };
  await a.store.putEntries([foreign]);
  await a.sync.sync();
  assert.equal(a.sync.getState().mode, 'idle', a.sync.getState().error ?? '');
  const copy = [...mock.state.entries.values()].filter((e) => e.id !== foreign.id && e.amount === 90);
  assert.equal(copy.length, 1);
  assert.equal(copy[0]!.group_id, null);
  assert.equal(copy[0]!.shares, null);
  assert.equal(copy[0]!.owner_id, A);
});

test('group rows from the server that fail validation are ignored, and erasing the phone wipes the group data', async () => {
  const { a, b, gid } = await twoInAGroup();
  mock.state.groups.set('not-a-uuid', { id: 'not-a-uuid', name: 'x', kind: 'trip' });
  mock.state.members.set(`${gid}|bad`, { group_id: gid, user_id: 'bad', display_name: 'x', role: 'member', left_at: null });
  await b.sync.sync();
  assert.equal(b.sync.getState().mode, 'idle', b.sync.getState().error ?? '');
  assert.deepEqual((await groupsOf(b)).map((g) => g.id), [gid]);
  assert.equal((await membersOf(b)).length, 2);
  await a.store.putSettlements([makeSettlement({ group_id: gid, from_user: await uidOf(a), to_user: await uidOf(b), amount: 1, settle_date: '2026-11-09' }, await uidOf(a), iso())]);
  await a.sync.eraseAll();
  assert.equal((await a.store.allSettlements()).length, 0);
  assert.equal(await a.store.getMeta('groups'), undefined);
});

test("someone else's settlement on this phone is never sent, even if it were marked as changed", async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const theirs = makeSettlement({ group_id: gid, from_user: A, to_user: B, amount: 10, settle_date: '2026-11-09' }, A, iso());
  await a.store.putSettlements([theirs]);
  await a.sync.sync(); await b.sync.sync();
  assert.equal((await b.store.allSettlements()).length, 1);
  await b.store.mutateSettlements([theirs.id], (cur) => ({ ...cur!, amount: 999, updated_at: iso(60000), dirty: 1 }));
  await b.sync.refreshPending();
  assert.equal(b.sync.getState().pending, 0);
  await b.sync.sync();
  assert.equal(b.sync.getState().mode, 'idle', b.sync.getState().error ?? '');
  assert.equal(mock.state.settlements.get(theirs.id).amount, 10);
});

// ------------------------------------------------------------------ Release 3: receipt photos, history, my-share link
import { makeReceipt, markDeleted, needsPurge } from '../src/receipts.ts';
import type { Receipt } from '../src/receipts.ts';

const jpeg = (bytes: number) => new Blob([new Uint8Array(bytes).fill(255)], { type: 'image/jpeg' });
const receiptsOf = (d: Dev) => d.store.allReceipts();
const photo = async (d: Dev, entryId: string, bytes = 4000, withBlob = true): Promise<Receipt> => {
  const r = makeReceipt(entryId, await uidOf(d), bytes, iso());
  await d.store.putReceipts([r]);
  if (withBlob) await d.store.putBlob(r.id, jpeg(bytes));
  return r;
};

test('a photo goes up (row, then file, then marked uploaded) and a group member can fetch it, a stranger cannot', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const c = device('c@example.com'); await c.signIn();
  const e = shared(gid, A, { [A]: 50, [B]: 50 });
  await a.store.putEntries([e]);
  const r = await photo(a, e.id, 4321);
  await a.sync.refreshPending();
  assert.equal(a.sync.getState().pending, 2, 'the payment and its photo wait');
  await a.sync.sync();
  assert.equal(a.sync.getState().mode, 'idle', a.sync.getState().error ?? '');
  assert.equal(a.sync.getState().pending, 0);
  assert.equal(mock.state.objects.get(r.path)!.bytes, 4321, 'the file is in storage');
  const server = mock.state.receipts.get(r.id);
  assert.ok(server.uploaded_at, 'the cloud knows it is uploaded');
  const mine = (await receiptsOf(a))[0]!;
  assert.deepEqual([mine.dirty, !!mine.uploaded_at], [0, true]);

  await b.sync.sync();
  const seen = (await receiptsOf(b))[0]!;
  assert.equal(seen.owner_id, A);
  assert.equal(await b.store.getBlob(r.id), undefined, 'not downloaded until it is looked at');
  const blob = await b.sync.receiptBlob(seen);
  assert.equal(blob.size, 4321);
  assert.ok(await b.store.getBlob(r.id), 'kept for next time');

  await c.sync.sync();
  assert.equal((await receiptsOf(c)).length, 0, 'a stranger sees no photo rows');
  await assert.rejects(c.sync.receiptBlob({ ...seen, uploaded_at: iso() }), /not available/);
});

test('the photo of a private payment is not shown to the group', async () => {
  const { a, b } = await twoInAGroup();
  const priv = entry({ category: 'Rent' });
  await a.store.putEntries([priv]);
  await photo(a, priv.id);
  await a.sync.sync(); await b.sync.sync();
  assert.equal(mock.state.receipts.size, 1);
  assert.equal((await receiptsOf(b)).length, 0);
});

test('offline, a photo waits and is counted; when the connection returns the payment, its row and its file all go up', async () => {
  reset();
  const a = device(); await a.signIn();
  a.net.offline = true;
  const e = entry();
  await a.store.putEntries([e]);
  const r = await photo(a, e.id);
  await a.sync.sync();
  assert.equal(a.sync.getState().mode, 'offline');
  await a.sync.refreshPending();
  assert.equal(a.sync.getState().pending, 2);
  a.net.offline = false;
  await a.sync.sync();
  assert.equal(a.sync.getState().pending, 0);
  assert.ok(mock.state.objects.has(r.path) && mock.state.receipts.get(r.id).uploaded_at);
});

test('deleting a photo removes its file, and the other member drops it and its cached picture', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const e = shared(gid, A, { [A]: 10, [B]: 10 });
  await a.store.putEntries([e]);
  const r = await photo(a, e.id);
  await a.sync.sync(); await b.sync.sync();
  await b.sync.receiptBlob((await receiptsOf(b))[0]!);
  assert.ok(await b.store.getBlob(r.id));

  await a.store.mutateReceipts([r.id], (cur) => markDeleted(cur!, iso()));
  await a.sync.sync();
  assert.equal(mock.state.objects.has(r.path), false, 'the file was removed through the Storage API');
  const server = mock.state.receipts.get(r.id);
  assert.ok(server.deleted_at && server.purged_at);
  assert.equal(await a.store.getBlob(r.id), undefined);
  assert.equal(a.sync.getState().pending, 0);

  await b.sync.sync();
  assert.ok((await receiptsOf(b))[0]!.deleted_at);
  assert.equal(await b.store.getBlob(r.id), undefined);
});

test("deleting the payment deletes its photos in the cloud, and the owner's phone then removes the files", async () => {
  const { a, gid, A, B } = await twoInAGroup();
  const e = shared(gid, A, { [A]: 10, [B]: 10 });
  await a.store.putEntries([e]);
  const r = await photo(a, e.id);
  await a.sync.sync();
  assert.ok(mock.state.objects.has(r.path));
  await a.store.mutateEntries([e.id], (cur) => softDelete(cur!, iso(5000)));
  await a.sync.sync();                                   // pushes the delete; the server marks the photo deleted
  assert.ok(mock.state.receipts.get(r.id).deleted_at);
  await a.sync.sync();                                   // pulls that, then removes the file
  assert.equal(mock.state.objects.has(r.path), false);
  assert.ok(mock.state.receipts.get(r.id).purged_at);
  assert.ok(!needsPurge((await receiptsOf(a))[0]!, A));
});

test('a picture that is no longer on the phone and never went up is dropped, not retried for ever', async () => {
  reset();
  const a = device(); await a.signIn();
  const e = entry();
  await a.store.putEntries([e]);
  const r = await photo(a, e.id, 1000, false);
  await a.sync.sync();
  assert.equal(a.sync.getState().mode, 'idle', a.sync.getState().error ?? '');
  const row = (await receiptsOf(a))[0]!;
  assert.ok(row.deleted_at && row.purged_at);
  assert.equal(mock.state.objects.has(r.path), false);
  assert.equal(a.sync.getState().pending, 0);
});

test('a refused upload is reported and does not stop the other photo', async () => {
  reset();
  const a = device(); await a.signIn();
  const e = entry();
  await a.store.putEntries([e]);
  const big = makeReceipt(e.id, await uidOf(a), 1000, iso());          // declared small, but the file is over 1 MB
  await a.store.putReceipts([big]);                                      // first in line, so the photo after it must still go up
  await a.store.putBlob(big.id, jpeg(1_048_577));
  const fine = await photo(a, e.id, 2000);
  await a.sync.sync();
  assert.equal(a.sync.getState().mode, 'error');
  assert.match(a.sync.getState().error ?? '', /maximum allowed size/);
  assert.ok(mock.state.objects.has(fine.path), 'the other photo went up');
  assert.ok(!mock.state.objects.has(big.path));
});

test('an upload that finds the file already there counts as done', async () => {
  reset();
  const a = device(); await a.signIn();
  const e = entry();
  await a.store.putEntries([e]);
  const r = await photo(a, e.id, 1500);
  mock.state.objects.set(r.path, { bytes: 1500, owner: await uidOf(a), type: 'image/jpeg', data: Buffer.alloc(1500) });
  await a.sync.sync();
  assert.equal(a.sync.getState().mode, 'idle', a.sync.getState().error ?? '');
  assert.ok((await receiptsOf(a))[0]!.uploaded_at);
});

test('photo rows from the server that fail validation are ignored', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const e = shared(gid, A, { [A]: 5, [B]: 5 });
  await a.store.putEntries([e]); await a.sync.sync();
  const now = iso();
  mock.state.receipts.set('00000000-0000-4000-8000-0000000000e1', { id: '00000000-0000-4000-8000-0000000000e1', entry_id: e.id, owner_id: A, path: `${A}/other.jpg`, bytes: 10, created_at: now, updated_at: now, uploaded_at: null, deleted_at: null, purged_at: null, synced_at: now });
  mock.state.receipts.set('00000000-0000-4000-8000-0000000000e2', { id: '00000000-0000-4000-8000-0000000000e2', entry_id: e.id, owner_id: A, path: `${A}/00000000-0000-4000-8000-0000000000e2.jpg`, bytes: 99999999, created_at: now, updated_at: now, uploaded_at: null, deleted_at: null, purged_at: null, synced_at: now });
  await b.sync.sync();
  assert.equal(b.sync.getState().mode, 'idle', b.sync.getState().error ?? '');
  assert.equal((await receiptsOf(b)).length, 0);
});

test("leaving a group forgets the other people's photos and the pictures cached for them", async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const e = shared(gid, A, { [A]: 10 });
  await a.store.putEntries([e]);
  const r = await photo(a, e.id);
  await a.sync.sync(); await b.sync.sync();
  await b.sync.receiptBlob((await receiptsOf(b))[0]!);
  assert.ok(await b.store.getBlob(r.id));
  await a.sync.removeMember(gid, B);
  await b.sync.sync();
  assert.equal((await receiptsOf(b)).length, 0);
  assert.equal(await b.store.getBlob(r.id), undefined);
});

test('the history of a shared expense is fetched for members only', async () => {
  const { a, b, gid, A, B } = await twoInAGroup();
  const c = device('c@example.com'); await c.signIn();
  const e = shared(gid, A, { [A]: 50, [B]: 50 });
  await a.store.putEntries([e]);
  await a.sync.sync();
  await a.store.mutateEntries([e.id], (cur) => editEntry(cur!, { note: 'with tip' }, iso(5000)));
  await a.sync.sync();
  const rows = await b.sync.fetchHistory(e.id);
  assert.deepEqual(rows.map((r) => r.kind), ['edited', 'created'], 'newest first');
  assert.equal(rows[0]!.changes.note.to, 'with tip');
  assert.equal(rows[0]!.changed_by, A);
  assert.deepEqual(await c.sync.fetchHistory(e.id), [], 'a stranger gets nothing');
});

test('the my-share link travels with the payment to the other phone', async () => {
  reset();
  const a = device(); const a2 = device();
  await a.signIn(); await a2.signIn();
  const src = '10000000-0000-4000-8000-0000000000aa';
  const e = entry({ shareOf: src });
  await a.store.putEntries([e]);
  await a.sync.sync(); await a2.sync.sync();
  assert.equal(mock.state.entries.get(e.id).share_of, src);
  assert.equal((await a2.store.getEntry(e.id))!.share_of, src);
});

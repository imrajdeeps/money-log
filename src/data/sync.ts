// Cloud sync with Supabase over its plain REST endpoints (no client library, so there is no extra third-party code).
//   Sign-in:  POST /auth/v1/otp, POST /auth/v1/verify, POST /auth/v1/signup, POST /auth/v1/token?grant_type=password|refresh_token,
//             PUT /auth/v1/user, POST /auth/v1/logout
//   Data:     /rest/v1/entries and /rest/v1/plan_blocks (PostgREST). Row-level security in the database decides what
//             each signed-in user may read or write; this code never relies on filtering rows client-side for safety.
//
// Entries are written to the phone first. Each carries dirty = 1 until a push succeeds, so nothing is lost offline.
import { authMessage, checkPassword } from './password.ts';
import { cleanGroup, cleanInvite, cleanMember, cleanSettlement, mergeRemoteSettlement } from '../core/groups.ts';
import type { Group, Invite, Member, Settlement, UsualSplit } from '../core/groups.ts';
import type { GroupKind } from '../core/groupKinds.ts';
import { cleanCircleMember } from '../core/circle.ts';
import { parseSharedGoals } from '../core/sharedGoals.ts';
import type { CircleMember } from '../core/circle.ts';
import { cleanHistory } from '../core/history.ts';
import type { HistoryRow } from '../core/history.ts';
import { cleanEntry, mergeRemote, newId, parseTs } from '../core/logic.ts';
import type { Entry } from '../core/logic.ts';
import { cleanReceipt, markDeleted, markPurged, markUploaded, mergeRemoteReceipt, needsPurge, needsUpload } from '../core/receipts.ts';
import type { Receipt } from '../core/receipts.ts';
import { PAGE, PUSH_CHUNK, OVERLAP_MS, SyncError } from './syncTypes.ts';
import type { Session, SyncOptions, SyncState } from './syncTypes.ts';
import { MERGED } from './syncBlocks.ts';
import type { Items, ProfileBlock } from './syncBlocks.ts';
import { cleanName, isIndianNumber } from '../core/profile.ts';
import { parseSessions, parseSignInLog } from '../core/signins.ts';
import { isRefusal, pushable, toReceiptRow, toRow, toSettlementRow } from './syncRows.ts';
import { tr } from '../core/i18n.ts';

// Everything other files used to import from here still comes from here.
export type { SyncConfig, SyncMode, SyncOptions, SyncState } from './syncTypes.ts';
export { SyncError } from './syncTypes.ts';
export type { GoalsBlock, MineBlock, ProfileBlock, RecurBlock } from './syncBlocks.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createSync(opts: SyncOptions) {
  const { store, config } = opts;
  const now = opts.now ?? Date.now;
  const fetchFn: typeof fetch = opts.fetchFn ?? ((...a) => fetch(...a));
  const enabled = Boolean(config.supabaseUrl && config.supabaseKey);
  const base = config.supabaseUrl.replace(/\/+$/, '');

  let state: SyncState = { mode: enabled ? 'signedout' : 'local', pending: 0, lastSync: null, error: null, email: null };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  const getSession = () => store.getMeta<Session>('session');

  async function errorText(res: Response): Promise<string> {
    try {
      const j: any = await res.json();
      return String(j.message || j.msg || j.error_description || j.error || `HTTP ${res.status}`);
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  function toSession(j: any, prev?: Session): Session {
    const access = j?.access_token;
    const refresh = j?.refresh_token ?? prev?.refresh_token;
    const uid = j?.user?.id ?? prev?.user_id;
    if (typeof access !== 'string' || typeof refresh !== 'string' || typeof uid !== 'string') {
      throw new SyncError('http', tr('The sign-in response was not what this app expects.'));
    }
    return {
      access_token: access,
      refresh_token: refresh,
      expires_at: typeof j.expires_at === 'number' ? j.expires_at : Math.floor(now() / 1000) + (typeof j.expires_in === 'number' ? j.expires_in : 3600),
      user_id: uid,
      email: String(j?.user?.email ?? prev?.email ?? ''),
    };
  }

  // One refresh at a time: refresh tokens rotate, so two parallel refreshes would invalidate each other.
  let refreshing: Promise<Session | null> | null = null;
  function refresh(): Promise<Session | null> {
    if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function doRefresh(): Promise<Session | null> {
    const s = await getSession();
    if (!s) return null;
    let res: Response;
    try {
      res = await fetchFn(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
    } catch {
      throw new SyncError('offline', 'No connection');
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      await store.delMeta('session');
      set({ mode: 'signedout', email: null });
      throw new SyncError('signed-out', tr('Your sign-in expired. Please sign in again.'));
    }
    if (!res.ok) throw new SyncError('http', await errorText(res), res.status);
    const next = toSession(await res.json(), s);
    await store.setMeta('session', next);
    return next;
  }

  async function accessToken(): Promise<string | null> {
    let s: Session | null | undefined = await getSession();
    if (!s) return null;
    if (s.expires_at - now() / 1000 < 60) s = await refresh();
    return s ? s.access_token : null;
  }

  async function request(path: string, o: { method?: string; body?: unknown; headers?: Record<string, string>; auth?: boolean; retry?: boolean } = {}): Promise<any> {
    const { method = 'GET', body, headers = {}, auth = true, retry = true } = o;
    const h: Record<string, string> = { apikey: config.supabaseKey, ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (auth) {
      const token = await accessToken();
      if (!token) throw new SyncError('signed-out', tr('Signed out'));
      h.Authorization = `Bearer ${token}`;
    }
    let res: Response;
    try {
      res = await fetchFn(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new SyncError('offline', 'No connection');
    }
    if (res.status === 401 && auth && retry) {
      await refresh();
      return request(path, { ...o, retry: false });
    }
    if (!res.ok) throw new SyncError('http', await errorText(res), res.status);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ------------------------------------------------------------ sign in / out
  // Sign-in by emailed code. No screen offers it now: Supabase's free built-in email cannot send a code (its templates are locked
  // to a link without a custom email service), so the app signs in with email and password. Kept because the tests sign their
  // phones in with it, and a project that sets up its own email service could offer it again.
  async function requestCode(email: string): Promise<void> {
    if (!enabled) throw new SyncError('http', tr('Cloud sync is not set up in this build.'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SyncError('http', tr('Enter a valid email address.'));
    await request('/auth/v1/otp', { method: 'POST', auth: false, body: { email, create_user: true } });
  }

  async function verifyCode(email: string, code: string): Promise<void> {
    if (!/^\d{4,10}$/.test(code.trim())) throw new SyncError('http', tr('The code is the 6 digits from the email.'));
    const res = await request('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token: code.trim() } });
    await finishSignIn(res);
  }

  // Every way of signing in ends here: keep the session, and refuse a phone that still holds another account's data.
  async function finishSignIn(res: unknown): Promise<void> {
    const sess = toSession(res);
    const owner = await store.getMeta<string>('localOwner');
    if (owner && owner !== sess.user_id) {
      throw new SyncError('owner-mismatch', tr('This phone still holds data from a different account. Use "Erase everything on this phone" in Settings first, then sign in.'));
    }
    await store.setMeta('session', sess);
    await store.setMeta('localOwner', sess.user_id);
    set({ mode: 'idle', email: sess.email, error: null });
    await refreshPending();
  }

  // ------------------------------------------------------------ email and password (Supabase Auth, plain HTTP)
  // The service's answers become readable messages; the password itself is sent once and never stored on the phone.
  async function authRequest(path: string, o: Parameters<typeof request>[1] = {}): Promise<any> {
    try {
      return await request(path, o);
    } catch (e) {
      if (e instanceof SyncError && e.kind === 'http') throw new SyncError('http', authMessage(e.status, e.message), e.status);
      throw e;
    }
  }
  const validEmail = (email: string) => {
    if (!enabled) throw new SyncError('http', tr('Cloud sync is not set up in this build.'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SyncError('http', tr('Enter a valid email address.'));
  };

  // 'signed-in' when the project lets new accounts in at once; 'confirm' when it first wants the email confirmed
  // (Supabase's "Confirm email" setting), in which case the person signs in after opening the link.
  async function signUp(email: string, password: string): Promise<'signed-in' | 'confirm'> {
    validEmail(email);
    const bad = checkPassword(password, email);
    if (bad) throw new SyncError('http', bad);
    const res = await authRequest('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password } });
    if (res && typeof res.access_token === 'string') { await finishSignIn(res); return 'signed-in'; }
    return 'confirm';
  }

  async function signInWithPassword(email: string, password: string): Promise<void> {
    validEmail(email);
    if (!password) throw new SyncError('http', tr('Enter your password.'));
    const res = await authRequest('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } });
    await finishSignIn(res);
  }

  // "Forgot password": Supabase emails a link that comes back to this page (redirectTo) with a short-lived session in its
  // address (src/authlink.ts reads it). It answers the same whether or not the address has an account, so nothing is
  // revealed about who has one. With Supabase's free built-in email it only reaches your own team's addresses.
  async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    validEmail(email);
    await authRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', auth: false, body: { email } });
  }

  // A reset link carries a session of its own. Ask who it belongs to, then keep it like any other sign-in (including the
  // refusal when this phone still holds another account's data); the person is then signed in and chooses a new password.
  async function signInWithRecovery(link: { accessToken: string; refreshToken: string; expiresIn: number }): Promise<void> {
    if (!enabled) throw new SyncError('http', tr('Cloud sync is not set up in this build.'));
    let res: Response;
    try {
      res = await fetchFn(`${base}/auth/v1/user`, { headers: { apikey: config.supabaseKey, Authorization: `Bearer ${link.accessToken}` } });
    } catch {
      throw new SyncError('offline', 'No connection');
    }
    if (!res.ok) {
      const expired = res.status === 401 || res.status === 403;
      throw new SyncError('http', expired ? tr('That link has expired or was already used. Ask for a new one.') : authMessage(res.status, await errorText(res)), res.status);
    }
    const user: any = await res.json();
    await finishSignIn({ access_token: link.accessToken, refresh_token: link.refreshToken, expires_in: link.expiresIn, user: { id: user?.id, email: user?.email } });
  }

  // Sets the first password of an account that signed in with a code, or changes the current one.
  async function changePassword(password: string): Promise<void> {
    const bad = checkPassword(password, state.email ?? '');
    if (bad) throw new SyncError('http', bad);
    await authRequest('/auth/v1/user', { method: 'PUT', body: { password } });
  }

  // The other devices lose their refresh tokens at once; an access token already issued works until it runs out
  // (up to an hour), which the service cannot shorten.
  async function signOutOthers(): Promise<void> {
    await authRequest('/auth/v1/logout?scope=others', { method: 'POST' });
  }

  // Every device including this one. Needs the connection: the service has to confirm before this phone forgets its own.
  async function signOutEverywhere(): Promise<void> {
    try {
      await authRequest('/auth/v1/logout?scope=global', { method: 'POST' });
    } catch (e) {
      if (!(e instanceof SyncError && e.kind === 'signed-out')) throw e; // already signed out on the server: just forget it here
    }
    await store.delMeta('session');
    set({ mode: enabled ? 'signedout' : 'local', email: null, error: null });
  }

  async function signOut(): Promise<void> {
    const s = await getSession();
    if (s && enabled) {
      // scope=local signs out this phone only; the default would sign out every device the owner uses.
      try { await fetchFn(`${base}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: config.supabaseKey, Authorization: `Bearer ${s.access_token}` } }); } catch { /* signing out locally is what matters */ }
    }
    await store.delMeta('session');
    set({ mode: enabled ? 'signedout' : 'local', email: null, error: null });
  }

  // Erase must not race a sync that is already running: a late pull response would write rows (and a cursor) back
  // into the freshly wiped phone and hide older rows from the next sign-in for good.
  let erasing = false;
  async function eraseAll(): Promise<void> {
    erasing = true;
    try {
      if (running) await running.catch(() => undefined);
      await signOut();
      await store.wipe();
      set({ pending: 0, lastSync: null, error: null });
    } finally {
      erasing = false;
    }
  }

  // ------------------------------------------------------------ push
  // The groups this phone's account is in right now, or null before the first pull has told us.
  async function activeGroups(): Promise<Set<string> | null> {
    const g = await store.getMeta<Group[]>('groups');
    return g ? new Set(g.map((x) => x.id)) : null;
  }

  async function refreshPending(): Promise<void> {
    const uid = (await store.getMeta<string>('localOwner')) ?? null;
    const active = await activeGroups();
    const entries = await store.allEntries();
    let pending = entries.filter((e) => e.dirty && pushable(e, uid, active)).length;
    pending += (await store.allSettlements()).filter((x) => x.dirty && pushable({ owner_id: x.created_by, group_id: x.group_id }, uid, active)).length;
    pending += (await store.allReceipts()).filter((r) => r.owner_id === uid && (r.dirty || needsUpload(r, uid) || needsPurge(r, uid))).length;
    for (const m of MERGED) if ((await store.getMeta<{ dirty: 0 | 1 }>(m.meta))?.dirty) pending++;
    if ((await store.getMeta<ProfileBlock>('profile'))?.dirty) pending++;
    set({ pending });
  }

  // Entries that came from another account (a backup restored here) could clash with that account's rows, whose ids
  // they share, and the database would refuse them. Give those entries fresh ids so they upload as new, private copies
  // (a group they belonged to is not ours). Rows other people shared with us are clean, never touched here.
  async function reown(uid: string): Promise<void> {
    const foreign = (await store.allEntries()).filter((e) => e.dirty && e.owner_id && e.owner_id !== uid);
    if (!foreign.length) return;
    await store.putEntries(foreign.map((e) => ({ ...e, id: newId(), owner_id: null, group_id: null, paid_by: null, shares: null, dirty: 1 as const })));
    await store.deleteEntries(foreign.map((e) => e.id));
  }

  // Sends dirty rows in chunks. One bad row must not block the others: when a chunk is refused, its rows go one at a time.
  async function pushDirty<T extends { id: string }>(path: string, list: T[], row: (x: T) => object, markClean: (chunk: T[]) => Promise<void>): Promise<void> {
    let firstRefusal: SyncError | null = null;
    const send = async (chunk: T[]) => {
      await request(path, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: chunk.map(row) });
      await markClean(chunk);
    };
    for (let i = 0; i < list.length; i += PUSH_CHUNK) {
      const chunk = list.slice(i, i + PUSH_CHUNK);
      try {
        await send(chunk);
        continue;
      } catch (e) {
        if (!isRefusal(e)) throw e;
        if (chunk.length === 1) { firstRefusal ??= e; continue; }
      }
      for (const one of chunk) {
        try { await send([one]); } catch (e) { if (!isRefusal(e)) throw e; firstRefusal ??= e; }
      }
    }
    if (firstRefusal) throw firstRefusal;
  }

  async function pushEntries(uid: string): Promise<void> {
    await reown(uid);
    const active = await activeGroups();
    const dirty = (await store.allEntries()).filter((e) => e.dirty && pushable(e, uid, active));
    await pushDirty('/rest/v1/entries?on_conflict=id', dirty, (e) => toRow(e, uid), async (chunk) => {
      // Mark clean only if the entry was not edited again while the request was in flight (checked in one transaction).
      const sent = new Map(chunk.map((e) => [e.id, e.updated_at]));
      await store.mutateEntries([...sent.keys()], (cur, id) => (cur && cur.updated_at === sent.get(id) ? { ...cur, owner_id: uid, dirty: 0 } : undefined));
    });
  }

  async function pushSettlements(uid: string): Promise<void> {
    const active = await activeGroups();
    const dirty = (await store.allSettlements()).filter((x) => x.dirty && pushable({ owner_id: x.created_by, group_id: x.group_id }, uid, active));
    await pushDirty('/rest/v1/settlements?on_conflict=id', dirty, (x) => toSettlementRow(x, uid), async (chunk) => {
      const sent = new Map(chunk.map((x) => [x.id, x.updated_at]));
      await store.mutateSettlements([...sent.keys()], (cur, id) => (cur && cur.updated_at === sent.get(id) ? { ...cur, created_by: uid, dirty: 0 } : undefined));
    });
  }

  async function pushBlocks(uid: string): Promise<void> {
    for (const m of MERGED) {
      const mine = await store.getMeta<{ items: Items; dirty: 0 | 1 }>(m.meta);
      if (!mine?.dirty) continue;
      const sent = mine.items;
      await request('/rest/v1/plan_blocks?on_conflict=owner_id,block', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: [{ owner_id: uid, block: m.block, imported_at: new Date(now()).toISOString(), payload: { v: 1, items: sent } }],
      });
      // Clear the flag only if nothing changed on this phone while the request was in flight.
      await store.mutateMeta<{ items: Items; dirty: 0 | 1 }>(m.meta, (cur) => (cur && m.same(cur.items, sent) ? { ...cur, dirty: 0 } : undefined));
    }
  }

  // ------------------------------------------------------------ receipt photos (rows in the database, pictures in Storage)
  // Storage is plain HTTP too: POST uploads a file, GET reads one from a private bucket, DELETE removes one.
  async function storageFetch(path: string, o: { method?: string; body?: Blob; headers?: Record<string, string>; retry?: boolean } = {}): Promise<Response> {
    const { method = 'GET', body, headers = {}, retry = true } = o;
    const token = await accessToken();
    if (!token) throw new SyncError('signed-out', tr('Signed out'));
    let res: Response;
    try {
      res = await fetchFn(base + path, { method, headers: { apikey: config.supabaseKey, Authorization: `Bearer ${token}`, ...headers }, body });
    } catch {
      throw new SyncError('offline', 'No connection');
    }
    if (res.status === 401 && retry) {
      await refresh();
      return storageFetch(path, { ...o, retry: false });
    }
    return res;
  }

  async function uploadObject(path: string, blob: Blob): Promise<void> {
    const res = await storageFetch(`/storage/v1/object/receipts/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
    if (res.ok) return;
    const msg = await errorText(res);
    if (res.status === 409 || /already exists|duplicate/i.test(msg)) return; // an earlier attempt got through
    throw new SyncError('http', msg, res.status);
  }

  async function deleteObject(path: string): Promise<void> {
    const res = await storageFetch(`/storage/v1/object/receipts/${path}`, { method: 'DELETE' });
    if (res.ok || res.status === 404) return; // already gone is fine
    throw new SyncError('http', await errorText(res), res.status);
  }

  // The picture of a photo: this phone's copy if it has one, else fetched from the cloud (and kept).
  async function receiptBlob(r: Receipt): Promise<Blob> {
    const have = await store.getBlob(r.id);
    if (have) return have;
    if (!r.uploaded_at) throw new SyncError('http', tr('This photo has not been uploaded yet.'));
    const res = await storageFetch(`/storage/v1/object/authenticated/receipts/${r.path}`);
    if (!res.ok) throw new SyncError('http', res.status === 404 ? tr('This photo is not available.') : await errorText(res), res.status);
    const blob = await res.blob();
    if (blob.size > 2_097_152) throw new SyncError('http', tr('This photo is larger than expected.'));
    const jpeg = blob.type === 'image/jpeg' ? blob : new Blob([blob], { type: 'image/jpeg' });
    if (!(await store.getBlob(r.id))) await store.putBlob(r.id, jpeg);
    return jpeg;
  }

  async function fetchHistory(entryId: string): Promise<HistoryRow[]> {
    if (!enabled) throw new SyncError('http', tr('Cloud sync is not set up in this build.'));
    const rows: any[] = (await request(`/rest/v1/entry_history?select=*&entry_id=eq.${encodeURIComponent(entryId)}&order=changed_at.desc&limit=100`)) ?? [];
    return rows.map(cleanHistory).filter((x): x is HistoryRow => x !== null);
  }

  // Rows first (the database must know a photo before its file may be uploaded), then the files, then the removals, then
  // the rows again so "uploaded" and "purged" reach the cloud in the same run. A payment that is itself still waiting to
  // be sent holds its photos back.
  async function pushReceiptRows(uid: string): Promise<void> {
    const entries = await store.allEntries();
    const waiting = new Set(entries.filter((e) => e.dirty).map((e) => e.id));
    const known = new Set(entries.map((e) => e.id));
    const dirty = (await store.allReceipts()).filter((r) => r.dirty && r.owner_id === uid && known.has(r.entry_id) && !waiting.has(r.entry_id));
    await pushDirty('/rest/v1/receipts?on_conflict=id', dirty, (r) => toReceiptRow(r, uid), async (chunk) => {
      const sent = new Map(chunk.map((r) => [r.id, r.updated_at]));
      await store.mutateReceipts([...sent.keys()], (cur, id) => (cur && cur.updated_at === sent.get(id) ? { ...cur, dirty: 0 } : undefined));
    });
  }

  async function pushReceipts(uid: string): Promise<void> {
    const nowIso = () => new Date(now()).toISOString();
    let firstRefusal: SyncError | null = null;
    await pushReceiptRows(uid);
    // upload the pictures of photos the database already knows
    for (const r of (await store.allReceipts()).filter((x) => needsUpload(x, uid) && !x.dirty)) {
      const blob = await store.getBlob(r.id);
      if (!blob) { // the picture is no longer on this phone and never reached the cloud: the photo is lost, so drop it
        await store.mutateReceipts([r.id], (cur) => (cur ? markPurged(markDeleted(cur, nowIso()), nowIso()) : undefined));
        continue;
      }
      try {
        await uploadObject(r.path, blob);
        await store.mutateReceipts([r.id], (cur) => (cur && !cur.uploaded_at ? markUploaded(cur, nowIso()) : undefined));
      } catch (e) {
        if (!isRefusal(e)) throw e;
        firstRefusal ??= e;
      }
    }
    // remove the files of deleted photos (the database allows "purged" only once the file is really gone)
    for (const r of (await store.allReceipts()).filter((x) => needsPurge(x, uid) && !x.dirty)) {
      try {
        await deleteObject(r.path);
        await store.mutateReceipts([r.id], (cur) => (cur ? markPurged(cur, nowIso()) : undefined));
      } catch (e) {
        if (!isRefusal(e)) throw e;
        firstRefusal ??= e;
      }
    }
    await pushReceiptRows(uid);
    const stale = (await store.allReceipts()).filter((r) => r.deleted_at).map((r) => r.id);
    await store.deleteBlobs(stale);
    if (firstRefusal) throw firstRefusal;
  }

  // ------------------------------------------------------------ pull
  // Reads one table in the order the server wrote it, newest changes last. Page by position (the last timestamp seen), not
  // by offset: rows edited on another phone while we page move to the end of the order and are picked up there, instead of
  // shifting everything and making us skip rows.
  async function pullKeyset<T extends { id: string }>(
    table: string, cursorKey: string, clean: (row: any) => T | null, merge: (rows: Map<string, T>) => Promise<void>,
  ): Promise<void> {
    const cursor = await store.getMeta<string>(cursorKey);
    let since: string | null = cursor && Number.isFinite(parseTs(cursor)) ? new Date(parseTs(cursor) - OVERLAP_MS).toISOString() : null;
    let max = cursor ?? null;
    const seen = new Set<string>();
    for (;;) {
      const q = `/rest/v1/${table}?select=*&order=synced_at.asc,id.asc&limit=${PAGE}` + (since ? `&synced_at=gte.${encodeURIComponent(since)}` : '');
      const rows: any[] = (await request(q)) ?? [];
      const remote = new Map<string, T>();
      let fresh = 0;
      for (const r of rows) {
        if (typeof r.synced_at === 'string' && (!max || parseTs(r.synced_at) > parseTs(max))) max = r.synced_at;
        const key = `${r.id}|${r.synced_at}`;
        if (seen.has(key)) continue; // the boundary row comes back at the start of the next page
        seen.add(key);
        fresh++;
        const e = clean({ ...r, dirty: 0 });
        if (e) remote.set(e.id, e);
      }
      await merge(remote);
      const last = rows.at(-1)?.synced_at;
      if (rows.length < PAGE || fresh === 0 || typeof last !== 'string') break;
      since = last;
    }
    if (max) await store.setMeta(cursorKey, max);
  }

  // Merge inside one transaction so a local edit made at this moment cannot be overwritten by a stale read.
  const pullEntries = () => pullKeyset<Entry>('entries', 'pullCursor', cleanEntry, (remote) =>
    store.mutateEntries([...remote.keys()], (cur, id) => {
      const merged = mergeRemote(cur, remote.get(id)!);
      return merged === cur ? undefined : merged;
    }));

  const pullSettlements = () => pullKeyset<Settlement>('settlements', 'settleCursor', cleanSettlement, (remote) =>
    store.mutateSettlements([...remote.keys()], (cur, id) => {
      const merged = mergeRemoteSettlement(cur, remote.get(id)!);
      return merged === cur ? undefined : merged;
    }));

  const pullReceipts = async () => {
    await pullKeyset<Receipt>('receipts', 'receiptCursor', cleanReceipt, (remote) =>
      store.mutateReceipts([...remote.keys()], (cur, id) => {
        const merged = mergeRemoteReceipt(cur, remote.get(id)!);
        return merged === cur ? undefined : merged;
      }));
    // a picture whose photo was deleted (here or on another phone) is not kept
    const all = await store.allReceipts();
    const have = new Set(await store.allBlobIds());
    await store.deleteBlobs(all.filter((r) => r.deleted_at && have.has(r.id)).map((r) => r.id));
  };

  // The groups this account is in (the database only shows those), their members, and the invite codes of the ones this
  // account administers. When the list of groups changes, everything the new groups hold is older than our cursors, so the
  // cursors are dropped and the next reads start from the beginning; rows of groups we left are forgotten.
  async function pullGroups(uid: string): Promise<void> {
    const list = async <T>(path: string, clean: (r: any) => T | null): Promise<T[]> => {
      const rows: any[] = (await request(path)) ?? [];
      return rows.map(clean).filter((x): x is T => x !== null);
    };
    const groups = await list<Group>('/rest/v1/groups?select=*&order=created_at.asc', cleanGroup);
    const members = await list<Member>('/rest/v1/group_members?select=*', cleanMember);
    const invites = await list<Invite>('/rest/v1/group_invites?select=*', cleanInvite);
    await store.setMeta('groups', groups);
    await store.setMeta('members', members);
    await store.setMeta('invites', invites);
    const key = groups.map((g) => g.id).sort().join(',');
    if ((await store.getMeta<string>('groupsKey')) !== key) {
      await store.delMeta('pullCursor');
      await store.delMeta('settleCursor');
      await store.delMeta('receiptCursor');
      await store.setMeta('groupsKey', key);
    }
    const active = new Set(groups.map((g) => g.id));
    await store.deleteEntries((await store.allEntries()).filter((e) => e.group_id && !active.has(e.group_id) && e.owner_id && e.owner_id !== uid && !e.dirty).map((e) => e.id));
    await store.deleteSettlements((await store.allSettlements()).filter((x) => !active.has(x.group_id)).map((x) => x.id));
    // photos of expenses this phone no longer holds (we left the group) go too, with their cached pictures
    const held = new Set((await store.allEntries()).map((e) => e.id));
    const gone = (await store.allReceipts()).filter((r) => r.owner_id !== uid && !held.has(r.entry_id)).map((r) => r.id);
    await store.deleteReceipts(gone);
    await store.deleteBlobs(gone);
  }

  async function pullBlocks(): Promise<void> {
    const rows: any[] = (await request('/rest/v1/plan_blocks?select=block,imported_at,payload')) ?? [];
    for (const row of rows) {
      const kind = MERGED.find((m) => m.block === row.block);
      if (kind) {
        // Merge per item; if this phone knows something the cloud does not, mark it to be pushed.
        const remote = kind.clean(row.payload?.items);
        await store.mutateMeta<{ items: Items; dirty: 0 | 1 }>(kind.meta, (cur) => {
          const merged = kind.merge(cur?.items ?? {}, remote);
          const dirty: 0 | 1 = cur?.dirty || !kind.same(merged, remote) ? 1 : 0;
          return cur && kind.same(cur.items, merged) && cur.dirty === dirty ? undefined : { items: merged, dirty };
        });
        continue;
      }
    }
  }

  // ------------------------------------------------------------ the profile (one row per account)
  // The latest change wins, like an entry. Only an Indian number goes up (the table refuses any other): a number saved before that
  // rule stays on the phone, and the row simply carries none. A part that must never stop the rest: if the profiles table is not
  // there yet (the database has not had the version 1.23 SQL) the answer is 404 and the profile waits.
  async function profilePart(f: () => Promise<void>): Promise<void> {
    try { await f(); } catch (e) { if (!(e instanceof SyncError && e.kind === 'http' && e.status === 404)) throw e; }
  }

  async function pullProfile(uid: string): Promise<void> {
    const rows: any[] = (await request(`/rest/v1/profiles?select=name,whatsapp,updated_at&user_id=eq.${uid}`)) ?? [];
    const row = rows[0];
    if (!row || !Number.isFinite(parseTs(row.updated_at)) || typeof row.whatsapp !== 'string' || (row.whatsapp !== '' && !isIndianNumber(row.whatsapp))) return;
    const when = row.updated_at as string;
    await store.mutateMeta<ProfileBlock>('profile', (cur) =>
      cur && parseTs(when) <= parseTs(cur.t) ? undefined : { name: cleanName(row.name), whatsapp: row.whatsapp as string, t: when, dirty: 0 });
  }

  async function pushProfile(uid: string): Promise<void> {
    const cur = await store.getMeta<ProfileBlock>('profile');
    if (!cur?.dirty) return;
    await request('/rest/v1/profiles?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ user_id: uid, name: cur.name, whatsapp: isIndianNumber(cur.whatsapp) ? cur.whatsapp : '', updated_at: cur.t }],
    });
    // Clear the flag only if the profile was not changed again while the request was in flight.
    await store.mutateMeta<ProfileBlock>('profile', (c) => (c && c.t === cur.t ? { ...c, dirty: 0 } : undefined));
  }

  // ------------------------------------------------------------ one sync run (never two at once)
  let running: Promise<void> | null = null;
  let again = false;

  async function runOnce(): Promise<void> {
    const s = await getSession();
    if (!s) { set({ mode: 'signedout', email: null }); return; }
    set({ mode: 'syncing', email: s.email, error: null });
    try {
      // Pull first so that the latest edit wins, then push whatever is still newer on this phone.
      await pullBlocks();
      await pullGroups(s.user_id);
      await pullEntries();
      await pullSettlements();
      await pullReceipts();
      await profilePart(() => pullProfile(s.user_id));
      await pushBlocks(s.user_id);
      await profilePart(() => pushProfile(s.user_id));
      await pushEntries(s.user_id);
      await pushSettlements(s.user_id);
      await pushReceipts(s.user_id);
      const t = now();
      await store.setMeta('lastSync', t);
      await refreshPending();
      set({ mode: 'idle', lastSync: t, error: null });
    } catch (e) {
      await refreshPending();
      if (e instanceof SyncError) {
        if (e.kind === 'offline') set({ mode: 'offline', error: null });
        else if (e.kind === 'signed-out') set({ mode: 'signedout', email: null, error: e.message });
        else set({ mode: 'error', error: e.message });
      } else {
        set({ mode: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      opts.onDataChanged?.();
    }
  }

  function sync(): Promise<void> {
    if (!enabled || erasing) return Promise.resolve();
    if (running) { again = true; return running; } // a change arrived mid-run: go round once more
    running = (async () => {
      try {
        do { again = false; await runOnce(); } while (again && !erasing);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // ------------------------------------------------------------ group management (needs a connection)
  // These are the database functions in schema.sql; each one checks the rules itself. Afterwards we sync, so the new
  // group, member list or code shows up straight away.
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!enabled) throw new SyncError('http', tr('Cloud sync is not set up in this build.'));
    const out = await request(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });
    await sync();
    return out as T;
  }
  const createGroup = (name: string, kind: GroupKind, displayName: string) => rpc<string>('create_group', { p_name: name, p_kind: kind, p_display_name: displayName });
  const joinGroup = (code: string, displayName: string) => rpc<string>('join_group', { p_code: code, p_display_name: displayName });
  const resetInvite = (groupId: string) => rpc<string>('reset_invite', { p_group: groupId });
  const leaveGroup = (groupId: string) => rpc<null>('leave_group', { p_group: groupId });
  const removeMember = (groupId: string, userId: string) => rpc<null>('remove_member', { p_group: groupId, p_user: userId });
  const makeAdmin = (groupId: string, userId: string) => rpc<null>('make_admin', { p_group: groupId, p_user: userId });
  const revokeAdmin = (groupId: string, userId: string) => rpc<null>('revoke_admin', { p_group: groupId, p_user: userId });
  const makePrimaryAdmin = (groupId: string, userId: string) => rpc<null>('make_primary_admin', { p_group: groupId, p_user: userId });
  const claimPrimaryAdmin = (groupId: string) => rpc<null>('claim_primary_admin', { p_group: groupId });
  const setDisplayName = (groupId: string, name: string) => rpc<null>('set_display_name', { p_group: groupId, p_name: name });
  const setTripDates = (groupId: string, starts: string | null, ends: string | null) => rpc<null>('set_trip_dates', { p_group: groupId, p_starts: starts, p_ends: ends });
  const setGroupClosed = (groupId: string, closed: boolean) => rpc<null>('set_group_closed', { p_group: groupId, p_closed: closed });
  const setUsualSplit = (groupId: string, split: UsualSplit | null) => rpc<null>('set_usual_split', { p_group: groupId, p_split: split });

  // The Circle (version 1.28): answered by the server on demand, not part of the sync, so nothing here is kept on the phone.
  async function circleCall<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!enabled) throw new SyncError('http', tr('Cloud sync is not set up in this build.'));
    return (await request(`/rest/v1/rpc/${name}`, { method: 'POST', body: args })) as T;
  }
  const fetchCircle = async (): Promise<CircleMember[]> => {
    const rows = (await circleCall<unknown[] | null>('my_circle', {})) ?? [];
    return rows.map(cleanCircleMember).filter((m): m is CircleMember => m !== null);
  };
  const newCircleCode = () => circleCall<string>('circle_new_invite', {});
  const joinCircle = (code: string) => circleCall<string>('circle_join', { p_code: code });
  const removeFromCircle = (userId: string) => circleCall<null>('circle_remove', { p_user: userId });

  // Shared goals (version 1.29): kept by the server and read on demand, like the Circle; nothing is stored on the phone.
  const sharedGoals = {
    load: async () => parseSharedGoals(await circleCall<unknown>('my_shared_goals', {})),
    create: (name: string, target: number, date: string, displayName: string, invite: string[]) =>
      circleCall<string>('create_shared_goal', { p_name: name, p_target: target, p_date: date, p_display_name: displayName, p_invite: invite }),
    edit: (goal: string, name: string, target: number, date: string) => circleCall<null>('edit_shared_goal', { p_goal: goal, p_name: name, p_target: target, p_date: date }),
    invite: (goal: string, userId: string) => circleCall<null>('invite_to_shared_goal', { p_goal: goal, p_user: userId }),
    answer: (goal: string, accept: boolean, displayName: string) => circleCall<null>('answer_shared_goal', { p_goal: goal, p_accept: accept, p_display_name: displayName }),
    leave: (goal: string) => circleCall<null>('leave_shared_goal', { p_goal: goal }),
    removePerson: (goal: string, userId: string) => circleCall<null>('remove_from_shared_goal', { p_goal: goal, p_user: userId }),
    remove: (goal: string) => circleCall<null>('delete_shared_goal', { p_goal: goal }),
    addTopUp: (goal: string, amount: number, date: string) => circleCall<null>('add_shared_topup', { p_goal: goal, p_id: newId(), p_amount: amount, p_date: date }),
    removeTopUp: (goal: string, id: string) => circleCall<null>('remove_shared_topup', { p_goal: goal, p_id: id }),
  };

  // The sign-in record: where the account is signed in now, and what happened to it (the two read-only functions of version 1.25).
  // They answer 404 until the database has them; the caller says "not available yet" then.
  async function fetchSessions() {
    if (!enabled) throw new SyncError('http', tr('Cloud sync is not set up in this build.'));
    return parseSessions(await request('/rest/v1/rpc/my_sessions', { method: 'POST', body: {} }));
  }

  async function fetchSignInLog(limit = 30) {
    if (!enabled) throw new SyncError('http', tr('Cloud sync is not set up in this build.'));
    return parseSignInLog(await request('/rest/v1/rpc/my_sign_in_log', { method: 'POST', body: { p_limit: limit } }));
  }

  async function init(): Promise<void> {
    const s = await getSession();
    const last = await store.getMeta<number>('lastSync');
    set({ mode: enabled ? (s ? 'idle' : 'signedout') : 'local', email: s?.email ?? null, lastSync: last ?? null });
    await refreshPending();
  }

  return {
    enabled,
    getState: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    init,
    requestCode,
    verifyCode,
    signUp,
    signInWithPassword,
    requestPasswordReset,
    signInWithRecovery,
    changePassword,
    signOutOthers,
    signOutEverywhere,
    signOut,
    eraseAll,
    sync,
    refreshPending,
    createGroup, joinGroup, resetInvite, leaveGroup, removeMember, makeAdmin, revokeAdmin, makePrimaryAdmin, claimPrimaryAdmin, setDisplayName, setTripDates, setGroupClosed, setUsualSplit,
    fetchCircle, newCircleCode, joinCircle, removeFromCircle, sharedGoals,
    receiptBlob, fetchHistory, fetchSessions, fetchSignInLog,
  };
}

export type Sync = ReturnType<typeof createSync>;

// Cloud sync with Supabase over its plain REST endpoints (no client library, so there is no extra third-party code).
//   Sign-in:  POST /auth/v1/otp, POST /auth/v1/verify, POST /auth/v1/token?grant_type=refresh_token, POST /auth/v1/logout
//   Data:     /rest/v1/entries and /rest/v1/plan_blocks (PostgREST). Row-level security in the database decides what
//             each signed-in user may read or write; this code never relies on filtering rows client-side for safety.
//
// Entries are written to the phone first. Each carries dirty = 1 until a push succeeds, so nothing is lost offline.
import { cleanEntry, cleanPlan, mergeRemote, newId, parseTs } from './logic.ts';
import type { Entry, Plan } from './logic.ts';
import type { Store } from './store.ts';

export interface SyncConfig { supabaseUrl: string; supabaseKey: string }
export type SyncMode = 'local' | 'signedout' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncState {
  mode: SyncMode;
  pending: number; // changes on this phone not yet in the cloud
  lastSync: number | null;
  error: string | null;
  email: string | null;
}

export class SyncError extends Error {
  kind: 'offline' | 'signed-out' | 'http' | 'owner-mismatch';
  status: number;
  constructor(kind: SyncError['kind'], message: string, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

interface Session { access_token: string; refresh_token: string; expires_at: number; user_id: string; email: string }

export interface SyncOptions {
  store: Store;
  config: SyncConfig;
  fetchFn?: typeof fetch;
  now?: () => number;
  onDataChanged?: () => void;
}

const PAGE = 1000;
const PUSH_CHUNK = 200;
const OVERLAP_MS = 5 * 60 * 1000; // re-read a little before the last cursor so a late-committing write is never missed

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
      throw new SyncError('http', 'The sign-in response was not what this app expects.');
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
      throw new SyncError('signed-out', 'Your sign-in expired. Please sign in again.');
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
      if (!token) throw new SyncError('signed-out', 'Signed out');
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
  async function requestCode(email: string): Promise<void> {
    if (!enabled) throw new SyncError('http', 'Cloud sync is not set up in this build.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SyncError('http', 'Enter a valid email address.');
    await request('/auth/v1/otp', { method: 'POST', auth: false, body: { email, create_user: true } });
  }

  async function verifyCode(email: string, code: string): Promise<void> {
    if (!/^\d{4,10}$/.test(code.trim())) throw new SyncError('http', 'The code is the 6 digits from the email.');
    const res = await request('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token: code.trim() } });
    const sess = toSession(res);
    const owner = await store.getMeta<string>('localOwner');
    if (owner && owner !== sess.user_id) {
      throw new SyncError('owner-mismatch', 'This phone still holds data from a different account. Use "Erase everything on this phone" in Settings first, then sign in.');
    }
    await store.setMeta('session', sess);
    await store.setMeta('localOwner', sess.user_id);
    set({ mode: 'idle', email: sess.email, error: null });
    await refreshPending();
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
  async function refreshPending(): Promise<void> {
    const entries = await store.allEntries();
    const plan = await store.getMeta<Plan>('plan');
    set({ pending: entries.filter((e) => e.dirty).length + (plan?.dirty ? 1 : 0) });
  }

  const toRow = (e: Entry, uid: string) => ({
    id: e.id,
    owner_id: uid,
    entry_date: e.entry_date,
    category: e.category,
    amount: e.amount,
    note: e.note,
    method: e.method,
    created_at: e.created_at,
    updated_at: e.updated_at,
    deleted_at: e.deleted_at,
    exported_at: e.exported_at,
  });

  // Statuses that mean "this data was refused", as opposed to "the server is having a bad moment".
  const isRefusal = (e: unknown): e is SyncError => e instanceof SyncError && e.kind === 'http' && [400, 403, 409, 413, 422].includes(e.status);

  // Entries that came from another account (a backup restored here) could clash with that account's rows, whose ids
  // they share, and the database would refuse them. Give those entries fresh ids so they upload as new copies.
  async function reown(uid: string): Promise<void> {
    const foreign = (await store.allEntries()).filter((e) => e.owner_id && e.owner_id !== uid);
    if (!foreign.length) return;
    await store.putEntries(foreign.map((e) => ({ ...e, id: newId(), owner_id: null, dirty: 1 as const })));
    await store.deleteEntries(foreign.map((e) => e.id));
  }

  async function pushEntries(uid: string): Promise<void> {
    await reown(uid);
    const dirty = (await store.allEntries()).filter((e) => e.dirty);
    let firstRefusal: SyncError | null = null;

    const send = async (chunk: Entry[]) => {
      await request('/rest/v1/entries?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: chunk.map((e) => toRow(e, uid)),
      });
      // Mark clean only if the entry was not edited again while the request was in flight (checked in one transaction).
      const sent = new Map(chunk.map((e) => [e.id, e.updated_at]));
      await store.mutateEntries([...sent.keys()], (cur, id) => (cur && cur.updated_at === sent.get(id) ? { ...cur, owner_id: uid, dirty: 0 } : undefined));
    };

    for (let i = 0; i < dirty.length; i += PUSH_CHUNK) {
      const chunk = dirty.slice(i, i + PUSH_CHUNK);
      try {
        await send(chunk);
        continue;
      } catch (e) {
        if (!isRefusal(e)) throw e;
        if (chunk.length === 1) { firstRefusal ??= e; continue; }
      }
      // The server refused the batch. One bad row must not block the others: retry them one at a time and keep going.
      for (const one of chunk) {
        try { await send([one]); } catch (e) { if (!isRefusal(e)) throw e; firstRefusal ??= e; }
      }
    }
    if (firstRefusal) throw firstRefusal;
  }

  async function pushPlan(uid: string): Promise<void> {
    const plan = await store.getMeta<Plan>('plan');
    if (!plan || !plan.dirty) return;
    await request('/rest/v1/plan_blocks?on_conflict=owner_id,block', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ owner_id: uid, block: 'budget', imported_at: plan.importedAt, payload: { v: plan.v, months: plan.months, rows: plan.rows } }],
    });
    const again = await store.getMeta<Plan>('plan');
    if (again && again.importedAt === plan.importedAt) await store.setMeta('plan', { ...again, dirty: 0 });
  }

  // ------------------------------------------------------------ pull
  async function pullEntries(): Promise<void> {
    const cursor = await store.getMeta<string>('pullCursor');
    let since: string | null = cursor && Number.isFinite(parseTs(cursor)) ? new Date(parseTs(cursor) - OVERLAP_MS).toISOString() : null;
    let max = cursor ?? null;
    const seen = new Set<string>();
    for (;;) {
      // Page by position (the last timestamp seen), not by offset: rows edited on another phone while we page move to
      // the end of the order and are picked up there, instead of shifting everything and making us skip rows.
      const q = `/rest/v1/entries?select=*&order=synced_at.asc,id.asc&limit=${PAGE}` + (since ? `&synced_at=gte.${encodeURIComponent(since)}` : '');
      const rows: any[] = (await request(q)) ?? [];
      const remote = new Map<string, Entry>();
      let fresh = 0;
      for (const r of rows) {
        if (typeof r.synced_at === 'string' && (!max || parseTs(r.synced_at) > parseTs(max))) max = r.synced_at;
        const key = `${r.id}|${r.synced_at}`;
        if (seen.has(key)) continue; // the boundary row comes back at the start of the next page
        seen.add(key);
        fresh++;
        const e = cleanEntry({ ...r, dirty: 0 });
        if (e) remote.set(e.id, e);
      }
      // Merge inside one transaction so a local edit made at this moment cannot be overwritten by a stale read.
      await store.mutateEntries([...remote.keys()], (cur, id) => {
        const merged = mergeRemote(cur, remote.get(id)!);
        return merged === cur ? undefined : merged;
      });
      const last = rows[rows.length - 1]?.synced_at;
      if (rows.length < PAGE || fresh === 0 || typeof last !== 'string') break;
      since = last;
    }
    if (max) await store.setMeta('pullCursor', max);
  }

  async function pullPlan(): Promise<void> {
    const rows: any[] = (await request('/rest/v1/plan_blocks?select=block,imported_at,payload&block=eq.budget')) ?? [];
    const row = rows[0];
    if (!row) return;
    const data = cleanPlan(row.payload);
    if (!data || !Number.isFinite(parseTs(row.imported_at))) return;
    const local = await store.getMeta<Plan>('plan');
    if (local && parseTs(row.imported_at) <= parseTs(local.importedAt)) return; // latest import wins; a newer local one is pushed next
    await store.setMeta('plan', { ...data, importedAt: row.imported_at as string, dirty: 0 } satisfies Plan);
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
      await pullPlan();
      await pullEntries();
      await pushPlan(s.user_id);
      await pushEntries(s.user_id);
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
    signOut,
    eraseAll,
    sync,
    refreshPending,
  };
}

export type Sync = ReturnType<typeof createSync>;

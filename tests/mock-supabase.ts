// A small stand-in for the parts of Supabase that Money Log uses (sign-in by emailed code or by password, the PostgREST tables
// and the group functions). The group rules mirror supabase/schema.sql in outline; the real rules are tested in supabase/rls_tests.sql.
// It encodes how I understand those APIs behave. It is NOT the real service: passing these tests shows the app's own
// logic is sound, not that real Supabase accepts every request. Use it for tests and for browser checks only.
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

export const API_KEY = 'test-key';
const METHODS = ['UPI', 'Card', 'Cash', 'Other'];
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

export interface MockState {
  otp: string;
  accessTtlSec: number;
  users: Map<string, string>; // email -> user id
  codes: Map<string, string>;
  passwords: Map<string, string>; // email -> password (the real service keeps only a hash)
  confirmSignups: boolean; // Supabase's "Confirm email": a new account cannot sign in until its email is confirmed
  unconfirmed: Set<string>;
  signupsOpen: boolean;
  recoveries: { email: string; redirectTo: string | null; hash: string }[]; // the reset emails "sent", with the link's address fragment
  access: Map<string, { uid: string; exp: number; sid: string }>; // sid = the session (one per sign-in on a device)
  refresh: Map<string, { uid: string; email: string; sid: string }>;
  entries: Map<string, any>;
  plans: Map<string, any>;
  groups: Map<string, any>;
  members: Map<string, any>; // `${group}|${user}`
  invites: Map<string, any>; // by group
  settlements: Map<string, any>;
  receipts: Map<string, any>;
  objects: Map<string, { bytes: number; owner: string; type: string; data: Buffer }>; // Storage: path -> file
  history: any[];
  requests: string[];
  failNext: { status: number; body: unknown } | null;
}

export async function startMock(opts: { staticDir?: string; port?: number } = {}) {
  const state: MockState = {
    otp: '123456', accessTtlSec: 3600,
    users: new Map(), codes: new Map(), passwords: new Map(), confirmSignups: false, unconfirmed: new Set(), signupsOpen: true, recoveries: [],
    access: new Map(), refresh: new Map(),
    entries: new Map(), plans: new Map(), groups: new Map(), members: new Map(), invites: new Map(), settlements: new Map(),
    receipts: new Map(), objects: new Map(), history: [],
    requests: [], failNext: null,
  };
  let tick = 0;
  const stamp = () => new Date().toISOString().replace('Z', String(tick++ % 1000).padStart(3, '0') + '+00:00');
  const parseTs = (s: string) => Date.parse(String(s).replace(/(\.\d{3})\d+/, '$1'));

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    const text = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(text);
  };
  const rls = (table: string) => ({ code: '42501', details: null, hint: null, message: `new row violates row-level security policy for table "${table}"` });

  function newSession(uid: string, email: string, sid: string = randomUUID()) {
    const access_token = `at-${randomUUID()}`;
    const refresh_token = `rt-${randomUUID()}`;
    const expires_at = Math.floor(Date.now() / 1000) + state.accessTtlSec;
    state.access.set(access_token, { uid, exp: expires_at, sid });
    state.refresh.set(refresh_token, { uid, email, sid });
    return { access_token, token_type: 'bearer', expires_in: state.accessTtlSec, expires_at, refresh_token, user: { id: uid, email } };
  }

  function uidOf(req: IncomingMessage): string | null {
    const m = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''));
    const t = m ? state.access.get(m[1]!) : undefined;
    return t && t.exp > Date.now() / 1000 ? t.uid : null;
  }

  async function body(req: IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : undefined;
  }

  // ---------- the group rules (outline of supabase/schema.sql)
  const err = (status: number, code: string, message: string) => ({ status, body: { code, details: null, hint: null, message } });
  const refuse = (message: string) => err(400, '23514', message);
  const denied = (table: string) => err(403, '42501', `new row violates row-level security policy for table "${table}"`);
  const member = (gid: string, uid: string) => state.members.get(`${gid}|${uid}`);
  const active = (gid: string, uid: string) => { const m = member(gid, uid); return Boolean(m && !m.left_at); };
  const activeIn = (gid: string) => [...state.members.values()].filter((m) => m.group_id === gid && !m.left_at);
  const money = (n: number) => Math.round(n * 100);
  const balance = (gid: string, uid: string): number => {
    let b = 0;
    for (const e of state.entries.values()) {
      if (e.group_id !== gid || e.deleted_at) continue;
      if (e.paid_by === uid) b += money(e.amount);
      if (e.shares && uid in e.shares) b -= money(e.shares[uid]);
    }
    for (const x of state.settlements.values()) {
      if (x.group_id !== gid || x.deleted_at) continue;
      if (x.from_user === uid) b += money(x.amount);
      if (x.to_user === uid) b -= money(x.amount);
    }
    return b;
  };
  const code12 = () => randomUUID().replace(/-/g, '').slice(0, 12);
  const names = (e: any): string[] => (e && e.group_id ? [e.paid_by, ...Object.keys(e.shares ?? {})] : []);
  const entryProblem = (r: any, old: any, uid: string): { status: number; body: unknown } | null => {
    if (!r.group_id) return r.paid_by || r.shares ? refuse('A private payment cannot carry paid_by or shares') : null;
    if (!active(r.group_id, uid)) return denied('entries');
    if (!r.paid_by || !r.shares || typeof r.shares !== 'object' || Array.isArray(r.shares)) return refuse('A shared expense needs paid_by and shares');
    if (r.owner_id !== r.paid_by && !(r.owner_id in r.shares)) return refuse('You can only record an expense that you paid or share in');
    const total = Object.values<number>(r.shares).reduce((a, v) => a + money(v), 0);
    if (total !== money(r.amount)) return refuse(`The shares add up to ${total / 100} but the expense is ${r.amount}`);
    const changedPeople = !old || old.group_id !== r.group_id || old.paid_by !== r.paid_by || JSON.stringify(old.shares) !== JSON.stringify(r.shares);
    if (changedPeople) for (const u of names(r)) if (!active(r.group_id, u)) return refuse('The payer or a share names someone who is not a current member of this group');
    if (old && old.group_id && (changedPeople || old.amount !== r.amount || old.deleted_at !== r.deleted_at) && names(old).some((u) => !active(old.group_id, u))) {
      return refuse('This expense names someone who has left the group, so its amount, people and deletion are frozen');
    }
    return null;
  };
  const settlementProblem = (r: any, old: any, uid: string): { status: number; body: unknown } | null => {
    if (r.created_by !== uid || (old && old.created_by !== uid)) return denied('settlements');
    if (!active(r.group_id, uid) || (r.from_user !== uid && r.to_user !== uid)) return denied('settlements');
    if (r.from_user === r.to_user || !(r.amount > 0)) return refuse('A settlement is between two different people for more than zero');
    const changed = !old || old.from_user !== r.from_user || old.to_user !== r.to_user || old.amount !== r.amount;
    if (changed && (!active(r.group_id, r.from_user) || !active(r.group_id, r.to_user))) return refuse('Both people in a settlement must be current members of the group');
    if (old && (changed || old.deleted_at !== r.deleted_at) && [old.from_user, old.to_user].some((u) => !active(old.group_id, u))) return refuse('This settlement involves someone who has left the group, so it is frozen');
    return null;
  };

  function rpc(name: string, a: any, uid: string): { status: number; body: unknown } {
    const ok = (body: unknown = null) => ({ status: 200, body });
    const adminOf = (gid: string) => Boolean(member(gid, uid) && !member(gid, uid).left_at && member(gid, uid).role === 'admin');
    const lockedOut = err(403, '42501', 'Only a group admin can do this');
    if (name === 'create_group') {
      const nm = String(a.p_name ?? '').trim(); const dn = String(a.p_display_name ?? '').trim();
      if (nm.length < 1 || nm.length > 60 || !['family', 'trip'].includes(a.p_kind) || dn.length < 1 || dn.length > 40) return err(400, '22023', 'Check the group name, kind and your name');
      if ([...state.groups.values()].filter((g) => g.created_by === uid).length >= 10) return err(400, '53400', 'You can create at most 10 groups');
      const id = randomUUID();
      state.groups.set(id, { id, name: nm, kind: a.p_kind, created_by: uid, created_at: new Date().toISOString() });
      state.members.set(`${id}|${uid}`, { group_id: id, user_id: uid, display_name: dn, role: 'admin', joined_at: new Date().toISOString(), left_at: null });
      state.invites.set(id, { group_id: id, code: code12(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
      return ok(id);
    }
    if (name === 'join_group') {
      const norm = String(a.p_code ?? '').toLowerCase().replace(/[^0-9a-f]/g, '');
      const dn = String(a.p_display_name ?? '').trim();
      if (dn.length < 1 || dn.length > 40) return err(400, '22023', 'Enter the name others will see you as (1 to 40 characters)');
      const inv = [...state.invites.values()].find((i) => i.code === norm && Date.parse(i.expires_at) > Date.now());
      if (!inv) return err(400, '22023', 'That code is not valid or has expired');
      if (active(inv.group_id, uid)) return ok(inv.group_id);
      if (activeIn(inv.group_id).length >= 20) return err(400, '53400', 'This group is full (20 people)');
      state.members.set(`${inv.group_id}|${uid}`, { group_id: inv.group_id, user_id: uid, display_name: dn, role: 'member', joined_at: new Date().toISOString(), left_at: null });
      if (!activeIn(inv.group_id).some((m) => m.role === 'admin')) member(inv.group_id, uid).role = 'admin';
      return ok(inv.group_id);
    }
    if (name === 'reset_invite') {
      if (!adminOf(a.p_group)) return lockedOut;
      const inv = { group_id: a.p_group, code: code12(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() };
      state.invites.set(a.p_group, inv);
      return ok(inv.code);
    }
    if (name === 'leave_group') {
      const me = member(a.p_group, uid);
      if (!me || me.left_at) return err(403, '42501', 'You are not in this group');
      if (balance(a.p_group, uid) !== 0) return refuse('Settle up first: your balance in this group is not zero');
      const others = activeIn(a.p_group).filter((m) => m.user_id !== uid);
      if (me.role === 'admin' && others.length && !others.some((m) => m.role === 'admin')) return refuse('Make someone else an admin before you leave');
      me.left_at = new Date().toISOString();
      return ok();
    }
    if (name === 'remove_member') {
      if (!adminOf(a.p_group)) return lockedOut;
      if (a.p_user === uid) return err(400, '22023', 'Use Leave group to remove yourself');
      const m = member(a.p_group, a.p_user);
      if (!m || m.left_at) return err(400, '22023', 'That person is not in this group');
      if (balance(a.p_group, a.p_user) !== 0) return refuse('They must settle up first: their balance in this group is not zero');
      m.left_at = new Date().toISOString();
      state.invites.set(a.p_group, { group_id: a.p_group, code: code12(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
      return ok();
    }
    if (name === 'make_admin') {
      if (!adminOf(a.p_group)) return lockedOut;
      const m = member(a.p_group, a.p_user);
      if (!m || m.left_at) return err(400, '22023', 'That person is not in this group');
      m.role = 'admin';
      return ok();
    }
    if (name === 'set_display_name') {
      const m = member(a.p_group, uid);
      const dn = String(a.p_name ?? '').trim();
      if (!m || m.left_at) return err(403, '42501', 'You are not in this group');
      if (dn.length < 1 || dn.length > 40) return err(400, '22023', 'Enter a name of 1 to 40 characters');
      m.display_name = dn;
      return ok();
    }
    return err(404, '42883', `function ${name} does not exist`);
  }

  // keyset paging like PostgREST's order=synced_at.asc,id.asc&synced_at=gte.<since>
  const page = (rows: any[], url: URL) => {
    const since = /^gte\.(.+)$/.exec(url.searchParams.get('synced_at') ?? '')?.[1];
    rows = rows.filter((r) => !since || parseTs(r.synced_at) >= parseTs(since));
    rows.sort((a, b) => (a.synced_at < b.synced_at ? -1 : a.synced_at > b.synced_at ? 1 : a.id < b.id ? -1 : 1));
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 1000);
    return rows.slice(offset, offset + limit);
  };

  // ---------- receipt photos (outline of the receipts rules in supabase/schema.sql)
  const entryVisible = (eid: string, uid: string): boolean => {
    const e = state.entries.get(eid);
    return Boolean(e && (e.owner_id === uid || (e.group_id && active(e.group_id, uid))));
  };
  const receiptProblem = (r: any, old: any, uid: string): { status: number; body: unknown } | null => {
    if (r.owner_id !== uid || (old && old.owner_id !== uid)) return denied('receipts');
    if (r.path !== `${r.owner_id}/${r.id}.jpg`) return refuse('The photo path must be <owner>/<id>.jpg');
    if (!Number.isInteger(r.bytes) || r.bytes < 1 || r.bytes > 1048576) return refuse('A photo is 1 byte to 1 MB');
    if (old) {
      if (old.entry_id !== r.entry_id || old.path !== r.path || old.bytes !== r.bytes) return refuse('A receipt can only be marked uploaded, deleted or purged');
      if (r.purged_at && !old.purged_at && state.objects.has(r.path)) return refuse('The file is still in storage: remove it before marking the photo purged');
      return null;
    }
    const e = state.entries.get(r.entry_id);
    if (!e || e.owner_id !== uid || e.deleted_at || (e.group_id && !active(e.group_id, uid))) return denied('receipts');
    if ([...state.receipts.values()].filter((x) => x.entry_id === r.entry_id && !x.deleted_at && x.id !== r.id).length >= 3) return err(400, '53400', 'A payment can carry at most 3 receipt photos');
    return null;
  };
  const storageError = (status: number, message: string) => err(status, String(status), message);
  const rawBody = async (req: IncomingMessage): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  };
  const canReadObject = (path: string, uid: string): boolean => {
    if (path.split('/')[0] === uid) return true;
    const r = [...state.receipts.values()].find((x) => x.path === path);
    return Boolean(r && !r.deleted_at && (r.owner_id === uid || entryVisible(r.entry_id, uid)));
  };

  function serveStatic(url: URL, res: ServerResponse) {
    if (!opts.staticDir) return send(res, 404, { message: 'not found' });
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const root = normalize(opts.staticDir).replace(/[\\/]+$/, '');
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const path = url.pathname;
      const isApi = path.startsWith('/auth/v1/') || path.startsWith('/rest/v1/') || path.startsWith('/storage/v1/') || path === '/__state';
      if (!isApi) return serveStatic(url, res);
      if (path === '/__state') return send(res, 200, { entries: [...state.entries.values()], plans: [...state.plans.values()], groups: [...state.groups.values()], members: [...state.members.values()], invites: [...state.invites.values()], settlements: [...state.settlements.values()], receipts: [...state.receipts.values()], objects: [...state.objects.entries()].map(([path, o]) => ({ path, bytes: o.bytes, owner: o.owner })), history: state.history, recoveries: state.recoveries, requests: state.requests.length });
      state.requests.push(`${req.method} ${path}${url.search}`);
      if (req.headers.apikey !== API_KEY) return send(res, 401, { message: 'No API key found in request' });
      if (state.failNext) { const f = state.failNext; state.failNext = null; return send(res, f.status, f.body); }

      // ---------- auth
      if (path === '/auth/v1/otp' && req.method === 'POST') {
        const b = await body(req);
        state.codes.set(b.email, state.otp);
        return send(res, 200, {});
      }
      if (path === '/auth/v1/verify' && req.method === 'POST') {
        const b = await body(req);
        if (state.codes.get(b.email) !== b.token) return send(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
        if (!state.users.has(b.email)) state.users.set(b.email, randomUUID());
        return send(res, 200, newSession(state.users.get(b.email)!, b.email));
      }
      if (path === '/auth/v1/token' && req.method === 'POST' && url.searchParams.get('grant_type') === 'refresh_token') {
        const b = await body(req);
        const r = state.refresh.get(b.refresh_token);
        if (!r) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' });
        state.refresh.delete(b.refresh_token); // refresh tokens rotate: each works once
        return send(res, 200, newSession(r.uid, r.email, r.sid)); // a refresh continues the same session
      }
      if (path === '/auth/v1/signup' && req.method === 'POST') {
        const b = await body(req);
        if (!state.signupsOpen) return send(res, 422, { code: 422, error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' });
        if (typeof b.password === 'string' && b.password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
        if (state.confirmSignups) {
          // with email confirmation on, the real service answers the same way for a known and an unknown address
          if (!state.users.has(b.email)) { state.users.set(b.email, randomUUID()); state.passwords.set(b.email, b.password); state.unconfirmed.add(b.email); }
          return send(res, 200, { id: state.users.get(b.email), email: b.email });
        }
        if (state.users.has(b.email)) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        state.users.set(b.email, randomUUID());
        state.passwords.set(b.email, b.password);
        return send(res, 200, newSession(state.users.get(b.email)!, b.email));
      }
      if (path === '/auth/v1/token' && req.method === 'POST' && url.searchParams.get('grant_type') === 'password') {
        const b = await body(req);
        if (state.passwords.get(b.email) !== b.password || b.password === undefined) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (state.unconfirmed.has(b.email)) return send(res, 400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
        return send(res, 200, newSession(state.users.get(b.email)!, b.email));
      }
      if (path === '/auth/v1/recover' && req.method === 'POST') {
        // The same answer for a known and an unknown address. For a known one the link's session is made here (the real service
        // makes it when the link is opened) and recorded as the fragment the page would be opened with.
        const b = await body(req);
        if (state.users.has(b.email) && !state.unconfirmed.has(b.email)) {
          const s = newSession(state.users.get(b.email)!, b.email);
          state.recoveries.push({ email: b.email, redirectTo: url.searchParams.get('redirect_to'),
            hash: `#access_token=${s.access_token}&expires_in=${s.expires_in}&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery` });
        }
        return send(res, 200, {});
      }
      if (path === '/auth/v1/user' && req.method === 'GET') {
        const uid = uidOf(req);
        if (!uid) return send(res, 401, { code: 401, msg: 'invalid JWT' });
        return send(res, 200, { id: uid, email: [...state.users].find(([, id]) => id === uid)?.[0] });
      }
      if (path === '/auth/v1/user' && req.method === 'PUT') {
        const uid = uidOf(req);
        if (!uid) return send(res, 401, { code: 401, msg: 'invalid JWT' });
        const b = await body(req);
        const email = [...state.users].find(([, id]) => id === uid)?.[0];
        if (!email) return send(res, 404, { msg: 'User not found' });
        if (typeof b.password === 'string') {
          if (b.password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
          if (state.passwords.get(email) === b.password) return send(res, 422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' });
          state.passwords.set(email, b.password);
        }
        return send(res, 200, { id: uid, email });
      }
      if (path === '/auth/v1/logout' && req.method === 'POST') {
        // scope: local = this session, others = every other session of the user, global (the default) = all of them.
        const m = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''));
        const cur = m ? state.access.get(m[1]!) : undefined;
        if (!cur) return send(res, 401, { code: 401, msg: 'invalid JWT' });
        const scope = url.searchParams.get('scope') ?? 'global';
        const drop = (sid: string) => scope === 'local' ? sid === cur.sid : scope === 'others' ? sid !== cur.sid : true;
        for (const [k, v] of state.refresh) if (v.uid === cur.uid && drop(v.sid)) state.refresh.delete(k);
        // an access token already issued keeps working until it runs out, as with the real service; only the refresh tokens go
        return send(res, 204);
      }

      // ---------- rest
      const uid = uidOf(req);
      if (!uid) return send(res, 401, { code: 'PGRST301', details: null, hint: null, message: 'JWT expired' });

      if (path === '/rest/v1/entries') {
        if (req.method === 'GET') {
          return send(res, 200, page([...state.entries.values()].filter((r) => r.owner_id === uid || (r.group_id && active(r.group_id, uid))), url));
        }
        if (req.method === 'POST') {
          const rows: any[] = await body(req);
          for (const r of rows) {
            const existing = state.entries.get(r.id);
            if (r.owner_id !== uid || (existing && existing.owner_id !== uid)) return send(res, 403, rls('entries'));
            if (existing && existing.group_id && !active(existing.group_id, uid)) return send(res, 403, rls('entries'));
            const bad = !(r.amount > 0 && r.amount < 1e9) || !r.category || String(r.note ?? '').length > 500 || (r.method != null && !METHODS.includes(r.method));
            if (bad) return send(res, 400, { code: '23514', details: null, hint: null, message: 'new row for relation "entries" violates check constraint' });
            // Mirrors the keep_latest_edit trigger: a stale write is skipped before anything else is checked.
            if (existing && parseTs(r.updated_at) < parseTs(existing.updated_at)) continue;
            const problem = entryProblem({ group_id: null, paid_by: null, shares: null, ...r }, existing, uid);
            if (problem) return send(res, problem.status, problem.body);
          }
          for (const r of rows) {
            const existing = state.entries.get(r.id);
            if (existing && parseTs(r.updated_at) < parseTs(existing.updated_at)) continue;
            const next = { group_id: null, paid_by: null, shares: null, share_of: null, ...r, note: r.note ?? '', synced_at: stamp() };
            state.entries.set(r.id, next);
            // mirrors the entries_delete_receipts trigger: deleting a payment deletes its photos
            if (next.deleted_at && !(existing && existing.deleted_at)) {
              for (const rc of state.receipts.values()) if (rc.entry_id === next.id && !rc.deleted_at) { rc.deleted_at = stamp(); rc.updated_at = new Date(Math.max(Date.now(), parseTs(rc.updated_at) + 1)).toISOString(); rc.synced_at = stamp(); }
            }
            // mirrors the entries_history trigger for shared expenses (created / edited / deleted)
            if (next.group_id) {
              const changes: any = {};
              if (!existing || existing.group_id !== next.group_id) state.history.push({ id: randomUUID(), entry_id: next.id, group_id: next.group_id, changed_by: uid, changed_at: stamp(), kind: 'created', changes: { amount: next.amount, category: next.category, note: next.note, entry_date: next.entry_date, paid_by: next.paid_by, shares: next.shares } });
              else {
                for (const k of ['amount', 'category', 'note', 'entry_date', 'paid_by', 'shares']) if (JSON.stringify(existing[k]) !== JSON.stringify(next[k])) changes[k] = { from: existing[k], to: next[k] };
                const del = next.deleted_at && !existing.deleted_at;
                if (Object.keys(changes).length || del) state.history.push({ id: randomUUID(), entry_id: next.id, group_id: next.group_id, changed_by: uid, changed_at: stamp(), kind: del ? 'deleted' : 'edited', changes });
              }
            }
          }
          return send(res, 201);
        }
      }

      if (path === '/rest/v1/groups' && req.method === 'GET') return send(res, 200, [...state.groups.values()].filter((g) => active(g.id, uid)));
      if (path === '/rest/v1/group_members' && req.method === 'GET') return send(res, 200, [...state.members.values()].filter((m) => active(m.group_id, uid)));
      if (path === '/rest/v1/group_invites' && req.method === 'GET') {
        return send(res, 200, [...state.invites.values()].filter((i) => active(i.group_id, uid) && member(i.group_id, uid).role === 'admin'));
      }
      if (path.startsWith('/rest/v1/rpc/') && req.method === 'POST') {
        const out = rpc(path.slice('/rest/v1/rpc/'.length), (await body(req)) ?? {}, uid);
        return send(res, out.status, out.body === null ? undefined : out.body);
      }
      if (path === '/rest/v1/settlements') {
        if (req.method === 'GET') return send(res, 200, page([...state.settlements.values()].filter((r) => active(r.group_id, uid)), url));
        if (req.method === 'POST') {
          const rows: any[] = await body(req);
          for (const r of rows) {
            const existing = state.settlements.get(r.id);
            if (existing && parseTs(r.updated_at) < parseTs(existing.updated_at)) continue;
            const problem = settlementProblem(r, existing, uid);
            if (problem) return send(res, problem.status, problem.body);
          }
          for (const r of rows) {
            const existing = state.settlements.get(r.id);
            if (existing && parseTs(r.updated_at) < parseTs(existing.updated_at)) continue;
            state.settlements.set(r.id, { ...r, synced_at: stamp() });
          }
          return send(res, 201);
        }
      }

      if (path === '/rest/v1/receipts') {
        if (req.method === 'GET') return send(res, 200, page([...state.receipts.values()].filter((r) => r.owner_id === uid || entryVisible(r.entry_id, uid)), url));
        if (req.method === 'POST') {
          const rows: any[] = await body(req);
          for (const r of rows) {
            const existing = state.receipts.get(r.id);
            if (existing && parseTs(r.updated_at) < parseTs(existing.updated_at)) continue;
            const problem = receiptProblem(r, existing, uid);
            if (problem) return send(res, problem.status, problem.body);
          }
          for (const r of rows) {
            const existing = state.receipts.get(r.id);
            if (existing && parseTs(r.updated_at) < parseTs(existing.updated_at)) continue;
            state.receipts.set(r.id, { ...r, synced_at: stamp() });
          }
          return send(res, 201);
        }
      }
      if (path === '/rest/v1/entry_history' && req.method === 'GET') {
        const eid = /^eq\.(.+)$/.exec(url.searchParams.get('entry_id') ?? '')?.[1];
        const rows = state.history.filter((h) => (!eid || h.entry_id === eid) && active(h.group_id, uid)).sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
        return send(res, 200, rows);
      }

      // ---------- Storage (private bucket "receipts"), outline of its policies
      const obj = /^\/storage\/v1\/object\/(authenticated\/)?receipts\/(.+)$/.exec(path);
      if (obj) {
        const objPath = decodeURIComponent(obj[2]!);
        if (req.method === 'POST' && !obj[1]) {
          const data = await rawBody(req);
          const row = [...state.receipts.values()].find((x) => x.path === objPath);
          if (objPath.split('/')[0] !== uid || !row || row.owner_id !== uid || row.deleted_at || row.purged_at) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
          if (String(req.headers['content-type'] ?? '') !== 'image/jpeg') return send(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type is not supported' });
          if (data.length > 1048576) return send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
          if (state.objects.has(objPath)) return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
          state.objects.set(objPath, { bytes: data.length, owner: uid, type: 'image/jpeg', data });
          return send(res, 200, { Key: `receipts/${objPath}` });
        }
        if (req.method === 'GET' && obj[1]) {
          const o = state.objects.get(objPath);
          if (!o || !canReadObject(objPath, uid)) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
          res.writeHead(200, { 'Content-Type': o.type, 'Cache-Control': 'no-store' });
          return void res.end(o.data);
        }
        if (req.method === 'DELETE' && !obj[1]) {
          if (objPath.split('/')[0] !== uid || !state.objects.has(objPath)) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
          state.objects.delete(objPath);
          return send(res, 200, { message: 'Successfully deleted' });
        }
      }

      if (path === '/rest/v1/plan_blocks') {
        if (req.method === 'GET') {
          const eq = /^eq\.(.+)$/.exec(url.searchParams.get('block') ?? '')?.[1];
          const rows = [...state.plans.entries()].filter(([k, v]) => k.startsWith(`${uid}|`) && (!eq || v.block === eq)).map(([, v]) => v);
          return send(res, 200, rows);
        }
        if (req.method === 'POST') {
          const rows: any[] = await body(req);
          for (const r of rows) if (r.owner_id !== uid) return send(res, 403, rls('plan_blocks'));
          for (const r of rows) state.plans.set(`${uid}|${r.block}`, { block: r.block, imported_at: r.imported_at, payload: r.payload });
          return send(res, 201);
        }
      }
      return send(res, 404, { message: 'not found' });
    } catch (e) {
      send(res, 500, { message: String(e) });
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    state,
    expireAllAccess() { for (const v of state.access.values()) v.exp = 0; },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
export type Mock = Awaited<ReturnType<typeof startMock>>;

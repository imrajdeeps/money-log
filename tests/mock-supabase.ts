// A small stand-in for the parts of Supabase that Money Log uses (sign-in by emailed code, and two PostgREST tables).
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
  access: Map<string, { uid: string; exp: number }>;
  refresh: Map<string, { uid: string; email: string }>;
  entries: Map<string, any>;
  plans: Map<string, any>;
  requests: string[];
  failNext: { status: number; body: unknown } | null;
}

export async function startMock(opts: { staticDir?: string; port?: number } = {}) {
  const state: MockState = {
    otp: '123456', accessTtlSec: 3600,
    users: new Map(), codes: new Map(), access: new Map(), refresh: new Map(),
    entries: new Map(), plans: new Map(), requests: [], failNext: null,
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

  function newSession(uid: string, email: string) {
    const access_token = `at-${randomUUID()}`;
    const refresh_token = `rt-${randomUUID()}`;
    const expires_at = Math.floor(Date.now() / 1000) + state.accessTtlSec;
    state.access.set(access_token, { uid, exp: expires_at });
    state.refresh.set(refresh_token, { uid, email });
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
      const isApi = path.startsWith('/auth/v1/') || path.startsWith('/rest/v1/') || path === '/__state';
      if (!isApi) return serveStatic(url, res);
      if (path === '/__state') return send(res, 200, { entries: [...state.entries.values()], plans: [...state.plans.values()], requests: state.requests.length });
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
        return send(res, 200, newSession(r.uid, r.email));
      }
      if (path === '/auth/v1/logout' && req.method === 'POST') {
        const uid = uidOf(req);
        for (const [k, v] of state.refresh) if (v.uid === uid) state.refresh.delete(k);
        for (const [k, v] of state.access) if (v.uid === uid) state.access.delete(k);
        return send(res, 204);
      }

      // ---------- rest
      const uid = uidOf(req);
      if (!uid) return send(res, 401, { code: 'PGRST301', details: null, hint: null, message: 'JWT expired' });

      if (path === '/rest/v1/entries') {
        if (req.method === 'GET') {
          const since = /^gte\.(.+)$/.exec(url.searchParams.get('synced_at') ?? '')?.[1];
          let rows = [...state.entries.values()].filter((r) => r.owner_id === uid && (!since || parseTs(r.synced_at) >= parseTs(since)));
          rows.sort((a, b) => (a.synced_at < b.synced_at ? -1 : a.synced_at > b.synced_at ? 1 : a.id < b.id ? -1 : 1));
          const offset = Number(url.searchParams.get('offset') ?? 0);
          const limit = Number(url.searchParams.get('limit') ?? 1000);
          return send(res, 200, rows.slice(offset, offset + limit));
        }
        if (req.method === 'POST') {
          const rows: any[] = await body(req);
          for (const r of rows) {
            const existing = state.entries.get(r.id);
            if (r.owner_id !== uid || (existing && existing.owner_id !== uid)) return send(res, 403, rls('entries'));
            const bad = !(r.amount > 0 && r.amount < 1e9) || !r.category || String(r.note ?? '').length > 500 || (r.method != null && !METHODS.includes(r.method));
            if (bad) return send(res, 400, { code: '23514', details: null, hint: null, message: 'new row for relation "entries" violates check constraint' });
          }
          for (const r of rows) {
            const existing = state.entries.get(r.id);
            // Mirrors the keep_latest_edit trigger in supabase/schema.sql: a write older than the stored row is skipped.
            if (existing && parseTs(r.updated_at) < parseTs(existing.updated_at)) continue;
            state.entries.set(r.id, { ...r, note: r.note ?? '', synced_at: stamp() });
          }
          return send(res, 201);
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

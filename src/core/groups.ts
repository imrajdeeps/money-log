// Pure helpers for the shared ledger (Release 2): splitting an expense, working out who owes whom, settlements, and
// the join code. No DOM, no storage, no network, so the browser and the Node test runner share this file.
//
// Money is added up in whole paise (integers) so rounding can never make a group's balances drift.
import { fmtINR, isValidDate, laterThan, newId, parseTs, round2 } from './logic.ts';
import type { Entry, Shares } from './logic.ts';
import { isGroupKind } from './groupKinds.ts';
import type { GroupKind } from './groupKinds.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1e9;

export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const fromPaise = (paise: number): number => paise / 100;

// ---------------------------------------------------------------- the group data that comes from the server
// Flatmates: how a new shared expense is split unless the person changes it. Equal, or a percent for each person named
// (people who joined later are not named: they start at 0).
export type UsualSplit = { mode: 'equal' } | { mode: 'percent'; percent: Record<string, number> };
export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  created_at: string;
  starts_on: string | null; // a trip's first and last day (optional)
  ends_on: string | null;
  closed_at: string | null; // a closed trip takes no new expenses and no new people
  usual_split: UsualSplit | null; // flatmates only
}
export interface Member { group_id: string; user_id: string; display_name: string; role: 'admin' | 'member'; joined_at: string; left_at: string | null }
export interface Invite { group_id: string; code: string; expires_at: string }
export interface Settlement {
  id: string;
  group_id: string;
  from_user: string; // who paid
  to_user: string; // who was paid
  amount: number;
  settle_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty: 0 | 1;
}

const isId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const isTs = (v: unknown): boolean => Number.isFinite(parseTs(v));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanUsualSplit(v: any): UsualSplit | null {
  if (!v || typeof v !== 'object') return null;
  if (v.mode === 'equal') return { mode: 'equal' };
  if (v.mode !== 'percent' || !v.percent || typeof v.percent !== 'object' || Array.isArray(v.percent)) return null;
  const percent: Record<string, number> = {};
  let total = 0;
  for (const [id, n] of Object.entries(v.percent)) {
    if (!isId(id) || typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) return null;
    percent[id.toLowerCase()] = round2(n);
    total += n;
  }
  return Math.abs(total - 100) < 0.005 ? { mode: 'percent', percent } : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanGroup(g: any): Group | null {
  if (!g || !isId(g.id) || typeof g.name !== 'string' || g.name.length < 1 || g.name.length > 60) return null;
  if (!isGroupKind(g.kind)) return null;
  const day = (d: unknown): string | null => (typeof d === 'string' && isValidDate(d) ? d : null);
  const trip = g.kind === 'trip';
  return {
    id: g.id.toLowerCase(),
    name: g.name,
    kind: g.kind,
    created_at: isTs(g.created_at) ? g.created_at : new Date(0).toISOString(),
    starts_on: trip ? day(g.starts_on) : null,
    ends_on: trip ? day(g.ends_on) : null,
    closed_at: trip && isTs(g.closed_at) ? g.closed_at : null,
    usual_split: g.kind === 'flatmates' ? cleanUsualSplit(g.usual_split) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanMember(m: any): Member | null {
  if (!m || !isId(m.group_id) || !isId(m.user_id) || typeof m.display_name !== 'string' || m.display_name.length < 1 || m.display_name.length > 40) return null;
  if (m.role !== 'admin' && m.role !== 'member') return null;
  if (m.left_at != null && !isTs(m.left_at)) return null;
  return { group_id: m.group_id.toLowerCase(), user_id: m.user_id.toLowerCase(), display_name: m.display_name, role: m.role, joined_at: isTs(m.joined_at) ? m.joined_at : new Date(0).toISOString(), left_at: m.left_at ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanInvite(i: any): Invite | null {
  if (!i || !isId(i.group_id) || typeof i.code !== 'string' || !/^[0-9a-f]{12}$/.test(i.code) || !isTs(i.expires_at)) return null;
  return { group_id: i.group_id.toLowerCase(), code: i.code, expires_at: i.expires_at };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanSettlement(s: any): Settlement | null {
  if (!s || !isId(s.id) || !isId(s.group_id) || !isId(s.from_user) || !isId(s.to_user) || s.from_user.toLowerCase() === s.to_user.toLowerCase()) return null;
  const amount = typeof s.amount === 'string' ? Number(s.amount) : s.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount >= MAX_AMOUNT || round2(amount) !== amount) return null;
  if (!isValidDate(s.settle_date) || !isTs(s.created_at) || !isTs(s.updated_at)) return null;
  if (s.deleted_at != null && !isTs(s.deleted_at)) return null;
  if (s.created_by != null && !isId(s.created_by)) return null;
  return {
    id: s.id.toLowerCase(), group_id: s.group_id.toLowerCase(), from_user: s.from_user.toLowerCase(), to_user: s.to_user.toLowerCase(),
    amount, settle_date: s.settle_date, created_by: s.created_by ? s.created_by.toLowerCase() : null,
    created_at: s.created_at, updated_at: s.updated_at, deleted_at: s.deleted_at ?? null, dirty: s.dirty ? 1 : 0,
  };
}

// ---------------------------------------------------------------- splitting an expense
// Equal split: whole paise are shared out so the shares add up exactly; the leftover paise go to the people whose ids sort
// first, which every phone works out the same way.
export function equalShares(total: number, ids: string[]): Shares {
  const sorted = [...new Set(ids)].sort();
  const out: Shares = {};
  if (!sorted.length) return out;
  const t = toPaise(total);
  const base = Math.floor(t / sorted.length);
  const extra = t - base * sorted.length;
  sorted.forEach((id, i) => { out[id] = fromPaise(base + (i < extra ? 1 : 0)); });
  return out;
}

// Percentages must add up to 100. The leftover paise go to whoever lost the most to rounding (the largest-remainder rule).
export function percentShares(total: number, parts: { id: string; pct: number }[]): Shares | null {
  if (!parts.length || parts.some((p) => !Number.isFinite(p.pct) || p.pct < 0)) return null;
  if (Math.abs(parts.reduce((a, p) => a + p.pct, 0) - 100) > 0.001) return null;
  const t = toPaise(total);
  const rows = parts.map((p) => { const raw = (t * p.pct) / 100; return { id: p.id, paise: Math.floor(raw + 1e-9), rem: raw - Math.floor(raw + 1e-9) }; });
  let left = t - rows.reduce((a, r) => a + r.paise, 0);
  for (const r of [...rows].sort((a, b) => b.rem - a.rem || (a.id < b.id ? -1 : 1))) { if (left <= 0) break; r.paise++; left--; }
  const out: Shares = {};
  for (const r of rows) if (r.paise > 0) out[r.id] = fromPaise(r.paise);
  return out;
}

export function sharesPaise(shares: Shares): number {
  return Object.values(shares).reduce((a, v) => a + toPaise(v), 0);
}

export type SplitMode = 'equal' | 'exact' | 'percent';
export type SplitResult = { shares: Shares; problem: null } | { shares: null; problem: string };

const numberText = (s: string): number | null => (/^\d*\.?\d{0,2}$/.test(s.trim().replace(/[₹,\s]/g, '')) ? Number(s.trim().replace(/[₹,\s]/g, '') || '0') : null);

// What the split editor shows: shares from the chosen mode, or the one thing that is wrong with the input.
export function computeShares(mode: SplitMode, total: number, ids: string[], included: Set<string>, values: Record<string, string>): SplitResult {
  const bad = (problem: string): SplitResult => ({ shares: null, problem });
  if (!(total > 0)) return bad('Enter the amount first.');
  if (mode === 'equal') {
    const who = ids.filter((id) => included.has(id));
    return who.length ? { shares: equalShares(total, who), problem: null } : bad('Pick at least one person to split between.');
  }
  const nums: { id: string; n: number }[] = [];
  for (const id of ids) {
    const n = numberText(values[id] ?? '');
    if (n === null) return bad('Use numbers with at most 2 decimals.');
    nums.push({ id, n });
  }
  if (mode === 'percent') {
    const sum = round2(nums.reduce((a, x) => a + x.n, 0));
    if (Math.abs(sum - 100) > 0.001) return bad(`The percentages add up to ${sum}, not 100.`);
    const s = percentShares(total, nums.map((x) => ({ id: x.id, pct: x.n })));
    return s ? { shares: s, problem: null } : bad('Check the percentages.');
  }
  const sum = toPaise(nums.reduce((a, x) => a + x.n, 0));
  if (sum !== toPaise(total)) return bad(`The amounts add up to ${fmtINR(fromPaise(sum))}; the expense is ${fmtINR(total)}.`);
  const s: Shares = {};
  for (const x of nums) if (x.n > 0) s[x.id] = round2(x.n);
  return Object.keys(s).length ? { shares: s, problem: null } : bad('Someone has to owe something.');
}

// ---------------------------------------------------------------- who owes whom
// Positive = is owed money, negative = owes money, in paise. Counts live shared expenses of this group (what each person
// paid, minus their share) and live settlements (the payer's balance rises, the receiver's falls). Everyone's balances add up to 0.
export function groupBalances(gid: string, entries: Entry[], settlements: Settlement[]): Record<string, number> {
  const bal: Record<string, number> = {};
  const add = (id: string, p: number) => { bal[id] = (bal[id] ?? 0) + p; };
  for (const e of entries) {
    if (e.group_id !== gid || e.deleted_at || !e.paid_by || !e.shares) continue;
    add(e.paid_by, toPaise(e.amount));
    for (const [uid, v] of Object.entries(e.shares)) add(uid, -toPaise(v));
  }
  for (const s of settlements) {
    if (s.group_id !== gid || s.deleted_at) continue;
    add(s.from_user, toPaise(s.amount));
    add(s.to_user, -toPaise(s.amount));
  }
  return bal;
}

export interface Debt { from: string; to: string; amount: number }

// The fewest payments that settle everyone: repeatedly the biggest debtor pays the biggest creditor.
export function simplifyDebts(balances: Record<string, number>): Debt[] {
  const cred = Object.entries(balances).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  const debt = Object.entries(balances).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  const out: Debt[] = [];
  let i = 0;
  let j = 0;
  while (i < cred.length && j < debt.length) {
    const c = cred[i]!;
    const d = debt[j]!;
    const pay = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount: fromPaise(pay) });
    c.v -= pay;
    d.v -= pay;
    if (c.v === 0) i++;
    if (d.v === 0) j++;
  }
  return out;
}

export const memberName = (members: Member[], gid: string, uid: string | null): string =>
  members.find((m) => m.group_id === gid && m.user_id === uid)?.display_name ?? 'Former member';

export const activeMembers = (members: Member[], gid: string): Member[] =>
  members.filter((m) => m.group_id === gid && !m.left_at).sort((a, b) => a.display_name.localeCompare(b.display_name));

// A shared expense's live copies for one group, newest date first.
export const ledger = (entries: Entry[], gid: string): Entry[] =>
  entries.filter((e) => e.group_id === gid && !e.deleted_at)
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : parseTs(b.created_at) - parseTs(a.created_at)));

// ---------------------------------------------------------------- settlements
export interface NewSettlementInput { group_id: string; from_user: string; to_user: string; amount: number; settle_date: string }

export function makeSettlement(input: NewSettlementInput, me: string, nowIso: string): Settlement {
  return { id: newId(), ...input, created_by: me, created_at: nowIso, updated_at: nowIso, deleted_at: null, dirty: 1 };
}

export function softDeleteSettlement(s: Settlement, nowIso: string): Settlement {
  const t = laterThan(s.updated_at, nowIso);
  return { ...s, deleted_at: t, updated_at: t, dirty: 1 };
}

// Latest edit wins here too.
export function mergeRemoteSettlement(local: Settlement | undefined, remote: Settlement): Settlement {
  if (!local) return { ...remote, dirty: 0 };
  return parseTs(remote.updated_at) > parseTs(local.updated_at) ? { ...remote, dirty: 0 } : local;
}

// ---------------------------------------------------------------- the join code and link
export const normalizeCode = (s: string): string => s.toLowerCase().replace(/[^0-9a-f]/g, '');
export const formatCode = (code: string): string => code.toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
export const codeLooksValid = (s: string): boolean => normalizeCode(s).length === 12;

// The code rides in the part of the address after #, which browsers never send to any server.
export function inviteLink(pageUrl: string, code: string): string {
  const u = new URL(pageUrl);
  u.search = '';
  u.hash = `join=${code}`;
  return u.toString();
}

export function joinCodeFromHash(hash: string): string | null {
  const m = /^#?join=([0-9a-fA-F-]{12,20})$/.exec(hash);
  const code = m ? normalizeCode(m[1]!) : '';
  return code.length === 12 ? code : null;
}

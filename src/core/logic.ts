// Pure helpers for Money Log: no DOM, no storage, no network.
// Kept separate so the same file runs in the browser and in the Node test runner.

export const GROUPS = ['Spending', 'EMI', 'Family', 'Saving'] as const;
export const METHODS = ['UPI', 'Card', 'Cash', 'Other'] as const;
export type Group = (typeof GROUPS)[number];
export type Method = (typeof METHODS)[number];

// What each person owes for one shared expense: user id -> rupees. The shares add up to the expense's amount.
export type Shares = Record<string, number>;

export interface Entry {
  id: string;
  owner_id: string | null;
  entry_date: string; // YYYY-MM-DD, the day the payment happened
  category: string;
  amount: number; // rupees, at most 2 decimals, > 0
  note: string;
  method: Method | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  exported_at: string | null; // no longer set (payments used to be exported to the spreadsheet); kept so rows round-trip with the database
  group_id: string | null; // set = a shared expense of that group; null = private to its owner
  paid_by: string | null; // user id of whoever paid (shared expenses only)
  shares: Shares | null; // each person's share (shared expenses only)
  share_of: string | null; // private payments only: the shared expense this records the account's share of
  dirty: 0 | 1; // 1 = changed on this phone and not yet pushed to the cloud
}

// u = 1 marks a category with no budget at all (one made in the app and left without an amount): its zero is "nothing set",
// not a plan of zero, so spending on it is not "over". Rows from a spreadsheet never carry it.
export interface PlanRow { c: string; g: Group; p: number[]; u?: 1 }
export interface PlanData { v: 1; months: string[]; rows: PlanRow[] }
export interface Plan extends PlanData { importedAt: string; dirty: 0 | 1 }

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_AMOUNT = 1e9;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// A category name as typed, tidied, and the key two spellings share when they differ only in case or spacing
// (Excel's lookups ignore case too).
export const normName = (name: string): string => name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
export const catKey = (name: string): string => normName(name).toLowerCase();

// ---------------------------------------------------------------- ids, dates, timestamps
export function newId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function isoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y = 0, m = 0, d = 0] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 2000 && y <= 2100;
}

export const monthOf = (iso: string): string => iso.slice(0, 7);

export function shiftMonth(key: string, delta: number): string {
  const [y = 0, m = 1] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// Postgres returns microseconds ("...12.123456+00:00"); not every JS engine parses more than 3 digits.
export function parseTs(s: unknown): number {
  if (typeof s !== 'string') return Number.NaN;
  return Date.parse(s.replace(/(\.\d{3})\d+/, '$1'));
}

// ---------------------------------------------------------------- amounts and money text
/** A typed value as text: a string or a number as it is, anything else (nothing, an object) as empty. */
export const asText = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

export function parseAmount(text: unknown): number | null {
  const s = asText(text).replace(/[₹\s,]/g, '');
  if (s === '' || s === '.' || !/^\d*\.?\d{0,2}$/.test(s)) return null;
  const n = round2(Number.parseFloat(s));
  return n > 0 && n < MAX_AMOUNT ? n : null;
}

const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtINR(n: number): string {
  const v = round2(n);
  return Number.isInteger(v) ? inr0.format(v) : inr2.format(v);
}

// ---------------------------------------------------------------- entries
export interface NewEntryInput {
  amount: number;
  category: string;
  method: Method | null;
  note: string;
  date: string;
  group?: { group_id: string; paid_by: string; shares: Shares } | null; // null or absent = private
  shareOf?: string | null; // a private payment that records this account's share of that shared expense
}

export function makeEntry(input: NewEntryInput, nowIso: string): Entry {
  return {
    id: newId(),
    owner_id: null,
    entry_date: input.date,
    category: input.category,
    amount: input.amount,
    note: input.note,
    method: input.method,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    exported_at: null,
    group_id: input.group?.group_id ?? null,
    paid_by: input.group?.paid_by ?? null,
    shares: input.group ? { ...input.group.shares } : null,
    share_of: input.shareOf ?? null,
    dirty: 1,
  };
}

// An edit must sort after the version it was based on, even when this phone's clock is behind the phone that wrote
// that version; otherwise "latest edit wins" would throw the new edit away.
export function laterThan(prev: string, nowIso: string): string {
  return new Date(Math.max(parseTs(nowIso), parseTs(prev) + 1)).toISOString();
}

export function editEntry(old: Entry, changes: Partial<NewEntryInput>, nowIso: string): Entry {
  const { date, group, ...rest } = changes;
  return {
    ...old,
    ...rest,
    ...(date !== undefined ? { entry_date: date } : {}),
    ...(group !== undefined ? { group_id: group?.group_id ?? null, paid_by: group?.paid_by ?? null, shares: group ? { ...group.shares } : null } : {}),
    updated_at: laterThan(old.updated_at, nowIso),
    dirty: 1,
  };
}

export function softDelete(old: Entry, nowIso: string): Entry {
  const t = laterThan(old.updated_at, nowIso);
  return { ...old, deleted_at: t, updated_at: t, dirty: 1 };
}

// Undo: put a payment back as it was before an edit or a delete. Everything the person can change goes back; the payment is alive
// again; and it counts as a new change (later than the edit or the delete), so every device ends up with the restored one.
export function restoreEntry(current: Entry, before: Entry, nowIso: string): Entry {
  return {
    ...current,
    amount: before.amount,
    category: before.category,
    method: before.method,
    note: before.note,
    entry_date: before.entry_date,
    group_id: before.group_id,
    paid_by: before.paid_by,
    shares: before.shares ? { ...before.shares } : null,
    deleted_at: before.deleted_at,
    updated_at: laterThan(current.updated_at, nowIso),
    dirty: 1,
  };
}

// Strict check for anything that arrives from outside (backup file, server row). Returns a clean entry or null.
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// null: not there; undefined: there but not a good id
function optionalUuid(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return isUuid(v) ? v : undefined;
}

function cleanAmount(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < MAX_AMOUNT && round2(n) === n ? n : null;
}

// The id, day, category, note and method.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validText(e: any): boolean {
  if (!isUuid(e.id) || !isValidDate(e.entry_date)) return false;
  if (typeof e.category !== 'string' || e.category.length < 1 || e.category.length > 80) return false;
  const note = e.note ?? '';
  if (typeof note !== 'string' || note.length > 500) return false;
  return e.method == null || (METHODS as readonly string[]).includes(e.method);
}

// created_at and updated_at must be times; deleted_at and exported_at may be missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validStamps(e: any): boolean {
  if (!['created_at', 'updated_at'].every((k) => Number.isFinite(parseTs(e[k])))) return false;
  return ['deleted_at', 'exported_at'].every((k) => e[k] == null || Number.isFinite(parseTs(e[k])));
}

// The shares of a shared expense: at most 30 people, each a user id with a non-negative amount, adding up to the amount.
// null: no shares; undefined: not good.
function cleanShares(raw: unknown, amount: number): Shares | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 30) return undefined;
  const shares: Shares = {};
  let sum = 0;
  for (const [uid, v] of entries) {
    if (!UUID_RE.test(uid) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || round2(v) !== v) return undefined;
    shares[uid.toLowerCase()] = v;
    sum = round2(sum + v);
  }
  return sum === amount ? shares : undefined;
}

// A private payment carries no group, payer or shares; a shared one carries all three, and the shares add up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanGroupFields(e: any, amount: number): { groupId: string | null; paidBy: string | null; shares: Shares | null; shareOf: string | null } | null {
  const groupId = optionalUuid(e.group_id);
  const paidBy = optionalUuid(e.paid_by);
  const shareOf = optionalUuid(e.share_of);
  const shares = cleanShares(e.shares, amount);
  if (groupId === undefined || paidBy === undefined || shareOf === undefined || shares === undefined) return null;
  const consistent = groupId === null ? paidBy === null && shares === null : paidBy !== null && shares !== null;
  return consistent ? { groupId, paidBy, shares, shareOf } : null;
}

const lower = (v: string | null): string | null => (v === null ? null : v.toLowerCase());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanEntry(e: any): Entry | null {
  if (!e || typeof e !== 'object' || !validText(e) || !validStamps(e)) return null;
  const amount = cleanAmount(e.amount);
  if (amount === null) return null;
  const group = cleanGroupFields(e, amount);
  if (!group) return null;
  return {
    id: e.id.toLowerCase(),
    owner_id: isUuid(e.owner_id) ? e.owner_id.toLowerCase() : null,
    entry_date: e.entry_date,
    category: e.category,
    amount,
    note: e.note ?? '',
    method: e.method ?? null,
    created_at: e.created_at,
    updated_at: e.updated_at,
    deleted_at: e.deleted_at ?? null,
    exported_at: e.exported_at ?? null,
    group_id: lower(group.groupId),
    paid_by: lower(group.paidBy),
    shares: group.shares,
    share_of: lower(group.shareOf),
    dirty: e.dirty ? 1 : 0,
  };
}

// Latest edit wins, on every phone alike. A server copy replaces the local one only if it was edited later; a local
// entry that is newer (or equal) stays, and if it is still waiting to be pushed it goes out right after this pull.
export function mergeRemote(local: Entry | undefined, remote: Entry): Entry {
  if (!local) return { ...remote, dirty: 0 };
  return parseTs(remote.updated_at) > parseTs(local.updated_at) ? { ...remote, dirty: 0 } : local;
}

// Whether this phone's account made the entry. Entries that arrive from other people's groups are not ours: they never
// count toward our budget or export, and are never pushed.
export const isMine = (e: Pick<Entry, 'owner_id'>, me: string | null): boolean => e.owner_id === null || e.owner_id === me;

// What the entry costs this account: the full amount of a private payment, our share of a shared one.
export function myShare(e: Entry, me: string | null): number {
  if (!e.group_id) return e.amount;
  return (me && e.shares?.[me]) || 0;
}

// Our live entries as the budget sees them: shared expenses count at our share, and ones we owe nothing on are left out.
export function budgetEntries(entries: Entry[], me: string | null): Entry[] {
  const out: Entry[] = [];
  for (const e of entries) {
    if (e.deleted_at || !isMine(e, me)) continue;
    const a = myShare(e, me);
    if (a > 0) out.push(a === e.amount ? e : { ...e, amount: a });
  }
  return out;
}

export const byRecent = (a: Entry, b: Entry): number => parseTs(b.created_at) - parseTs(a.created_at);
export const byDate = (a: Entry, b: Entry): number =>
  a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : parseTs(a.created_at) - parseTs(b.created_at);

export function frequentCategories(entries: Entry[], nowMs: number, n = 6, days = 90): string[] {
  const since = nowMs - days * 86400000;
  const count = new Map<string, number>();
  for (const e of entries) {
    if (e.deleted_at || parseTs(e.created_at) < since) continue;
    count.set(e.category, (count.get(e.category) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([c]) => c);
}

// ---------------------------------------------------------------- the old imported plan (read only, to bring it across)
// Validate a plan that comes from the server or a backup (already parsed JSON).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanPlan(p: any): PlanData | null {
  if (!p || typeof p !== 'object' || p.v !== 1 || !Array.isArray(p.months) || !Array.isArray(p.rows)) return null;
  if (!p.months.length || p.months.length > 120 || !p.months.every((m: unknown) => typeof m === 'string' && MONTH_RE.test(m))) return null;
  if (p.rows.length < 1 || p.rows.length > 100) return null;
  const rows: PlanRow[] = [];
  for (const r of p.rows) {
    if (!r || typeof r.c !== 'string' || !r.c || r.c.length > 80 || !(GROUPS as readonly string[]).includes(r.g)) return null;
    if (!Array.isArray(r.p) || r.p.length !== p.months.length) return null;
    if (!r.p.every((v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < MAX_AMOUNT)) return null;
    rows.push({ c: r.c, g: r.g as Group, p: r.p as number[] });
  }
  return { v: 1, months: [...(p.months as string[])], rows };
}

// ---------------------------------------------------------------- month view
export interface MonthRow { category: string; group: Group; spent: number; planned: number; left: number; budgeted: boolean }
export interface MonthSummary {
  month: string;
  hasPlan: boolean;
  count: number;
  rows: MonthRow[];
  extra: { category: string; spent: number }[];
  groups: Record<Group, { spent: number; planned: number; budgeted: boolean }>;
  totalSpent: number;
}

export function summarizeMonth(entries: Entry[], plan: PlanData | null, month: string): MonthSummary {
  // Spending is matched to categories by catKey, so "groceries" and "Groceries" are one line.
  const spentBy = new Map<string, { name: string; spent: number }>();
  let count = 0;
  for (const e of entries) {
    if (e.deleted_at || monthOf(e.entry_date) !== month) continue;
    count++;
    const k = catKey(e.category);
    const cur = spentBy.get(k) ?? { name: normName(e.category), spent: 0 };
    cur.spent = round2(cur.spent + e.amount);
    spentBy.set(k, cur);
  }
  const mi = plan ? plan.months.indexOf(month) : -1;
  const rows: MonthRow[] = [];
  const known = new Set<string>();
  if (plan) {
    for (const r of plan.rows) {
      const k = catKey(r.c);
      known.add(k);
      const spent = spentBy.get(k)?.spent ?? 0;
      const planned = mi >= 0 ? (r.p[mi] ?? 0) : 0;
      rows.push({ category: r.c, group: r.g, spent, planned, left: round2(planned - spent), budgeted: !r.u });
    }
  }
  const extra = [...spentBy].filter(([k]) => !known.has(k)).map(([, v]) => ({ category: v.name, spent: v.spent }));
  const groups = Object.fromEntries(GROUPS.map((g) => [g, { spent: 0, planned: 0, budgeted: false }])) as Record<Group, { spent: number; planned: number; budgeted: boolean }>;
  for (const r of rows) {
    groups[r.group].spent = round2(groups[r.group].spent + r.spent);
    groups[r.group].planned = round2(groups[r.group].planned + r.planned);
    if (r.budgeted) groups[r.group].budgeted = true;
  }
  const totalSpent = round2([...spentBy.values()].reduce((a, b) => a + b.spent, 0));
  return { month, hasPlan: mi >= 0, count, rows, extra, groups, totalSpent };
}

export type BudgetState = 'over' | 'ok' | 'short' | 'idle';

// 'over' (spent more than planned), 'ok', 'short' (saved less than planned in a finished month), 'idle' (nothing to judge)
export function budgetState(group: Group, spent: number, planned: number, monthIsOver: boolean): BudgetState {
  if (group === 'Saving') {
    if (planned > 0 && spent >= planned) return 'ok';
    return monthIsOver && planned > 0 ? 'short' : 'idle';
  }
  if (planned === 0 && spent === 0) return 'idle';
  return spent > planned ? 'over' : 'ok';
}

// From this share of a budget used, the meter and the words turn amber ("nearly used"); past 100% they turn red.
export const NEAR_BUDGET = 0.8;
export function nearBudget(spent: number, planned: number): boolean {
  return planned > 0 && spent <= planned && spent >= planned * NEAR_BUDGET;
}

// How many days a month (YYYY-MM) has, leap years included.
export function daysInMonth(month: string): number {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

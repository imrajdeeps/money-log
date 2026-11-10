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
  exported_at: string | null;
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1e9;

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
export function parseAmount(text: unknown): number | null {
  const s = String(text ?? '').replace(/[₹\s,]/g, '');
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

// Marking as exported stamps exported_at and updated_at with the same instant, so any later edit or delete
// is detectably newer than the export (see changedAfterExport).
export function markExportedEntry(old: Entry, nowIso: string): Entry {
  const t = laterThan(old.updated_at, nowIso);
  return { ...old, exported_at: t, updated_at: t, dirty: 1 };
}

// Entries whose spreadsheet row is out of date: edited or deleted after they were exported.
export function changedAfterExport(all: Entry[]): { entry: Entry; kind: 'edited' | 'deleted' }[] {
  const out: { entry: Entry; kind: 'edited' | 'deleted' }[] = [];
  for (const e of all) {
    if (!e.exported_at || !(parseTs(e.updated_at) > parseTs(e.exported_at))) continue;
    out.push({ entry: e, kind: e.deleted_at ? 'deleted' : 'edited' });
  }
  return out;
}

// Strict check for anything that arrives from outside (backup file, server row). Returns a clean entry or null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanEntry(e: any): Entry | null {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.id !== 'string' || !UUID_RE.test(e.id)) return null;
  if (!isValidDate(e.entry_date)) return null;
  if (typeof e.category !== 'string' || e.category.length < 1 || e.category.length > 80) return null;
  const amount = typeof e.amount === 'string' ? Number(e.amount) : e.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount >= MAX_AMOUNT || round2(amount) !== amount) return null;
  const note = e.note == null ? '' : e.note;
  if (typeof note !== 'string' || note.length > 500) return null;
  if (e.method != null && !(METHODS as readonly string[]).includes(e.method)) return null;
  for (const k of ['created_at', 'updated_at']) if (!Number.isFinite(parseTs(e[k]))) return null;
  for (const k of ['deleted_at', 'exported_at']) if (e[k] != null && !Number.isFinite(parseTs(e[k]))) return null;
  // A private payment carries no group, payer or shares; a shared one carries all three, and the shares add up.
  const groupId = e.group_id ?? null;
  const paidBy = e.paid_by ?? null;
  if (groupId !== null && (typeof groupId !== 'string' || !UUID_RE.test(groupId))) return null;
  if (paidBy !== null && (typeof paidBy !== 'string' || !UUID_RE.test(paidBy))) return null;
  let shares: Shares | null = null;
  if (e.shares != null) {
    if (typeof e.shares !== 'object' || Array.isArray(e.shares)) return null;
    const entries = Object.entries(e.shares as Record<string, unknown>);
    if (entries.length > 30) return null;
    shares = {};
    let sum = 0;
    for (const [uid, v] of entries) {
      if (!UUID_RE.test(uid) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || round2(v) !== v) return null;
      shares[uid.toLowerCase()] = v;
      sum = round2(sum + v);
    }
    if (sum !== amount) return null;
  }
  if (groupId === null ? paidBy !== null || shares !== null : paidBy === null || shares === null) return null;
  const shareOf = e.share_of ?? null;
  if (shareOf !== null && (typeof shareOf !== 'string' || !UUID_RE.test(shareOf))) return null;
  return {
    id: e.id.toLowerCase(),
    owner_id: typeof e.owner_id === 'string' && UUID_RE.test(e.owner_id) ? e.owner_id.toLowerCase() : null,
    entry_date: e.entry_date,
    category: e.category,
    amount,
    note,
    method: e.method ?? null,
    created_at: e.created_at,
    updated_at: e.updated_at,
    deleted_at: e.deleted_at ?? null,
    exported_at: e.exported_at ?? null,
    group_id: groupId === null ? null : groupId.toLowerCase(),
    paid_by: paidBy === null ? null : paidBy.toLowerCase(),
    shares,
    share_of: shareOf === null ? null : shareOf.toLowerCase(),
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

// ---------------------------------------------------------------- plan import (the spreadsheet's "App export" block)
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface PlanSummary { categories: number; months: number; first: string; last: string; byGroup: Record<Group, number> }
export type PlanParse = { ok: true; plan: PlanData; summary: PlanSummary } | { ok: false; error: string };

export function parsePlanText(text: unknown): PlanParse {
  const fail = (error: string): PlanParse => ({ ok: false, error });
  const raw = String(text ?? '').replace(/^﻿/, '');
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.replace(/[\t, ]/g, '') !== '');
  const first = lines[0];
  if (first === undefined) return fail("Nothing to import. Copy the block A5 to AL34 from the spreadsheet's App export tab.");
  const delim = first.includes('\t') ? '\t' : ',';
  const cells = (l: string): string[] => (delim === '\t' ? l.split('\t') : splitCsvLine(l)).map((c) => c.trim());
  const head = cells(first);
  if ((head[0] ?? '').toLowerCase() !== 'category' || (head[1] ?? '').toLowerCase() !== 'group') {
    return fail('The first row must start with "Category" and "Group". Copy from the header row (row 5) of the App export tab.');
  }
  const months: string[] = [];
  for (let i = 2; i < head.length; i++) {
    const h = head[i] ?? '';
    if (h === '') {
      if (head.slice(i).some((x) => x !== '')) return fail(`Column ${i + 1} of the header is empty but later columns are not.`);
      break;
    }
    if (!MONTH_RE.test(h)) return fail(`Header column ${i + 1} is "${h}"; expected a month like 2026-11.`);
    const prev = months[months.length - 1];
    if (prev !== undefined && h <= prev) return fail(`Months must be in increasing order; "${h}" is not.`);
    months.push(h);
  }
  if (!months.length) return fail('No month columns found after Category and Group.');
  if (months.length > 120) return fail('Too many months (limit 120).');

  const rows: PlanRow[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const name = c[0] ?? '';
    if (name === '') continue; // an unused slot in the sheet
    if (name.length > 80) return fail(`Category "${name.slice(0, 20)}…" is longer than 80 characters.`);
    const key = name.toLowerCase();
    if (seen.has(key)) return fail(`Category "${name}" appears twice.`);
    seen.add(key);
    const group = GROUPS.find((g) => g.toLowerCase() === (c[1] ?? '').toLowerCase());
    if (!group) return fail(`"${name}": group "${c[1] ?? ''}" must be one of ${GROUPS.join(', ')}.`);
    const p: number[] = [];
    for (let i = 0; i < months.length; i++) {
      const cell = (c[2 + i] ?? '').replace(/[₹,\s]/g, '');
      if (cell === '' || /^[-–—]$/.test(cell)) { p.push(0); continue; } // blank, or a dash as an accounting format shows zero
      if (!/^\d+(\.\d+)?$/.test(cell)) return fail(`"${name}", ${months[i]}: "${c[2 + i]}" is not a number.`);
      const v = round2(parseFloat(cell));
      if (v >= MAX_AMOUNT) return fail(`"${name}", ${months[i]}: amount is too large.`);
      p.push(v);
    }
    rows.push({ c: name, g: group, p });
  }
  if (!rows.length) return fail('No category rows found under the header.');
  if (rows.length > 100) return fail('Too many categories (limit 100).');

  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, rows.filter((r) => r.g === g).length])) as Record<Group, number>;
  return {
    ok: true,
    plan: { v: 1, months, rows },
    summary: { categories: rows.length, months: months.length, first: months[0] ?? '', last: months[months.length - 1] ?? '', byGroup },
  };
}

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

// ---------------------------------------------------------------- export to the spreadsheet's Log tab
// Excel runs a pasted cell as a formula if it starts with = + - @, and treats a leading double quote as a text
// qualifier (stripping it and then evaluating what follows). It also turns things like 1/2 or 00123 into a date or
// a number. A leading space keeps all of these as plain text.
export function safeCell(s: unknown): string {
  const t = String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return /^[=+\-@"]/.test(t) || /^\d[\d\s./:,%-]*$/.test(t) ? ` ${t}` : t;
}

// Where the payment method goes in the spreadsheet's Log tab: 'note' = at the start of the note ("[UPI] lunch", the
// original Log with four input columns), 'column' = a Method column of its own (five input columns).
export type LogLayout = 'note' | 'column';

// totalOfShared: for a shared expense, the full amount, so the note keeps it ("lunch, my share of 2,400").
export function exportNote(e: Pick<Entry, 'note' | 'method'>, totalOfShared?: number, layout: LogLayout = 'note'): string {
  const text = String(e.note || '').replace(/[\t\r\n]+/g, ' ').trim();
  const note = totalOfShared === undefined ? text : [text, `my share of ${fmtINR(totalOfShared).replace(/[₹\s\u00a0]/g, '')}`].filter(Boolean).join(', ');
  if (layout === 'column') return safeCell(note);
  const m = e.method ? `[${e.method}]` : '';
  return safeCell(m && note ? `${m} ${note}` : m || note);
}

export function amountText(n: number): string {
  return round2(n).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export interface ExportRow { id: string; date: string; category: string; amount: string; method: string; note: string }

// Our own payments only; a shared expense is written at our share, with the full amount kept in the note, and one we
// owe nothing on has nothing to put in the Log.
export function exportRows(entries: Entry[], me: string | null = null, layout: LogLayout = 'note'): ExportRow[] {
  return entries
    .filter((e) => !e.deleted_at && isMine(e, me) && myShare(e, me) > 0)
    .sort(byDate)
    .map((e) => {
      const share = myShare(e, me);
      return {
        id: e.id,
        date: e.entry_date,
        category: safeCell(e.category),
        amount: amountText(share),
        method: layout === 'column' ? e.method ?? '' : '',
        note: exportNote(e, e.group_id && share !== e.amount ? e.amount : undefined, layout),
      };
    });
}

// The Log tab's input columns: Date, Category, Amount, Note, or with a Method column Date, Category, Amount, Method, Note.
// (The columns after them are formulas and are never overwritten.)
const cells = (r: ExportRow, layout: LogLayout): string[] => (layout === 'column' ? [r.date, r.category, r.amount, r.method, r.note] : [r.date, r.category, r.amount, r.note]);
export const toTSV = (rows: ExportRow[], layout: LogLayout = 'note'): string => rows.map((r) => cells(r, layout).join('\t')).join('\n');

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(rows: ExportRow[], layout: LogLayout = 'note'): string {
  const head = layout === 'column' ? ['Date', 'Category', 'Amount', 'Method', 'Note'] : ['Date', 'Category', 'Amount', 'Note'];
  const lines = [head, ...rows.map((r) => cells(r, layout))];
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

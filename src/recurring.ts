// Payments that repeat every month (rent, an SIP, a subscription): set once, then logged with one tap. Pure, like
// categories.ts, and synced the same way: one block, merged per item, the latest change to each item wins.
import { daysInMonth } from './dashboard.ts';
import { MAX_AMOUNT, METHODS, UUID_RE, monthOf, newId, normName, parseTs, round2 } from './logic.ts';
import type { Method } from './logic.ts';

export const MAX_RECURRING = 100; // what one account may keep, removed ones included
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// id and key are the same uuid; c category, a amount, d day of the month (1 to 31; a short month uses its last day),
// m method, n note, x removed, t when this item last changed, l the last month it was logged or skipped ('' = never).
export interface RecurItem { id: string; c: string; a: number; d: number; m: Method | null; n: string; x: 0 | 1; t: string; l: string }
export type Recurring = Record<string, RecurItem>;

export interface RecurInput { category: string; amount: number; day: number; method: Method | null; note: string }

export function checkRecurInput(i: RecurInput): string | null {
  const c = normName(i.category);
  if (c === '' || c.length > 80) return 'Choose a category.';
  if (typeof i.amount !== 'number' || !Number.isFinite(i.amount) || i.amount <= 0 || i.amount >= MAX_AMOUNT || round2(i.amount) !== i.amount) return 'Enter an amount above zero, with at most two decimals.';
  if (!Number.isInteger(i.day) || i.day < 1 || i.day > 31) return 'The day must be between 1 and 31.';
  if (i.method !== null && !(METHODS as readonly string[]).includes(i.method)) return 'Choose a method from the list.';
  if (i.note.length > 200) return 'Keep the note under 200 characters.';
  return null;
}

export type RecurResult = { ok: true; items: Recurring } | { ok: false; error: string };

export function addRecurring(items: Recurring, i: RecurInput, nowIso: string, id: string = newId()): RecurResult {
  const error = checkRecurInput(i);
  if (error) return { ok: false, error };
  if (Object.keys(items).length >= MAX_RECURRING) return { ok: false, error: 'That is the most recurring payments one account can keep.' };
  return { ok: true, items: { ...items, [id]: { id, c: normName(i.category), a: i.amount, d: i.day, m: i.method, n: i.note.trim(), x: 0, t: nowIso, l: '' } } };
}

export function editRecurring(items: Recurring, id: string, i: RecurInput, nowIso: string): RecurResult {
  const cur = items[id];
  if (!cur || cur.x) return { ok: false, error: 'That recurring payment is gone.' };
  const error = checkRecurInput(i);
  if (error) return { ok: false, error };
  return { ok: true, items: { ...items, [id]: { ...cur, c: normName(i.category), a: i.amount, d: i.day, m: i.method, n: i.note.trim(), t: nowIso } } };
}

// Removed items stay (marked) so the removal reaches the other phones; they are never offered again.
export function removeRecurring(items: Recurring, id: string, nowIso: string): Recurring {
  const cur = items[id];
  return !cur || cur.x ? items : { ...items, [id]: { ...cur, x: 1, t: nowIso } };
}

// Logged or skipped for this month: it is not offered again until next month.
export function markHandled(items: Recurring, id: string, month: string, nowIso: string): Recurring {
  const cur = items[id];
  return !cur || cur.x || cur.l >= month ? items : { ...items, [id]: { ...cur, l: month, t: nowIso } };
}

// The day this month's payment falls on, as YYYY-MM-DD.
export function scheduledDate(item: RecurItem, month: string): string {
  return `${month}-${String(Math.min(item.d, daysInMonth(month))).padStart(2, '0')}`;
}

export interface RecurDue { item: RecurItem; date: string; state: 'due' | 'upcoming' }

// What this month still has to log: 'due' once its day has come, 'upcoming' before. Only this month: a month the app was
// not opened in is not offered afterwards (log it by hand, or ignore it).
export function recurringThisMonth(items: Recurring, today: string): RecurDue[] {
  const month = monthOf(today);
  return Object.values(items)
    .filter((it) => !it.x && it.l < month)
    .map((item) => { const date = scheduledDate(item, month); return { item, date, state: date <= today ? 'due' as const : 'upcoming' as const }; })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.item.c.localeCompare(b.item.c)));
}

export const activeRecurring = (items: Recurring): RecurItem[] =>
  Object.values(items).filter((it) => !it.x).sort((a, b) => a.d - b.d || a.c.localeCompare(b.c));

// ---------------------------------------------------------------- sync and backup
// The later change to an item wins (this phone on a tie), but the "last logged month" is the later of the two, so a
// payment logged on one phone is never offered again on another because of an older edit.
export function mergeRecurring(local: Recurring, remote: Recurring): Recurring {
  const out: Recurring = { ...remote };
  for (const [id, v] of Object.entries(local)) {
    const r = out[id];
    if (!r) { out[id] = v; continue; }
    const winner = parseTs(v.t) >= parseTs(r.t) ? v : r;
    out[id] = { ...winner, l: v.l > r.l ? v.l : r.l };
  }
  return out;
}

export function sameRecurring(a: Recurring, b: Recurring): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => {
    const x = a[k]!;
    const y = Object.hasOwn(b, k) ? b[k]! : undefined;
    return y !== undefined && x.c === y.c && x.a === y.a && x.d === y.d && x.m === y.m && x.n === y.n && x.x === y.x && x.t === y.t && x.l === y.l;
  });
}

// Validate what comes from the server or a backup. Anything malformed is dropped, never repaired.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanRecurring(p: any): Recurring {
  const out: Recurring = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p as Record<string, any>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!UUID_RE.test(k) || !v || v.id !== k || typeof v.c !== 'string' || normName(v.c) !== v.c) continue;
    if (v.m !== null && !(METHODS as readonly string[]).includes(v.m)) continue;
    if (typeof v.n !== 'string' || v.n.length > 200 || (v.x !== 0 && v.x !== 1) || !Number.isFinite(parseTs(v.t))) continue;
    if (typeof v.l !== 'string' || (v.l !== '' && !MONTH_RE.test(v.l))) continue;
    if (checkRecurInput({ category: v.c, amount: v.a, day: v.d, method: v.m, note: v.n }) !== null) continue;
    out[k] = { id: k, c: v.c, a: v.a, d: v.d, m: v.m, n: v.n, x: v.x, t: v.t, l: v.l };
    if (Object.keys(out).length >= MAX_RECURRING) break;
  }
  return out;
}

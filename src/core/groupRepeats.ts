// Repeats in a group (version 2.2): a group expense that comes back every month (the flat's rent), with its payer and its split.
// The server keeps them (table group_repeats) and does every change, so a month counts once whoever taps first; this file reads
// what the server sent and works out what the group page shows on a given day. Pure: no DOM, no storage.
import type { Entry, Shares } from './logic.ts';
import { MONTH_RE, UUID_RE, cleanShares, daysInMonth, monthOf, parseTs, round2 } from './logic.ts';
import { fromPaise, toPaise } from './groups.ts';

export type RepeatChange = 'add' | 'edit' | 'skip' | 'stop';

export interface GroupRepeat {
  id: string;
  group_id: string;
  category: string;
  note: string;
  amount: number;
  day: number; // 1 to 31; a short month uses its last day
  paid_by: string;
  shares: Shares;
  done_through: string | null; // the last month logged or skipped, YYYY-MM
  created_by: string | null;
  created_at: string;
  change: RepeatChange; // what last happened to it (a logged month is told by its expense)
  change_month: string | null; // the month a skip was for
  changed_by: string | null;
  changed_at: string;
  stopped_at: string | null;
}

/** What Add a shared expense sends to set one up: the repeat and the expense being added (its first month). */
export interface NewGroupRepeat { id: string; groupId: string; category: string; note: string; amount: number; day: number; paidBy: string; shares: Shares; entryId: string; date: string }

const CHANGES: readonly RepeatChange[] = ['add', 'edit', 'skip', 'stop'];

/** The month after a YYYY-MM month. */
export function nextMonth(month: string): string {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** The month before a YYYY-MM month. */
export function prevMonth(month: string): string {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** The day a repeat falls on in a month, YYYY-MM-DD: its day, or the month's last day when the month is shorter. */
export function repeatDate(day: number, month: string): string {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
}

/** Whether a person pays or shares in a repeat: only they log, skip, change or stop it. */
export const inRepeat = (r: Pick<GroupRepeat, 'paid_by' | 'shares'>, uid: string | null): boolean =>
  uid !== null && (r.paid_by === uid || Object.hasOwn(r.shares, uid));

/** A group's repeats that are still going, by their day. */
export function activeRepeats(list: readonly GroupRepeat[], groupId: string): GroupRepeat[] {
  return list.filter((r) => r.group_id === groupId && !r.stopped_at).sort((a, b) => a.day - b.day || a.category.localeCompare(b.category));
}

export type RepeatState =
  | { kind: 'due'; month: string; date: string; today: boolean } // its day has come this month and the month is not done
  | { kind: 'upcoming'; month: string; date: string } // later this month
  | { kind: 'logged'; month: string; entry: Entry; next: string } // this month's expense is here
  | { kind: 'skipped'; month: string; by: string | null; next: string }
  | { kind: 'done'; month: string; next: string }; // done (logged elsewhere and not here yet, or skipped and changed since)

/** What a repeat looks like today. Only this month is offered: a month the app was not opened in is not offered later. */
export function repeatState(r: GroupRepeat, today: string, entries: readonly Entry[]): RepeatState {
  const month = monthOf(today);
  if (r.done_through === null || r.done_through < month) {
    const date = repeatDate(r.day, month);
    return date <= today ? { kind: 'due', month, date, today: date === today } : { kind: 'upcoming', month, date };
  }
  const next = repeatDate(r.day, nextMonth(r.done_through));
  const entry = entries.find((e) => e.repeat_id === r.id && e.repeat_month === month && !e.deleted_at);
  if (entry) return { kind: 'logged', month, entry, next };
  if (r.change === 'skip' && r.change_month === month) return { kind: 'skipped', month, by: r.changed_by, next };
  return { kind: 'done', month, next };
}

/** The month Skip applies to: this month while it is open, next month once this one is done, nothing once next month is done too. */
export function skipMonth(r: Pick<GroupRepeat, 'done_through'>, today: string): string | null {
  const month = monthOf(today);
  if (r.done_through === null || r.done_through < month) return month;
  return r.done_through === month ? nextMonth(month) : null;
}

/** The first month a change applies to: the first one that is not done. */
export function changeFrom(r: Pick<GroupRepeat, 'done_through'>, today: string): string {
  const month = monthOf(today);
  return r.done_through === null || r.done_through < month ? month : nextMonth(r.done_through);
}

/** The shares for a new amount, in proportion to the old ones, in paise that add up exactly (the biggest remainders get the spare paise). */
export function scaleShares(shares: Shares, to: number): Shares {
  const ids = Object.keys(shares);
  const from = ids.reduce((n, id) => n + toPaise(shares[id]!), 0);
  const target = toPaise(to);
  if (ids.length === 0) return {};
  if (from === 0) return Object.fromEntries(ids.map((id, i) => [id, fromPaise(i === 0 ? target : 0)]));
  const raw = ids.map((id) => ({ id, exact: (toPaise(shares[id]!) * target) / from }));
  const out = raw.map((x) => ({ id: x.id, p: Math.floor(x.exact), rest: x.exact - Math.floor(x.exact) }));
  let spare = target - out.reduce((n, x) => n + x.p, 0);
  for (const x of [...out].sort((a, b) => b.rest - a.rest || a.id.localeCompare(b.id))) {
    if (spare <= 0) break;
    x.p += 1;
    spare -= 1;
  }
  return Object.fromEntries(out.map((x) => [x.id, fromPaise(x.p)]));
}

/** What the shares add up to, in rupees. */
export const sharesTotal = (shares: Shares): number => round2(Object.values(shares).reduce((n, v) => n + v, 0));

// ---------------------------------------------------------------- what the server sends
/* eslint-disable @typescript-eslint/no-explicit-any */
const uuidOrNull = (v: any): string | null | undefined => {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : undefined;
};
const monthOrNull = (v: any): string | null | undefined => {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && MONTH_RE.test(v) ? v : undefined;
};
const stampOrNull = (v: any): string | null | undefined => {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && Number.isFinite(parseTs(v)) ? v : undefined;
};

function validBasics(r: any): boolean {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !UUID_RE.test(r.id) || typeof r.group_id !== 'string' || !UUID_RE.test(r.group_id)) return false;
  if (typeof r.category !== 'string' || r.category.trim() === '' || r.category.length > 80) return false;
  if (typeof r.note !== 'string' || r.note.length > 200) return false;
  if (typeof r.paid_by !== 'string' || !UUID_RE.test(r.paid_by) || !Number.isInteger(r.day) || r.day < 1 || r.day > 31) return false;
  return CHANGES.includes(r.change) && Number.isFinite(parseTs(r.created_at)) && Number.isFinite(parseTs(r.changed_at));
}

/** A row from the server, or null when anything in it is malformed (dropped, never repaired). */
export function cleanGroupRepeat(r: any): GroupRepeat | null {
  if (!validBasics(r)) return null;
  const amount = typeof r.amount === 'string' ? Number(r.amount) : r.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount >= 1e9 || round2(amount) !== amount) return null;
  const shares = cleanShares(r.shares, amount);
  const done = monthOrNull(r.done_through);
  const changeMonth = monthOrNull(r.change_month);
  const createdBy = uuidOrNull(r.created_by);
  const changedBy = uuidOrNull(r.changed_by);
  const stopped = stampOrNull(r.stopped_at);
  if (!shares || done === undefined || changeMonth === undefined || createdBy === undefined || changedBy === undefined || stopped === undefined) return null;
  return {
    id: r.id.toLowerCase(), group_id: r.group_id.toLowerCase(), category: r.category, note: r.note, amount, day: r.day,
    paid_by: r.paid_by.toLowerCase(), shares, done_through: done, created_by: createdBy, created_at: r.created_at,
    change: r.change, change_month: changeMonth, changed_by: changedBy, changed_at: r.changed_at, stopped_at: stopped,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

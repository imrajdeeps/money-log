// What a shared group has spent, added up for a summary: the total, what each person paid and owes, by category and by day.
// Used for a trip's summary (the whole trip) and for a family's "This month" (one month). Pure; money in whole paise inside.
import { fromPaise, toPaise } from './groups.ts';
import { shortDate } from './format.ts';
import { catKey, normName } from './logic.ts';
import type { Entry } from './logic.ts';
import { tr } from './i18n.ts';

export interface GroupSummary {
  count: number; // payments counted
  total: number; // rupees spent by the group
  perPerson: { user: string; paid: number; share: number }[]; // paid = what they put in; share = what is theirs; biggest payer first
  byCategory: { category: string; total: number; share: number }[]; // share = fraction of the total; biggest first
  byDay: { date: string; total: number }[]; // oldest day first
}

// "food" and "Food" are one line; it is shown with a capital letter.
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function groupSummary(entries: Entry[], groupId: string, opts: { month?: string } = {}): GroupSummary {
  const live = entries.filter((e) => e.group_id === groupId && !e.deleted_at && (!opts.month || e.entry_date.startsWith(`${opts.month}-`)));
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const cats = new Map<string, { name: string; paise: number }>();
  const days = new Map<string, number>();
  let total = 0;
  for (const e of live) {
    const p = toPaise(e.amount);
    total += p;
    if (e.paid_by) paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + p);
    for (const [u, v] of Object.entries(e.shares ?? {})) share.set(u, (share.get(u) ?? 0) + toPaise(v));
    const k = catKey(e.category);
    const c = cats.get(k) ?? { name: capital(normName(e.category)), paise: 0 };
    c.paise += p;
    cats.set(k, c);
    days.set(e.entry_date, (days.get(e.entry_date) ?? 0) + p);
  }
  const users = [...new Set([...paid.keys(), ...share.keys()])];
  return {
    count: live.length,
    total: fromPaise(total),
    perPerson: users
      .map((user) => ({ user, paid: fromPaise(paid.get(user) ?? 0), share: fromPaise(share.get(user) ?? 0) }))
      .sort((a, b) => b.paid - a.paid || b.share - a.share || (a.user < b.user ? -1 : 1)),
    byCategory: [...cats.values()]
      .map((c) => ({ category: c.name, total: fromPaise(c.paise), share: total > 0 ? c.paise / total : 0 }))
      .sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : 1)),
    byDay: [...days.entries()].map(([date, p]) => ({ date, total: fromPaise(p) })).sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

// The trip's days, first and last included; null when either date is missing.
export function tripLength(starts: string | null, ends: string | null): number | null {
  if (!starts || !ends) return null;
  const [y1 = 1970, m1 = 1, d1 = 1] = starts.split('-').map(Number);
  const [y2 = 1970, m2 = 1, d2 = 1] = ends.split('-').map(Number);
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
  return days >= 1 ? days : null;
}

// "1 Dec to 5 Dec", "From 1 Dec", "Until 5 Dec", or null when the trip has no dates.
export function tripDatesLabel(starts: string | null, ends: string | null): string | null {
  if (starts && ends) return starts === ends ? shortDate(starts) : `${shortDate(starts)} to ${shortDate(ends)}`;
  if (starts) return tr('From {0}', shortDate(starts));
  if (ends) return tr('Until {0}', shortDate(ends));
  return null;
}

// Whole percentages for a list of shares (fractions adding up to 1) that add up to exactly 100: each is rounded down and
// the missing points go to the biggest remainders. (Plain rounding would show 63% and 38%.)
export function wholePercents(fractions: number[]): number[] {
  const sum = fractions.reduce((a, f) => a + f, 0);
  if (!(sum > 0)) return fractions.map(() => 0);
  const exact = fractions.map((f) => (f / sum) * 100);
  const base = exact.map(Math.floor);
  let left = 100 - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) { if (left <= 0) break; base[i]!++; left--; }
  return base;
}

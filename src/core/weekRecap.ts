// The Monday recap (version 1.32): last week's spending in a few lines, against a usual week. Weeks run Monday to Sunday. Pure.
import type { GroupOf } from './analytics.ts';
import { catKey, round2 } from './logic.ts';
import type { Entry } from './logic.ts';

const DAY = 86400000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const ms = (day: string): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** The Monday of the week a day is in. */
export function weekStart(day: string): string {
  const dow = (new Date(ms(day)).getUTCDay() + 6) % 7; // Monday = 0
  return iso(ms(day) - dow * DAY);
}

/** The recap is offered on Monday and Tuesday. */
export const isRecapDay = (day: string): boolean => ((new Date(ms(day)).getUTCDay() + 6) % 7) <= 1;

export interface WeekRecap {
  weekOf: string; // the Monday of the week recapped (also what "seen" is kept against)
  from: string;
  to: string;
  total: number;
  count: number;
  top: { category: string; amount: number }[]; // up to three, biggest first
  usual: number; // the average of the four weeks before it that had any spending; 0 when none did
  change: number | null; // how far this week was above (+) or below (-) a usual one, as a fraction; null without a usual week
}

const weekTotal = (entries: readonly Entry[], groupOf: GroupOf, from: string): { total: number; count: number } => {
  const to = iso(ms(from) + 6 * DAY);
  let total = 0;
  let count = 0;
  for (const e of entries) {
    if (e.deleted_at || e.entry_date < from || e.entry_date > to || groupOf(e.category) === 'Saving') continue;
    total = round2(total + e.amount);
    count++;
  }
  return { total, count };
};

/** Last week (the one before the week `todayIso` is in), or null when nothing was spent in it. `entries` are budget entries (savings are left out). */
export function weekRecap(entries: readonly Entry[], groupOf: GroupOf, todayIso: string): WeekRecap | null {
  const from = iso(ms(weekStart(todayIso)) - 7 * DAY);
  const to = iso(ms(from) + 6 * DAY);
  const { total, count } = weekTotal(entries, groupOf, from);
  if (total <= 0) return null;
  const by = new Map<string, { category: string; amount: number }>();
  for (const e of entries) {
    if (e.deleted_at || e.entry_date < from || e.entry_date > to || groupOf(e.category) === 'Saving') continue;
    const key = catKey(e.category);
    const cur = by.get(key) ?? { category: e.category, amount: 0 };
    cur.amount = round2(cur.amount + e.amount);
    by.set(key, cur);
  }
  const top = [...by.values()].sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)).slice(0, 3);
  const before = [1, 2, 3, 4].map((n) => weekTotal(entries, groupOf, iso(ms(from) - n * 7 * DAY)).total).filter((t) => t > 0);
  const usual = before.length ? round2(before.reduce((a, b) => a + b, 0) / before.length) : 0;
  return { weekOf: from, from, to, total, count, top, usual, change: usual > 0 ? (total - usual) / usual : null };
}

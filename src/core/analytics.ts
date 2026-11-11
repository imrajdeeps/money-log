// The numbers behind the Insights page: nothing here is new data, it only adds up the payments the app already has. Pure: no DOM,
// no storage, no network. Pass it the budget entries (a shared expense already at this account's own share, see logic.ts
// budgetEntries); a category's group (Spending, EMI, Family, Saving) comes from the person's own category list.
import { GROUPS, catKey, daysInMonth, monthOf, normName, round2, shiftMonth } from './logic.ts';
import type { Entry, Group } from './logic.ts';

export type GroupOf = (category: string) => Group;

/** A function from a category name to its group; a name the list does not know counts as Spending. */
export function groupLookup(categories: readonly { name: string; group: Group }[]): GroupOf {
  const map = new Map(categories.map((c) => [catKey(c.name), c.group]));
  return (category) => map.get(catKey(category)) ?? 'Spending';
}

/** The `count` months ending at (and including) `end`, oldest first. */
export function monthsEnding(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(end, i - (count - 1)));
}

const live = (e: Entry) => !e.deleted_at;

export interface MonthTotal { month: string; spent: number; saved: number }

/** Per month: what was spent (every group but Saving) and what was put aside (Saving). */
export function monthlyTotals(entries: readonly Entry[], groupOf: GroupOf, months: readonly string[]): MonthTotal[] {
  const rows = new Map<string, MonthTotal>(months.map((m) => [m, { month: m, spent: 0, saved: 0 }]));
  for (const e of entries) {
    const row = live(e) ? rows.get(monthOf(e.entry_date)) : undefined;
    if (!row) continue;
    if (groupOf(e.category) === 'Saving') row.saved = round2(row.saved + e.amount);
    else row.spent = round2(row.spent + e.amount);
  }
  return months.map((m) => rows.get(m)!);
}

export const averageOf = (values: readonly number[]): number => (values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : 0);

/** now against before as a fraction (0.12 = 12% more); null when there is nothing to compare with. */
export const pctChange = (now: number, before: number): number | null => (before > 0 ? (now - before) / before : null);

export interface CategoryTrend {
  category: string;
  group: Group;
  values: number[]; // per month, oldest first
  total: number;
  thisMonth: number; // the last month in the range
  lastMonth: number;
  change: number | null; // thisMonth against lastMonth
}

/**
 * The categories that took the most in the range (Saving left out), each with its month-by-month figures. `sameDays`: the last month
 * in the range is not over, so its change is measured against the same days of the month before (not the whole of it).
 */
export function categoryTrends(entries: readonly Entry[], groupOf: GroupOf, months: readonly string[], limit = 8, sameDays?: number): CategoryTrend[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const by = new Map<string, CategoryTrend>();
  for (const e of entries) {
    const i = idx.get(monthOf(e.entry_date));
    if (!live(e) || i === undefined) continue;
    const g = groupOf(e.category);
    if (g === 'Saving') continue;
    const k = catKey(e.category);
    let t = by.get(k);
    if (!t) { t = { category: normName(e.category), group: g, values: months.map(() => 0), total: 0, thisMonth: 0, lastMonth: 0, change: null }; by.set(k, t); }
    t.values[i] = round2((t.values[i] ?? 0) + e.amount);
  }
  const last = months.length - 1;
  const rows = [...by.values()].map((t) => {
    const total = round2(t.values.reduce((a, b) => a + b, 0));
    const thisMonth = t.values[last] ?? 0;
    const lastMonth = sameDays === undefined ? (t.values[last - 1] ?? 0) : upTo(entries, groupOf, months[last - 1], normName(t.category), sameDays);
    return { ...t, total, thisMonth, lastMonth, change: pctChange(thisMonth, lastMonth) };
  });
  return rows.sort((a, b) => b.total - a.total || a.category.localeCompare(b.category)).slice(0, limit);
}

// What one category took in a month through a given day of that month.
function upTo(entries: readonly Entry[], groupOf: GroupOf, month: string | undefined, category: string, day: number): number {
  if (!month) return 0;
  let sum = 0;
  for (const e of entries) {
    if (live(e) && monthOf(e.entry_date) === month && catKey(e.category) === catKey(category) && groupOf(e.category) !== 'Saving' && Number(e.entry_date.slice(8, 10)) <= day) sum = round2(sum + e.amount);
  }
  return sum;
}

export interface WeekdayStat { weekday: number; total: number; average: number } // weekday 0 = Monday ... 6 = Sunday

const monFirst = (d: Date) => (d.getDay() + 6) % 7;
const parseIso = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Spending by day of the week over the last `days` days up to today: the total, and the average for a day of that name (days with nothing count as 0). */
export function weekdaySpend(entries: readonly Entry[], groupOf: GroupOf, todayIso: string, days = 90): WeekdayStat[] {
  const today = parseIso(todayIso);
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  const occurrences = new Array<number>(7).fill(0);
  for (let i = 0; i < days; i++) occurrences[monFirst(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i))]!++;
  const totals = new Array<number>(7).fill(0);
  for (const e of entries) {
    if (!live(e) || groupOf(e.category) === 'Saving') continue;
    const d = parseIso(e.entry_date);
    if (d < first || d > today) continue;
    const w = monFirst(d);
    totals[w] = round2((totals[w] ?? 0) + e.amount);
  }
  return totals.map((total, weekday) => ({ weekday, total, average: occurrences[weekday] ? round2(total / occurrences[weekday]!) : 0 }));
}

/** The biggest single payments of a month (Saving left out), largest first. */
export function biggestPayments(entries: readonly Entry[], groupOf: GroupOf, month: string, n = 5): Entry[] {
  return entries
    .filter((e) => live(e) && monthOf(e.entry_date) === month && groupOf(e.category) !== 'Saving')
    .sort((a, b) => b.amount - a.amount || b.entry_date.localeCompare(a.entry_date))
    .slice(0, n);
}

/**
 * Where the month will probably end. Money does not go out evenly (rent and EMIs come early), so when last month is known the guess
 * follows last month's shape: spent so far, times how much bigger last month's end was than last month's same day. With no last month
 * to go by it carries the average pace of the days so far. Null before the 3rd day (too little to go on).
 */
export function projectedMonthEnd(dailyCumulative: readonly number[], month: string, lastMonthDaily?: readonly number[]): number | null {
  const day = dailyCumulative.length;
  if (day < 3) return null;
  const days = daysInMonth(month);
  const spent = dailyCumulative[day - 1] ?? 0;
  if (day >= days) return spent;
  const lastToDate = lastMonthDaily?.[day - 1] ?? 0;
  const lastEnd = lastMonthDaily?.at(-1) ?? 0;
  if (lastToDate > 0 && lastEnd >= lastToDate) return round2(spent * (lastEnd / lastToDate));
  return round2((spent / day) * days);
}

/** What share of the month's spending each group took (Saving left out), largest first, only groups with something. */
export function groupShares(entries: readonly Entry[], groupOf: GroupOf, month: string): { group: Group; total: number; share: number }[] {
  const totals = new Map<Group, number>();
  for (const e of entries) {
    if (!live(e) || monthOf(e.entry_date) !== month) continue;
    const g = groupOf(e.category);
    if (g === 'Saving') continue;
    totals.set(g, round2((totals.get(g) ?? 0) + e.amount));
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return GROUPS.filter((g) => totals.has(g)).map((g) => ({ group: g, total: totals.get(g)!, share: sum > 0 ? totals.get(g)! / sum : 0 })).sort((a, b) => b.total - a.total);
}

/** What was spent (Saving left out) by the end of each day of the month, from the 1st through `throughDay`. */
export function cumulativeByDay(entries: readonly Entry[], groupOf: GroupOf, month: string, throughDay: number): number[] {
  const days = Math.max(0, Math.min(throughDay, daysInMonth(month)));
  const perDay = new Array<number>(days).fill(0);
  for (const e of entries) {
    if (!live(e) || monthOf(e.entry_date) !== month || groupOf(e.category) === 'Saving') continue;
    const d = Number(e.entry_date.slice(8, 10)) - 1;
    if (d >= 0 && d < days) perDay[d] = round2((perDay[d] ?? 0) + e.amount);
  }
  let run = 0;
  return perDay.map((v) => (run = round2(run + v)));
}

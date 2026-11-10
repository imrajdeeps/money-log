// Goals the person sets in the app (a name, a target amount, a target date) and the top-ups they add towards them. Pure,
// like categories.ts and recurring.ts, and synced the same way: one block, merged item by item, the latest change to
// each item wins. Goals and top-ups are items of their own (not a list inside a goal), so two phones adding a top-up at
// the same moment keep both. Removed items stay (marked) so the removal reaches the other phones.
import { daysInMonth, isValidDate } from './logic.ts';
import { MAX_AMOUNT, UUID_RE, catKey, newId, normName, parseTs, round2 } from './logic.ts';
import type { Entry } from './logic.ts';

export const MAX_GOALS = 30; // what one account may keep, removed ones included
export const MAX_TOPUPS = 500;
export const SHORT_TERM_MONTHS = 12; // a goal due within this many months is short term, later is long term

// A goal. id is also its key. n name, a target amount (rupees), d target date, s the amount already saved when it was made
// (may be 0), c the category whose payments count towards it ('' = none), b the day it was made (payments from this day
// on count), x removed, t when it last changed.
export interface Goal { id: string; k: 'g'; n: string; a: number; d: string; s: number; c: string; b: string; x: 0 | 1; t: string }
// A top-up towards goal g: an amount and the day it was set aside.
export interface TopUp { id: string; k: 't'; g: string; a: number; d: string; x: 0 | 1; t: string }
export type GoalItem = Goal | TopUp;
export type Goals = Record<string, GoalItem>;

export interface GoalInput { name: string; target: number; date: string; saved: number; category: string }

const amountOk = (n: unknown, min: 'zero' | 'above'): boolean =>
  typeof n === 'number' && Number.isFinite(n) && (min === 'above' ? n > 0 : n >= 0) && n < MAX_AMOUNT && round2(n) === n;

export function checkGoalInput(i: GoalInput): string | null {
  const n = normName(i.name);
  if (n === '' || n.length > 60) return 'Give the goal a name of up to 60 characters.';
  if (!amountOk(i.target, 'above')) return 'Enter a target above zero, with at most two decimals.';
  if (!isValidDate(i.date)) return 'Pick a target date.';
  if (!amountOk(i.saved, 'zero')) return 'The amount already saved must be zero or more, with at most two decimals.';
  if (i.saved >= i.target) return 'The amount already saved is at least the target, so the goal is already reached.';
  if (normName(i.category).length > 80) return 'Choose a category from the list.';
  return null;
}

export type GoalResult = { ok: true; items: Goals } | { ok: false; error: string };

const count = (items: Goals, k: 'g' | 't') => Object.values(items).filter((x) => x.k === k).length;

export function addGoal(items: Goals, i: GoalInput, todayIso: string, nowIso: string, id: string = newId()): GoalResult {
  const error = checkGoalInput(i);
  if (error) return { ok: false, error };
  if (count(items, 'g') >= MAX_GOALS) return { ok: false, error: 'That is the most goals one account can keep.' };
  const goal: Goal = { id, k: 'g', n: normName(i.name), a: i.target, d: i.date, s: i.saved, c: normName(i.category), b: todayIso, x: 0, t: nowIso };
  return { ok: true, items: { ...items, [id]: goal } };
}

export function editGoal(items: Goals, id: string, i: GoalInput, nowIso: string): GoalResult {
  const cur = items[id];
  if (!cur || cur.k !== 'g' || cur.x) return { ok: false, error: 'That goal is gone.' };
  const error = checkGoalInput(i);
  if (error) return { ok: false, error };
  return { ok: true, items: { ...items, [id]: { ...cur, n: normName(i.name), a: i.target, d: i.date, s: i.saved, c: normName(i.category), t: nowIso } } };
}

// Removing a goal marks it and its top-ups.
export function removeGoal(items: Goals, id: string, nowIso: string): Goals {
  const cur = items[id];
  if (!cur || cur.k !== 'g' || cur.x) return items;
  const out: Goals = { ...items, [id]: { ...cur, x: 1, t: nowIso } };
  for (const [k, v] of Object.entries(items)) if (v.k === 't' && v.g === id && !v.x) out[k] = { ...v, x: 1, t: nowIso };
  return out;
}

export function addTopUp(items: Goals, goalId: string, amount: number, date: string, todayIso: string, nowIso: string, id: string = newId()): GoalResult {
  const goal = items[goalId];
  if (!goal || goal.k !== 'g' || goal.x) return { ok: false, error: 'That goal is gone.' };
  if (!amountOk(amount, 'above')) return { ok: false, error: 'Enter an amount above zero, with at most two decimals.' };
  if (!isValidDate(date) || date > todayIso) return { ok: false, error: 'Pick a date that is today or earlier.' };
  if (count(items, 't') >= MAX_TOPUPS) return { ok: false, error: 'That is the most top-ups one account can keep.' };
  return { ok: true, items: { ...items, [id]: { id, k: 't', g: goalId, a: amount, d: date, x: 0, t: nowIso } } };
}

export function removeTopUp(items: Goals, id: string, nowIso: string): Goals {
  const cur = items[id];
  return !cur || cur.k !== 't' || cur.x ? items : { ...items, [id]: { ...cur, x: 1, t: nowIso } };
}

export const activeGoals = (items: Goals): Goal[] =>
  Object.values(items).filter((x): x is Goal => x.k === 'g' && !x.x).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.n.localeCompare(b.n)));

export const topUpsOf = (items: Goals, goalId: string): TopUp[] =>
  Object.values(items).filter((x): x is TopUp => x.k === 't' && x.g === goalId && !x.x).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));

// ---------------------------------------------------------------- short and long term
// The same day some months on (a 31st lands on the last day of a shorter month).
export function addMonths(iso: string, months: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const key = `${ny}-${String(nm).padStart(2, '0')}`;
  return `${key}-${String(Math.min(d, daysInMonth(key))).padStart(2, '0')}`;
}

// Short term: due within 12 months of today (a date that has passed is short term too: it needs attention now).
export const goalTerm = (dateIso: string, todayIso: string): 'short' | 'long' =>
  dateIso <= addMonths(todayIso, SHORT_TERM_MONTHS) ? 'short' : 'long';

// ---------------------------------------------------------------- sync and backup
// The later change to an item wins (this phone on a tie).
export function mergeGoals(local: Goals, remote: Goals): Goals {
  const out: Goals = { ...remote };
  for (const [id, v] of Object.entries(local)) {
    const r = out[id];
    if (!r || parseTs(v.t) >= parseTs(r.t)) out[id] = v;
  }
  return out;
}

export function sameGoals(a: Goals, b: Goals): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => {
    const x = a[k]!;
    const y = Object.hasOwn(b, k) ? b[k]! : undefined;
    if (!y || x.k !== y.k || x.a !== y.a || x.d !== y.d || x.x !== y.x || x.t !== y.t) return false;
    return x.k === 'g' ? y.k === 'g' && x.n === y.n && x.s === y.s && x.c === y.c && x.b === y.b : y.k === 't' && x.g === y.g;
  });
}

// Validate what comes from the server or a backup. Anything malformed is dropped, never repaired.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanGoals(p: any): Goals {
  const out: Goals = {};
  if (!p || typeof p !== 'object') return out;
  let goals = 0;
  let topups = 0;
  for (const [k, v] of Object.entries(p as Record<string, any>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!UUID_RE.test(k) || !v || v.id !== k || (v.x !== 0 && v.x !== 1) || !Number.isFinite(parseTs(v.t))) continue;
    if (v.k === 'g') {
      if (goals >= MAX_GOALS || typeof v.n !== 'string' || normName(v.n) !== v.n || typeof v.c !== 'string' || normName(v.c) !== v.c) continue;
      if (typeof v.b !== 'string' || !isValidDate(v.b)) continue;
      if (checkGoalInput({ name: v.n, target: v.a, date: v.d, saved: v.s, category: v.c }) !== null) continue;
      out[k] = { id: k, k: 'g', n: v.n, a: v.a, d: v.d, s: v.s, c: v.c, b: v.b, x: v.x, t: v.t };
      goals++;
    } else if (v.k === 't') {
      if (topups >= MAX_TOPUPS || typeof v.g !== 'string' || !UUID_RE.test(v.g) || !amountOk(v.a, 'above') || typeof v.d !== 'string' || !isValidDate(v.d)) continue;
      out[k] = { id: k, k: 't', g: v.g, a: v.a, d: v.d, x: v.x, t: v.t };
      topups++;
    }
  }
  return out;
}

// ---------------------------------------------------------------- progress and what a goal needs

export interface GoalProgress {
  fromStart: number; // the amount already saved when the goal was made
  fromTopUps: number; // top-ups added since
  fromPayments: number; // payments in the linked category made on or after the day the goal was made
  saved: number; // the three together
  remaining: number; // never below zero
  fraction: number; // 0 to 1, for the bar
  reached: boolean;
}

// `entries` are budget entries (shared expenses already at this account's own share, see logic.budgetEntries). The three
// sources are separate on purpose: a saving is logged as a payment in the linked category, or added as a top-up, not both.
export function goalProgress(goal: Goal, items: Goals, entries: Entry[]): GoalProgress {
  const fromTopUps = fromPaiseSum(topUpsOf(items, goal.id).map((t) => t.a));
  const key = goal.c === '' ? null : catKey(goal.c);
  const fromPayments = key === null ? 0 : fromPaiseSum(entries.filter((e) => !e.deleted_at && catKey(e.category) === key && e.entry_date >= goal.b).map((e) => e.amount));
  const saved = fromPaiseSum([goal.s, fromTopUps, fromPayments]);
  const remaining = Math.max(0, Math.round((goal.a - saved) * 100) / 100);
  return { fromStart: goal.s, fromTopUps, fromPayments, saved, remaining, fraction: goal.a > 0 ? Math.min(1, saved / goal.a) : 0, reached: remaining === 0 };
}

const fromPaiseSum = (amounts: number[]): number => amounts.reduce((a, n) => a + Math.round(n * 100), 0) / 100;

// Months from this month to the target date's month, counting this month: a date later this month is 1; never below 1.
export function monthsLeft(dateIso: string, todayIso: string): number {
  const [y1 = 1970, m1 = 1] = todayIso.split('-').map(Number);
  const [y2 = 1970, m2 = 1] = dateIso.split('-').map(Number);
  return Math.max(1, (y2 * 12 + m2) - (y1 * 12 + m1) + 1);
}

export type GoalLine =
  | { state: 'reached' }
  | { state: 'passed'; remaining: number } // the date has gone by and money is still to go
  | { state: 'needs'; monthly: number; months: number }; // set aside `monthly` a month for `months` months

// A goal in one line: reached; its date passed with money still to go; or what it needs a month (rounded up to the rupee).
export function goalLine(goal: Goal, progress: GoalProgress, todayIso: string): GoalLine {
  if (progress.reached) return { state: 'reached' };
  if (goal.d < todayIso) return { state: 'passed', remaining: progress.remaining };
  const months = monthsLeft(goal.d, todayIso);
  return { state: 'needs', monthly: Math.ceil(progress.remaining / months), months };
}

// ---------------------------------------------------------------- the plan
export interface PlanRow { goal: Goal; monthly: number; months: number }
export interface GoalPlan {
  rows: PlanRow[]; // the goals that still need money and have a date to come, nearest date first
  total: number; // what to set aside each month for all of them
  budget: number | null; // this month's Saving budget, or null when none is set
  gap: number | null; // total - budget: above zero the budget is short by this much, below zero it has this much to spare
  covers: boolean | null; // null when there is no budget to compare with
  reached: number; // goals with nothing left to save
  passed: number; // goals whose date has gone by with money still to go (not in the monthly total until the date changes)
}

// What to set aside each month for every goal that still needs money, and whether the Saving budget covers the total. Plain
// division of what remains by the months left (no interest, no returns).
export function goalPlan(goals: { goal: Goal; line: GoalLine }[], savingBudget: number | null): GoalPlan {
  const rows: PlanRow[] = [];
  let reached = 0;
  let passed = 0;
  for (const { goal, line } of goals) {
    if (line.state === 'reached') reached++;
    else if (line.state === 'passed') passed++;
    else rows.push({ goal, monthly: line.monthly, months: line.months });
  }
  rows.sort((a, b) => (a.goal.d < b.goal.d ? -1 : a.goal.d > b.goal.d ? 1 : a.goal.n.localeCompare(b.goal.n)));
  const total = rows.reduce((n, r) => n + r.monthly, 0);
  const gap = savingBudget === null ? null : total - savingBudget;
  return { rows, total, budget: savingBudget, gap, covers: gap === null ? null : gap <= 0, reached, passed };
}

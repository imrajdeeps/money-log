// Goals the person sets in the app (a name, a target amount, a target date) and the top-ups they add towards them. Pure,
// like categories.ts and recurring.ts, and synced the same way: one block, merged item by item, the latest change to
// each item wins. Goals and top-ups are items of their own (not a list inside a goal), so two phones adding a top-up at
// the same moment keep both. Removed items stay (marked) so the removal reaches the other phones.
import { isNoticeKind } from './noticeKinds.ts';
import type { NoticeKind } from './noticeKinds.ts';
import { MAX_AMOUNT, UUID_RE, asText, catKey, daysInMonth, isValidDate, newId, normName, parseTs, round2, uuidFromKey } from './logic.ts';
import type { Entry } from './logic.ts';
import { tr } from './i18n.ts';

export const MAX_GOALS = 30; // what one account may keep, removed ones included
export const MAX_TOPUPS = 500;
export const MAX_NET_UPDATES = 400;
export const MAX_DUE_ENTRIES = 400; // removed ones included
export const MAX_DUE_TITLE = 120;
export const MAX_DISMISSALS = 1000; // dismissals read back; the app itself keeps the newest 500
export const MAX_NOTICE_KEY = 120;
export const MAX_INCOME_CATS = 50; // the person's own income categories, removed ones included
export const incomeCatId = (name: string): string => uuidFromKey(`incomecat|${catKey(name)}`);
const NET_LIMIT = 1e12;
export const SHORT_TERM_MONTHS = 12; // a goal due within this many months is short term, later is long term

// A goal. id is also its key. n name, a target amount (rupees), d target date, s the amount already saved when it was made
// (may be 0), c the category whose payments count towards it ('' = none), b the day it was made (payments from this day
// on count), x removed, t when it last changed.
export interface Goal { id: string; k: 'g'; n: string; a: number; d: string; s: number; c: string; b: string; x: 0 | 1; t: string }
// A top-up towards goal g: an amount and the day it was set aside.
export interface TopUp { id: string; k: 't'; g: string; a: number; d: string; x: 0 | 1; t: string }
// A net worth update: what the person's net worth was on a day (a number that may be negative). Kept in the same block as the goals
// (so it syncs and is backed up with them, with no new database block), one item per update so two phones never overwrite each other.
export interface NetUpdate { id: string; k: 'n'; a: number; d: string; x: 0 | 1; t: string }
// An item on the due list (a one-off payment or a to-do) made in the app; the logic is in dueItems.ts. n title, d due day ('' = no date),
// a amount in rupees (0 = none; one-off payments only), f done, x removed. Kept in this block like net worth updates.
export type DueEntryKind = 'oneoff' | 'todo';
export interface DueEntry { id: string; k: 'd'; kind: DueEntryKind; n: string; d: string; a: number; f: 0 | 1; x: 0 | 1; t: string }
// A notification the person dismissed (key: what it refers to, see notifications.ts), and their switches for the kinds of notification
// (off: the kinds they switched off; one item with a fixed id). Both live in this block like everything else made on Plan.
export const NOTICE_SETTINGS_ID = uuidFromKey('notice-settings');
export const noticeId = (key: string): string => uuidFromKey(`notice|${key}`);
export interface DismissEntry { id: string; k: 'k'; key: string; x: 0 | 1; t: string }
export interface NoticeSettings { id: string; k: 's'; off: NoticeKind[]; x: 0 | 1; t: string }
// An income category of the person's own (n its name; the id comes from the name, so two phones adding the same one make one item).
// Lives in this block like the rest; the logic is in income.ts.
export interface IncomeCat { id: string; k: 'i'; n: string; x: 0 | 1; t: string }
export type GoalItem = Goal | TopUp | NetUpdate | DueEntry | DismissEntry | NoticeSettings | IncomeCat;
export type Goals = Record<string, GoalItem>;

export interface GoalInput { name: string; target: number; date: string; saved: number; category: string }

const amountOk = (n: unknown, min: 'zero' | 'above'): boolean =>
  typeof n === 'number' && Number.isFinite(n) && (min === 'above' ? n > 0 : n >= 0) && n < MAX_AMOUNT && round2(n) === n;

export function checkGoalInput(i: GoalInput): string | null {
  const n = normName(i.name);
  if (n === '' || n.length > 60) return tr('Give the goal a name of up to 60 characters.');
  if (!amountOk(i.target, 'above')) return tr('Enter a target above zero, with at most two decimals.');
  if (!isValidDate(i.date)) return tr('Pick a target date.');
  if (!amountOk(i.saved, 'zero')) return tr('The amount already saved must be zero or more, with at most two decimals.');
  if (i.saved >= i.target) return tr('The amount already saved is at least the target, so the goal is already reached.');
  if (normName(i.category).length > 80) return tr('Choose a category from the list.');
  return null;
}

export type GoalResult = { ok: true; items: Goals } | { ok: false; error: string };

const count = (items: Goals, k: 'g' | 't' | 'n' | 'd') => Object.values(items).filter((x) => x.k === k).length;

export function addGoal(items: Goals, i: GoalInput, todayIso: string, nowIso: string, id: string = newId()): GoalResult {
  const error = checkGoalInput(i);
  if (error) return { ok: false, error };
  if (count(items, 'g') >= MAX_GOALS) return { ok: false, error: tr('That is the most goals one account can keep.') };
  const goal: Goal = { id, k: 'g', n: normName(i.name), a: i.target, d: i.date, s: i.saved, c: normName(i.category), b: todayIso, x: 0, t: nowIso };
  return { ok: true, items: { ...items, [id]: goal } };
}

export function editGoal(items: Goals, id: string, i: GoalInput, nowIso: string): GoalResult {
  const cur = items[id];
  if (cur?.k !== 'g' || cur.x) return { ok: false, error: tr('That goal is gone.') };
  const error = checkGoalInput(i);
  if (error) return { ok: false, error };
  return { ok: true, items: { ...items, [id]: { ...cur, n: normName(i.name), a: i.target, d: i.date, s: i.saved, c: normName(i.category), t: nowIso } } };
}

// Removing a goal marks it and its top-ups.
export function removeGoal(items: Goals, id: string, nowIso: string): Goals {
  const cur = items[id];
  if (cur?.k !== 'g' || cur.x) return items;
  const out: Goals = { ...items, [id]: { ...cur, x: 1, t: nowIso } };
  for (const [k, v] of Object.entries(items)) if (v.k === 't' && v.g === id && !v.x) out[k] = { ...v, x: 1, t: nowIso };
  return out;
}

export function addTopUp(items: Goals, goalId: string, amount: number, date: string, todayIso: string, nowIso: string, id: string = newId()): GoalResult {
  const goal = items[goalId];
  if (goal?.k !== 'g' || goal.x) return { ok: false, error: tr('That goal is gone.') };
  if (!amountOk(amount, 'above')) return { ok: false, error: tr('Enter an amount above zero, with at most two decimals.') };
  if (!isValidDate(date) || date > todayIso) return { ok: false, error: tr('Pick a date that is today or earlier.') };
  if (count(items, 't') >= MAX_TOPUPS) return { ok: false, error: tr('That is the most top-ups one account can keep.') };
  return { ok: true, items: { ...items, [id]: { id, k: 't', g: goalId, a: amount, d: date, x: 0, t: nowIso } } };
}

export function removeTopUp(items: Goals, id: string, nowIso: string): Goals {
  const cur = items[id];
  return cur?.k !== 't' || cur.x ? items : { ...items, [id]: { ...cur, x: 1, t: nowIso } };
}

// ---------------------------------------------------------------- net worth updates
const netOk = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < NET_LIMIT && round2(n) === n;

/** What a person types as their net worth: digits with optional commas, a rupee sign and a leading minus (or brackets), up to two decimals. null if it is not one. */
export function parseNetAmount(text: unknown): number | null {
  let s = asText(text).replace(/[₹\s,]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { neg = !neg; s = s.slice(1); }
  if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(s)) return null;
  const n = round2(Number.parseFloat(s)) * (neg ? -1 : 1);
  return netOk(n) ? n + 0 : null; // + 0: no negative zero
}

export function addNetUpdate(items: Goals, amount: number, date: string, todayIso: string, nowIso: string, id: string = newId()): GoalResult {
  if (!netOk(amount)) return { ok: false, error: tr('Enter your net worth as a number, with at most two decimals. It can be negative.') };
  if (!isValidDate(date) || date > todayIso) return { ok: false, error: tr('Pick a date that is today or earlier.') };
  if (count(items, 'n') >= MAX_NET_UPDATES) return { ok: false, error: tr('That is the most net worth updates one account can keep. Remove some old ones.') };
  return { ok: true, items: { ...items, [id]: { id, k: 'n', a: amount, d: date, x: 0, t: nowIso } } };
}

export function removeNetUpdate(items: Goals, id: string, nowIso: string): Goals {
  const cur = items[id];
  return cur?.k !== 'n' || cur.x ? items : { ...items, [id]: { ...cur, x: 1, t: nowIso } };
}

/** The updates still kept, newest day first (on one day, the one entered last first). */
export const netUpdates = (items: Goals): NetUpdate[] =>
  Object.values(items).filter((x): x is NetUpdate => x.k === 'n' && !x.x).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : parseTs(b.t) - parseTs(a.t)));

export interface NetNow { value: number; date: string; previous: { value: number; date: string } | null; change: number | null }

/** The latest figure and how it moved since the one before it; null before the first update. */
export function netNow(items: Goals): NetNow | null {
  const all = netUpdates(items);
  const [last, before] = all;
  if (!last) return null;
  return { value: last.a, date: last.d, previous: before ? { value: before.a, date: before.d } : null, change: before ? round2(last.a - before.a) : null };
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

// Two copies of an item are the same when everything the person can change in it is.
function sameItem(x: GoalItem, y: GoalItem | undefined): boolean {
  if (x.k !== y?.k || x.x !== y.x || x.t !== y.t) return false;
  switch (x.k) {
    case 'g': return y.k === 'g' && x.n === y.n && x.a === y.a && x.d === y.d && x.s === y.s && x.c === y.c && x.b === y.b;
    case 't': return y.k === 't' && x.g === y.g && x.a === y.a && x.d === y.d;
    case 'n': return y.k === 'n' && x.a === y.a && x.d === y.d;
    case 'd': return y.k === 'd' && x.kind === y.kind && x.n === y.n && x.a === y.a && x.d === y.d && x.f === y.f;
    case 'k': return y.k === 'k' && x.key === y.key;
    case 'i': return y.k === 'i' && x.n === y.n;
    default: return y.k === 's' && x.off.join() === y.off.join();
  }
}

export function sameGoals(a: Goals, b: Goals): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => sameItem(a[k]!, Object.hasOwn(b, k) ? b[k] : undefined));
}

// Validate what comes from the server or a backup. Anything malformed is dropped, never repaired. Each kind of item has its own
// check and its own cap (removed items count); anything of an unknown kind is dropped.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;
const isDay = (d: unknown): d is string => typeof d === 'string' && isValidDate(d);
const isTidy = (n: unknown): n is string => typeof n === 'string' && normName(n) === n;

function cleanGoalItem(k: string, v: Raw): Goal | null {
  if (!isTidy(v.n) || !isTidy(v.c) || !isDay(v.b)) return null;
  if (checkGoalInput({ name: v.n, target: v.a, date: v.d, saved: v.s, category: v.c }) !== null) return null;
  return { id: k, k: 'g', n: v.n, a: v.a, d: v.d, s: v.s, c: v.c, b: v.b, x: v.x, t: v.t };
}

function cleanTopUpItem(k: string, v: Raw): TopUp | null {
  if (typeof v.g !== 'string' || !UUID_RE.test(v.g) || !amountOk(v.a, 'above') || !isDay(v.d)) return null;
  return { id: k, k: 't', g: v.g, a: v.a, d: v.d, x: v.x, t: v.t };
}

function cleanNetItem(k: string, v: Raw): NetUpdate | null {
  if (!netOk(v.a) || !isDay(v.d)) return null;
  return { id: k, k: 'n', a: v.a, d: v.d, x: v.x, t: v.t };
}

function cleanDueItem(k: string, v: Raw): DueEntry | null {
  if ((v.kind !== 'oneoff' && v.kind !== 'todo') || (v.f !== 0 && v.f !== 1)) return null;
  if (!isTidy(v.n) || v.n === '' || v.n.length > MAX_DUE_TITLE) return null;
  if (v.d !== '' && !isDay(v.d)) return null;
  if (!amountOk(v.a, 'zero') || (v.kind === 'todo' && v.a !== 0)) return null;
  return { id: k, k: 'd', kind: v.kind, n: v.n, d: v.d, a: v.a, f: v.f, x: v.x, t: v.t };
}

function cleanDismissItem(k: string, v: Raw): DismissEntry | null {
  if (typeof v.key !== 'string' || v.key === '' || v.key.length > MAX_NOTICE_KEY || k !== noticeId(v.key)) return null;
  return { id: k, k: 'k', key: v.key, x: v.x, t: v.t };
}

function cleanIncomeCatItem(k: string, v: Raw): IncomeCat | null {
  if (!isTidy(v.n) || v.n === '' || v.n.length > 60 || k !== incomeCatId(v.n)) return null;
  return { id: k, k: 'i', n: v.n, x: v.x, t: v.t };
}

function cleanNoticeSettingsItem(k: string, v: Raw): NoticeSettings | null {
  if (k !== NOTICE_SETTINGS_ID || !Array.isArray(v.off) || !v.off.every(isNoticeKind)) return null;
  return { id: k, k: 's', off: [...new Set<NoticeKind>(v.off)].sort((a, b) => a.localeCompare(b)), x: v.x, t: v.t };
}

const ITEM_KINDS: Record<string, { max: number; clean: (k: string, v: Raw) => GoalItem | null }> = {
  g: { max: MAX_GOALS, clean: cleanGoalItem },
  t: { max: MAX_TOPUPS, clean: cleanTopUpItem },
  n: { max: MAX_NET_UPDATES, clean: cleanNetItem },
  d: { max: MAX_DUE_ENTRIES, clean: cleanDueItem },
  k: { max: MAX_DISMISSALS, clean: cleanDismissItem },
  s: { max: 1, clean: cleanNoticeSettingsItem },
  i: { max: MAX_INCOME_CATS, clean: cleanIncomeCatItem },
};

const hasCommonFields = (k: string, v: Raw): boolean => UUID_RE.test(k) && v?.id === k && (v.x === 0 || v.x === 1) && Number.isFinite(parseTs(v.t));

export function cleanGoals(p: Raw): Goals {
  const out: Goals = {};
  if (!p || typeof p !== 'object') return out;
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(p as Record<string, Raw>)) {
    if (!hasCommonFields(k, v)) continue;
    const kind = Object.hasOwn(ITEM_KINDS, v.k) ? ITEM_KINDS[v.k] : undefined;
    if (!kind || (counts[v.k] ?? 0) >= kind.max) continue;
    const item = kind.clean(k, v);
    if (!item) continue;
    out[k] = item;
    counts[v.k] = (counts[v.k] ?? 0) + 1;
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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

// Pure helpers behind the Home dashboard's tiles: no DOM, no storage, no network. They only add up what the other modules
// already know; nothing here is new data. Kept separate so the Node test runner can check them.
import { classifyDue } from '../../core/blocks.ts';
import type { DueItem, DueView } from '../../core/blocks.ts';
import { activeMembers, fromPaise, groupBalances } from '../../core/groups.ts';
import type { Group as SharedGroup, Member, Settlement } from '../../core/groups.ts';
import { coupleLine } from '../../core/couple.ts';
import { activeGoals, goalLine, goalProgress, goalTerm } from '../../core/goals.ts';
import type { Goal, GoalLine, GoalProgress, Goals } from '../../core/goals.ts';
import { GROUPS, budgetEntries, catKey, daysInMonth, monthOf, normName, round2, shiftMonth, summarizeMonth } from '../../core/logic.ts';
import type { Entry, Group, MonthSummary, PlanData } from '../../core/logic.ts';

// Which of the four groups get a tile on the Overview: once any group has a budget, only those; with none set, all four.
export function overviewGroups(groups: MonthSummary['groups']): Group[] {
  const set = GROUPS.filter((g) => groups[g].budgeted);
  return set.length > 0 ? [...set] : [...GROUPS];
}

const savingKeys = (plan: PlanData): Set<string> => new Set(plan.rows.filter((r) => r.g === 'Saving').map((r) => catKey(r.c)));

// What was spent by the end of each day of the month (index 0 is the 1st), Saving left out. `entries` are budget entries:
// shared expenses already at this account's share.
export function spentByDay(entries: Entry[], month: string, plan: PlanData): number[] {
  const saving = savingKeys(plan);
  const days = new Array<number>(daysInMonth(month)).fill(0);
  for (const e of entries) {
    if (e.deleted_at || monthOf(e.entry_date) !== month || saving.has(catKey(e.category))) continue;
    const d = Number(e.entry_date.slice(8, 10)) - 1;
    if (d >= 0 && d < days.length) days[d] = round2((days[d] ?? 0) + e.amount);
  }
  let run = 0;
  return days.map((v) => (run = round2(run + v)));
}

export interface MonthOverview {
  month: string;
  summary: MonthSummary;
  day: number; // today's day of the month (the month's last day once it is over)
  days: number;
  spent: number; // everything except Saving
  budget: number; // planned for Spending, EMI and Family together
  budgeted: boolean; // at least one of those has a budget
  daily: number[]; // spent by the end of days 1..day
  lastDaily: number[]; // spent by the end of each day of last month
  lastToDate: number; // last month's spending by the same day of the month
  change: number | null; // this month against lastToDate (0.12 = 12% more); null when there is nothing to compare
}

// The month as the hero tile shows it. planThis and planLast are each month's budgets (categories.ts planForMonth), which
// also say which categories are Saving.
export function monthOverview(all: Entry[], me: string | null, planThis: PlanData, planLast: PlanData, todayIso: string): MonthOverview {
  const month = monthOf(todayIso);
  const last = shiftMonth(month, -1);
  const entries = budgetEntries(all, me);
  const summary = summarizeMonth(entries, planThis, month);
  const days = daysInMonth(month);
  const day = Math.min(days, Number(todayIso.slice(8, 10)));
  const daily = spentByDay(entries, month, planThis).slice(0, day);
  const lastDaily = spentByDay(entries, last, planLast);
  const lastToDate = lastDaily[Math.min(day, lastDaily.length) - 1] ?? 0;
  const toDate = daily.at(-1) ?? 0;
  const spend: Group[] = ['Spending', 'EMI', 'Family'];
  return {
    month,
    summary,
    day,
    days,
    spent: round2(summary.totalSpent - summary.groups.Saving.spent),
    budget: round2(spend.reduce((a, g) => a + summary.groups[g].planned, 0)),
    budgeted: spend.some((g) => summary.groups[g].budgeted),
    daily,
    lastDaily,
    lastToDate,
    change: lastToDate > 0 && toDate > 0 ? (toDate - lastToDate) / lastToDate : null,
  };
}

export interface CategoryShare { category: string; spent: number; share: number }

// Where this month's money went, biggest first: the top `n` categories and the rest added up. Saving is not spending, so
// it is left out; payments under a category that is not in the list count, under their own name.
export function topCategories(s: MonthSummary, n = 4): { top: CategoryShare[]; rest: { count: number; spent: number; share: number }; total: number } {
  const lines = [
    ...s.rows.filter((r) => r.group !== 'Saving' && r.spent > 0).map((r) => ({ category: r.category, spent: r.spent })),
    ...s.extra.filter((x) => x.spent > 0).map((x) => ({ category: normName(x.category), spent: x.spent })),
  ].sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category));
  const total = round2(lines.reduce((a, l) => a + l.spent, 0));
  const share = (v: number) => (total > 0 ? v / total : 0);
  const restLines = lines.slice(n);
  const restSpent = round2(restLines.reduce((a, l) => a + l.spent, 0));
  return {
    top: lines.slice(0, n).map((l) => ({ ...l, share: share(l.spent) })),
    rest: { count: restLines.length, spent: restSpent, share: share(restSpent) },
    total,
  };
}

// The due list in one look: what is overdue, what is still open, and the next few, overdue first (blocks.ts classifyDue).
export function dueOverview(items: DueItem[], todayIso: string, n = 2): { open: number; overdue: number; next: DueView[] } | null {
  if (items.length === 0) return null;
  const views = classifyDue(items, {}, '', todayIso).filter((v) => !v.isDone);
  return { open: views.length, overdue: views.filter((v) => v.state === 'overdue').length, next: views.slice(0, n) };
}

// This account's position across all its groups, in rupees: what it is owed and what it owes (both 0 or more).
// One Overview tile for each couple the account is half of (a couple with both people in it): the partner's name and the
// one line, "Priya owes you ₹50". At most two, so the Overview does not fill up.
export interface CoupleTile { id: string; partner: string; text: string; tone: 'owed' | 'late' | 'muted' }
export function coupleTiles(groups: SharedGroup[], members: Member[], entries: Entry[], settlements: Settlement[], me: string | null): CoupleTile[] {
  if (!me) return [];
  const out: CoupleTile[] = [];
  for (const g of groups) {
    if (g.kind !== 'couple') continue;
    const people = activeMembers(members, g.id);
    const partner = people.length === 2 && people.some((m) => m.user_id === me) ? people.find((m) => m.user_id !== me) : undefined;
    if (!partner) continue;
    const line = coupleLine(groupBalances(g.id, entries, settlements)[me] ?? 0, partner.display_name);
    out.push({ id: g.id, partner: partner.display_name, ...line });
    if (out.length === 2) break;
  }
  return out;
}

// The goal the Overview tile shows: the nearest short-term goal that still needs money; failing that the nearest goal that
// still needs money (all long term); failing that the nearest goal (all are reached). Null when there are no goals.
export interface GoalTile { goal: Goal; progress: GoalProgress; line: GoalLine; term: 'short' | 'long'; count: number }
export function nearestGoal(items: Goals, entries: Entry[], todayIso: string): GoalTile | null {
  const all = activeGoals(items).map((goal) => {
    const progress = goalProgress(goal, items, entries);
    return { goal, progress, line: goalLine(goal, progress, todayIso), term: goalTerm(goal.d, todayIso) };
  });
  if (all.length === 0) return null;
  const open = all.filter((g) => g.line.state !== 'reached');
  const pick = open.find((g) => g.term === 'short') ?? open[0] ?? all[0]!;
  return { ...pick, count: all.length };
}

export function groupsOverview(groups: SharedGroup[], entries: Entry[], settlements: Settlement[], me: string | null): { owed: number; owe: number } {
  let owed = 0;
  let owe = 0;
  for (const g of groups) {
    const b = me ? (groupBalances(g.id, entries, settlements)[me] ?? 0) : 0;
    if (b > 0) owed += b;
    else owe -= b;
  }
  return { owed: fromPaise(owed), owe: fromPaise(owe) };
}


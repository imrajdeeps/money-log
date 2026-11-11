// Income and the monthly cash flow (version 1.26). Income is an entry with kind 'in'; it never reaches a total of spending (see
// logic.budgetEntries), and this file is the one place that adds it up. The person's own income categories are items of kind 'i' in
// the goals block (same sync and backup, no new database table). Pure: no DOM, no storage, no network.
import { MAX_INCOME_CATS, incomeCatId } from './goals.ts';
import type { Goals, IncomeCat } from './goals.ts';
import { checkName } from './categories.ts';
import { biggestPayments, monthlyTotals } from './analytics.ts';
import type { GroupOf } from './analytics.ts';
import { budgetEntries, catKey, incomeEntries, laterThan, monthOf, normName, round2 } from './logic.ts';
import type { Entry } from './logic.ts';
import { tr } from './i18n.ts';

// What every account starts with. "Other income" is last on purpose: it is where an odd one goes.
export const INCOME_BUILTIN: readonly string[] = [
  'Salary',
  'Business / Freelance',
  'Lent back',
  'Cashback',
  'Refund',
  'Interest & dividends',
  'Rent received',
  'Gift received',
  'Other income',
];

const own = (items: Goals): IncomeCat[] => Object.values(items).filter((v): v is IncomeCat => v.k === 'i');

// The built-in categories, then the person's own (not removed), by name. A name the built-ins already have is not repeated.
export function incomeCategories(items: Goals): string[] {
  const seen = new Set(INCOME_BUILTIN.map(catKey));
  const mine = own(items)
    .filter((c) => !c.x && !seen.has(catKey(c.n)))
    .map((c) => c.n)
    .sort((a, b) => a.localeCompare(b));
  return [...INCOME_BUILTIN, ...mine];
}

export const isOwnIncomeCategory = (items: Goals, name: string): boolean => {
  const c = items[incomeCatId(name)];
  return c?.k === 'i' && !c.x;
};

export type IncomeCatResult = { ok: true; items: Goals; name: string } | { ok: false; error: string };

// Add an income category of the person's own. A removed one of the same name comes back.
export function addIncomeCategory(items: Goals, rawName: string, nowIso: string): IncomeCatResult {
  const bad = checkName(rawName);
  if (bad) return { ok: false, error: bad };
  const name = normName(rawName);
  const key = catKey(name);
  const builtin = INCOME_BUILTIN.find((b) => catKey(b) === key);
  if (builtin) return { ok: true, items, name: builtin }; // already there: just pick it
  const id = incomeCatId(name);
  const prev = items[id];
  if (prev?.k === 'i' && !prev.x) return { ok: true, items, name: prev.n };
  if (!prev && own(items).length >= MAX_INCOME_CATS) return { ok: false, error: tr('You can keep at most {0} income categories of your own.', MAX_INCOME_CATS) };
  const t = prev ? laterThan(prev.t, nowIso) : nowIso;
  return { ok: true, items: { ...items, [id]: { id, k: 'i', n: name, x: 0, t } }, name };
}

// Remove one of the person's own income categories from the list. Entries already logged under it keep their name.
export function removeIncomeCategory(items: Goals, name: string, nowIso: string): Goals {
  const id = incomeCatId(name);
  const prev = items[id];
  if (prev?.k !== 'i' || prev.x) return items;
  return { ...items, [id]: { ...prev, x: 1, t: laterThan(prev.t, nowIso) } };
}

// ---------------------------------------------------------------- the cash flow
export interface CashFlow {
  month: string;
  income: number;
  out: number; // spending of the month, savings left out
  left: number; // income minus out (below zero when more went out than came in)
  saved: number; // what went to Savings, shown beside the rest, never part of out
  kept: number | null; // left as a fraction of income (0.3 = kept 30%); null when there was no income
  incomeBy: { category: string; amount: number }[]; // largest first
}

// Income of one month by category (spelled as first logged), largest first.
function incomeByCategory(income: readonly Entry[], month: string): { category: string; amount: number }[] {
  const by = new Map<string, { category: string; amount: number }>();
  for (const e of income) {
    if (monthOf(e.entry_date) !== month) continue;
    const key = catKey(e.category);
    const cur = by.get(key) ?? { category: normName(e.category), amount: 0 };
    cur.amount = round2(cur.amount + e.amount);
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/** In, out, left and saved for one month. `entries` is everything this phone holds; income and spending are told apart here. */
export function cashFlow(entries: readonly Entry[], me: string | null, groupOf: GroupOf, month: string): CashFlow {
  const incomeBy = incomeByCategory(incomeEntries(entries, me), month);
  const income = round2(incomeBy.reduce((a, c) => a + c.amount, 0));
  const totals = monthlyTotals(budgetEntries([...entries], me), groupOf, [month])[0]!;
  const left = round2(income - totals.spent);
  return { month, income, out: totals.spent, left, saved: totals.saved, kept: income > 0 ? left / income : null, incomeBy };
}

export interface FlowPoint { month: string; income: number; out: number }

/** In and out for each of the months, oldest first, for the bars. */
export function cashFlowSeries(entries: readonly Entry[], me: string | null, groupOf: GroupOf, months: readonly string[]): FlowPoint[] {
  const income = incomeEntries(entries, me);
  const spent = monthlyTotals(budgetEntries([...entries], me), groupOf, months);
  return months.map((m, i) => ({
    month: m,
    income: round2(income.filter((e) => monthOf(e.entry_date) === m).reduce((a, e) => a + e.amount, 0)),
    out: spent[i]!.spent,
  }));
}

/** The biggest single payments that went out in a month (savings left out). */
export const biggestOutflows = (entries: readonly Entry[], me: string | null, groupOf: GroupOf, month: string, n = 5): Entry[] =>
  biggestPayments(budgetEntries([...entries], me), groupOf, month, n);

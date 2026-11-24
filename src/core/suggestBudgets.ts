// Suggested budgets (version 1.32): after a month of payments, the month's spending rounded up becomes the next budget, in one tap. Pure.
import type { MonthRow } from './logic.ts';

/** Rounded up to the next 100 (to the next 500 above 5,000), so a budget is a number a person would write. */
export const roundUpBudget = (spent: number): number => {
  const step = spent > 5000 ? 500 : 100;
  return Math.ceil(spent / step) * step;
};

/** One budget for each category that had spending in the month. */
export const suggestBudgets = (rows: readonly MonthRow[]): { name: string; amount: number }[] =>
  rows.filter((r) => r.spent > 0).map((r) => ({ name: r.category, amount: roundUpBudget(r.spent) }));

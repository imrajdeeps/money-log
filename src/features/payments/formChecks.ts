// What the payment form checks before it saves, in the order it checks: the amount, category and date; then, for a shared expense, who
// paid and each person's share; then a payment that repeats every month. Each gives what to save or the first thing that is wrong.
import { computeShares } from '../../core/groups.ts';
import type { Member } from '../../core/groups.ts';
import { checkRecurInput } from '../../core/recurring.ts';
import { isValidDate, parseAmount } from '../../core/logic.ts';
import type { Method, NewEntryInput } from '../../core/logic.ts';
import type { SplitState } from './SplitEditor.tsx';
import { tr } from '../../core/i18n.ts';

export type Basics = { amt: number; date: string } | { problem: string };

/** The amount, category and date typed, or the first thing wrong with them. A date left empty is today. */
export function readBasics(amountText: string, category: string, date: string | null, today: string): Basics {
  const amt = parseAmount(amountText);
  if (amt === null) return { problem: amountText.trim() === '' ? tr('Enter an amount.') : tr('Amount must be a positive number with at most 2 decimals.') };
  if (!category) return { problem: tr('Pick a category.') };
  const d = date ?? today;
  if (!isValidDate(d)) return { problem: tr('Pick a valid date.') };
  if (d > today) return { problem: tr('The date cannot be in the future.') };
  return { amt, date: d };
}

export type SharedPart = { group: NewEntryInput['group'] } | { problem: string };

/** The group part of an expense: none for a private payment; for a shared one, who paid and each person's share, or what is wrong with the split. */
export function sharedPart(o: { groupId: string; me: string | null; split: SplitState | null; people: readonly Member[]; amt: number }): SharedPart {
  if (!o.groupId) return { group: null };
  if (!o.me || !o.split) return { problem: tr('Sign in to share an expense with a group.') };
  const r = computeShares(o.split.mode, o.amt, o.people.map((m) => m.user_id), new Set(o.split.included), o.split.values);
  if (!r.shares) return { problem: r.problem };
  if (o.split.paidBy !== o.me && !(o.me in r.shares)) return { problem: tr('You can only record an expense that you paid or share in.') };
  return { group: { group_id: o.groupId, paid_by: o.split.paidBy, shares: r.shares } };
}

export type RecurInput = Parameters<typeof checkRecurInput>[0];
export type RepeatPart = { recur: RecurInput | null } | { problem: string };

/** A payment that repeats every month (private payments only), checked first so that nothing is half done. */
export function repeatPart(o: { repeat: boolean; groupId: string; category: string; amt: number; date: string; method: Method | null; note: string }): RepeatPart {
  if (!o.repeat || o.groupId) return { recur: null };
  const recur: RecurInput = { category: o.category, amount: o.amt, day: Number(o.date.slice(8, 10)), method: o.method, note: o.note };
  const problem = checkRecurInput(recur);
  return problem ? { problem } : { recur };
}

// How a list of payments can be ordered (version 1.27). The choice itself is kept on the phone (data/paymentSort.ts); this file is
// only the orders. Pure: no DOM, no storage.
import { byDate, myShare } from './logic.ts';
import type { Entry } from './logic.ts';

export const SORT_KEYS = ['date-desc', 'date-asc', 'amount-desc', 'amount-asc', 'category', 'added'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Newest day first, as people expect a list of payments to read. */
export const DEFAULT_SORT: SortKey = 'date-desc';

/** Anything that is not a known order (an empty or old or tampered value) is the default. */
export const parseSortKey = (v: unknown): SortKey => SORT_KEYS.find((k) => k === v) ?? DEFAULT_SORT;

const byDateNewest = (a: Entry, b: Entry): number => byDate(b, a); // the day paid, then when it was logged

/** The comparison for an order. Whatever the order, payments that tie come newest day first. */
export function comparePayments(key: SortKey, me: string | null): (a: Entry, b: Entry) => number {
  switch (key) {
    case 'date-asc': return byDate;
    case 'amount-desc': return (a, b) => myShare(b, me) - myShare(a, me) || byDateNewest(a, b);
    case 'amount-asc': return (a, b) => myShare(a, me) - myShare(b, me) || byDateNewest(a, b);
    case 'category': return (a, b) => a.category.localeCompare(b.category) || byDateNewest(a, b);
    case 'added': return (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || byDateNewest(a, b);
    default: return byDateNewest;
  }
}

/** A copy of the payments in the chosen order. */
export const sortPayments = (entries: readonly Entry[], key: SortKey, me: string | null): Entry[] =>
  entries.slice().sort(comparePayments(key, me));

// Search and filters behind the All payments sheet. Pure (no DOM, no storage) so the Node test runner can check them.
import { byDate, myShare } from './logic.ts';
import type { Entry } from './logic.ts';

// '' means "any" for month, category and method.
export interface PaymentFilter { q: string; month: string; category: string; method: string }
export const NO_FILTER: PaymentFilter = { q: '', month: '', category: '', method: '' };

export const isFiltered = (f: PaymentFilter): boolean => f.q.trim() !== '' || f.month !== '' || f.category !== '' || f.method !== '';

// What a search word is looked for in: the category, note, method, and the amount (your share and, for a shared expense, the
// total) written without commas or the rupee sign, so "4500" finds ₹4,500.
function haystack(e: Entry, me: string | null): string {
  return [e.category, e.note, e.method, String(myShare(e, me)), String(e.amount)].filter(Boolean).join(' ').toLowerCase();
}

// Newest day first. Every word of the search must be found (in any order); the month, category and method must match exactly
// (category without regard to case, as elsewhere in the app).
export function filterPayments(entries: Entry[], f: PaymentFilter, me: string | null): Entry[] {
  const words = f.q.toLowerCase().replace(/[₹,]/g, '').split(/\s+/).filter(Boolean);
  const cat = f.category.toLowerCase();
  return entries
    .filter((e) => (!f.month || e.entry_date.slice(0, 7) === f.month)
      && (!cat || e.category.toLowerCase() === cat)
      && (!f.method || e.method === f.method)
      && (words.length === 0 || words.every((w) => haystack(e, me).includes(w))))
    .sort((a, b) => byDate(b, a)); // by the day paid, then by when it was logged
}

export const paymentMonths = (entries: Entry[]): string[] =>
  [...new Set(entries.map((e) => e.entry_date.slice(0, 7)))].sort().reverse();

export function paymentCategories(entries: Entry[]): string[] {
  const seen = new Map<string, string>();
  for (const e of entries) if (!seen.has(e.category.toLowerCase())) seen.set(e.category.toLowerCase(), e.category);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export const totalShare = (entries: Entry[], me: string | null): number =>
  Math.round(entries.reduce((n, e) => n + myShare(e, me), 0) * 100) / 100;

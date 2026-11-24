// Small pure helpers of the Add expense form (the form itself is QuickLog.tsx).
import { catKey } from '../../core/logic.ts';

/** How many category chips the form shows; the rest are one tap away in "More categories". */
export const CHIP_CAP = 16;

/**
 * The categories as chips: the most used first (spelled as the person's own list spells them), then the rest in the list's order.
 * The chosen one is always among them, so a category picked from "More" shows as pressed.
 */
export function chipCategories(names: readonly string[], used: readonly string[], selected: string, cap: number = CHIP_CAP): string[] {
  const canonical = new Map(names.map((n) => [catKey(n), n]));
  const first = used.flatMap((u) => canonical.get(catKey(u)) ?? []);
  const all = [...new Set([...first, ...names])];
  const shown = all.slice(0, cap);
  const pick = selected && canonical.get(catKey(selected));
  return pick && !shown.includes(pick) ? [pick, ...shown.slice(0, cap - 1)] : shown;
}

/** The day before an ISO day (a calendar day, so a month or year end is handled). */
export function dayBefore(iso: string): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) - 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

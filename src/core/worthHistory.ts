// The net worth history (version 2.1): every update with how it moved, which ones look wrong, a range of time, the chart's points and
// labels, and the check before a typed figure is saved. The owner: "add a way to see the net-worth history; also i by mistake type a new number
// to 0, and there is no way to delete this invalid entry". Pure.
import type { NetUpdate } from './goals.ts';
import { addMonths } from './goals.ts';

export type HistoryRange = '6m' | '1y' | 'all';

export interface HistoryRow {
  u: NetUpdate;
  change: number | null; // from the update before it (null for the first one)
  odd: boolean; // looks wrong: see looksWrong
  before: NetUpdate | null; // the update before it, to say what it is far from
}

/**
 * An update looks wrong when it is ₹0 next to updates that are not, or when it is less than half or more than double both the update
 * before and the one after (a dip or a spike that came straight back): a typo far more often than a real day.
 */
export function looksWrong(value: number, before: number | undefined, after: number | undefined): boolean {
  const near = [before, after].filter((v): v is number => v !== undefined);
  if (value === 0) return near.some((v) => v !== 0);
  if (before === undefined || after === undefined || before <= 0 || after <= 0) return false;
  return value < Math.min(before, after) / 2 || value > Math.max(before, after) * 2;
}

/** The rows of the history, newest first (as netUpdates gives them). The first update ever is never flagged: there is nothing before it. */
export function historyRows(updates: readonly NetUpdate[]): HistoryRow[] {
  return updates.map((u, i) => {
    const before = updates[i + 1] ?? null; // older
    const after = updates[i - 1]; // newer
    return { u, before, change: before ? Math.round((u.a - before.a) * 100) / 100 : null, odd: before !== null && looksWrong(u.a, before.a, after?.a) };
  });
}

/** The updates within the range, ending today. */
export function inRange(updates: readonly NetUpdate[], range: HistoryRange, todayIso: string): NetUpdate[] {
  if (range === 'all') return updates.slice();
  const from = addMonths(todayIso, range === '6m' ? -6 : -12);
  return updates.filter((u) => u.d >= from);
}

export interface ChartData { pts: { x: number; y: number; id: string }[]; lo: number; hi: number }

const dayNumber = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/**
 * Points for a chart w by h (oldest on the left): across by day, up from the lowest figure (or ₹0, whichever is lower) to the highest.
 * pad keeps the dots off the edges. One update is a single dot in the middle.
 */
export function chartPoints(updatesNewestFirst: readonly NetUpdate[], w: number, h: number, pad = 8): ChartData {
  const old = updatesNewestFirst.slice().reverse();
  if (old.length === 0) return { pts: [], lo: 0, hi: 0 };
  const lo = Math.min(0, ...old.map((u) => u.a));
  const hi = Math.max(...old.map((u) => u.a));
  const first = dayNumber(old[0]!.d);
  const span = dayNumber(old.at(-1)!.d) - first;
  const x = (iso: string): number => (span === 0 ? w / 2 : pad + ((dayNumber(iso) - first) / span) * (w - 2 * pad));
  const y = (a: number): number => (hi === lo || old.length === 1 ? h / 2 : pad + (1 - (a - lo) / (hi - lo)) * (h - 2 * pad));
  return { pts: old.map((u) => ({ x: x(u.d), y: y(u.a), id: u.id })), lo, hi };
}

/** n days for the labels under the chart, evenly across the updates (oldest first); one when they all fall on one day. */
export function axisDays(updatesNewestFirst: readonly NetUpdate[], n = 4): string[] {
  if (updatesNewestFirst.length === 0) return [];
  const first = dayNumber(updatesNewestFirst.at(-1)!.d);
  const span = dayNumber(updatesNewestFirst[0]!.d) - first;
  if (span === 0) return [updatesNewestFirst[0]!.d];
  return Array.from({ length: n }, (_, i) => new Date((first + Math.round((span * i) / (n - 1))) * 86_400_000).toISOString().slice(0, 10));
}

/** Before a typed figure is saved: ₹0 after a figure that was not, or less than half / more than double the last one, is asked about. */
export function typedCheck(value: number, last: number | null): 'zero' | 'jump' | null {
  if (last === null) return null;
  if (value === 0) return last === 0 ? null : 'zero';
  if (last > 0 && (value < last / 2 || value > last * 2)) return 'jump';
  return null;
}

/** A short amount for the chart's scale: ₹6L, ₹1.2Cr, ₹45k, ₹800 (and a minus sign below zero). */
export function compactINR(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const one = (x: number): string => String(Math.round(x * 10) / 10);
  if (a >= 1e7) return `${sign}₹${one(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${one(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${one(a / 1e3)}k`;
  return `${sign}₹${Math.round(a)}`;
}

// "Safe to spend" (version 1.32): what is left of this month's budget, after what is still to come, spread over the days that remain.
// Only a figure to steer by; it assumes nothing about what the person will really spend. Pure.
import { daysInMonth, round2 } from './logic.ts';

export interface SafeToSpend { perDay: number; left: number; upcoming: number; daysLeft: number }

/**
 * `budget` the month's budget, `spent` what has gone out, `upcoming` what is still due this month (recurring payments and dated one-off
 * items not yet paid). The days left count today. null when there is no budget, or no day is left to spend in.
 */
export function safeToSpend(budget: number, spent: number, upcoming: number, todayIso: string): SafeToSpend | null {
  if (!(budget > 0)) return null;
  const month = todayIso.slice(0, 7);
  const daysLeft = daysInMonth(month) - Number(todayIso.slice(8, 10)) + 1;
  if (daysLeft < 1) return null;
  const left = round2(budget - spent - upcoming);
  return { perDay: Math.max(0, Math.floor(left / daysLeft)), left, upcoming: round2(upcoming), daysLeft };
}

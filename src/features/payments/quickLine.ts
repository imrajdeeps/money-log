// One-line entry (version 1.32): type "450 swiggy upi" and the amount, the note, the method and a category are worked out for a last look.
// Nothing is saved from here: the form is filled in, and Save is still the person's tap. Pure.
import { suggestCategory } from './smsParse.ts';
import { dayBefore } from './quickLog.ts';
import { parseAmount } from '../../core/logic.ts';
import type { Method } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';

export interface QuickLine { amount: number; note: string; method: Method | null; category: string | null; date: string | null }
export type QuickResult = { ok: true; line: QuickLine } | { ok: false; problem: string };

const METHOD_WORDS: [RegExp, Method][] = [
  [/^(upi|gpay|googlepay|phonepe|paytm|bhim)$/i, 'UPI'],
  [/^(card|credit|debit|creditcard|debitcard)$/i, 'Card'],
  [/^cash$/i, 'Cash'],
];
const AMOUNT = /^(?:₹|rs\.?|inr)?(\d[\d,]*(?:\.\d{1,2})?)(k|l|lac|lakh)?$/i;
const MULTIPLIER: Record<string, number> = { k: 1000, l: 100000, lac: 100000, lakh: 100000 };

/** The first word that reads as an amount ("450", "1,200", "₹450", "1.5k", "2l"), as a number; null when there is none or it is not a good amount. */
function amountOf(words: readonly string[]): { index: number; amount: number } | { index: number; bad: true } | null {
  for (let i = 0; i < words.length; i++) {
    const m = AMOUNT.exec(words[i]!);
    if (!m) continue;
    const mult = m[2] ? (MULTIPLIER[m[2].toLowerCase()] ?? 1) : 1;
    const n = Math.round(Number(m[1]!.replace(/,/g, '')) * mult * 100) / 100;
    const ok = parseAmount(String(n));
    return ok === null ? { index: i, bad: true } : { index: i, amount: ok };
  }
  return null;
}

/**
 * "450 swiggy upi", "swiggy 450", "1.5k rent yesterday": the amount is the first number; "upi", "gpay", "card", "cash" set the method;
 * "yesterday" and "today" set the day; what is left is the note, and the category is suggested from it the way a pasted bank message does.
 */
export function parseQuickLine(
  raw: string, todayIso: string,
  entries: Parameters<typeof suggestCategory>[1], categories: Parameters<typeof suggestCategory>[2],
): QuickResult {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { ok: false, problem: tr('Type the amount first, like 450 swiggy upi.') };
  const found = amountOf(words);
  if (!found) return { ok: false, problem: tr('Type the amount first, like 450 swiggy upi.') };
  if ('bad' in found) return { ok: false, problem: tr('The amount must be above zero, with at most 2 decimals.') };
  let method: Method | null = null;
  let date: string | null = null;
  const rest: string[] = [];
  words.forEach((w, i) => {
    if (i === found.index) return;
    const hit = METHOD_WORDS.find(([re]) => re.test(w));
    if (hit && method === null) { method = hit[1]; return; }
    if (/^yesterday$/i.test(w) && date === null) { date = dayBefore(todayIso); return; }
    if (/^today$/i.test(w)) return;
    rest.push(w);
  });
  const note = rest.join(' ').slice(0, 200);
  return { ok: true, line: { amount: found.amount, note, method, category: note ? suggestCategory(note, entries, categories) : null, date } };
}

// Several pasted bank messages at once (version 1.32): split them, read each one, and say which look like ones already saved.
// Nothing is saved from here: the person ticks the ones that are right. Pure.
import { alreadyAdded, noteFor, parseMessage, suggestCategory } from './smsParse.ts';
import type { ParsedMessage } from './smsParse.ts';

export const MAX_BATCH = 30;

export interface BatchRow {
  key: string;
  text: string;
  payment: ParsedMessage | null;
  problem: string | null;
  category: string | null; // the suggested category (the person can change it)
  duplicate: boolean; // a saved payment, or an earlier message in this list, has the same reference
  note: string;
}

const looksLikePayment = (s: string): boolean => /(?:₹|\brs\.?|\binr)\s*\d/i.test(s);

/** The messages in a paste: separated by a blank line, or else one per line when every non-empty line is a payment. */
export function splitMessages(text: string): string[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
  if (blocks.length > 1) return blocks.slice(0, MAX_BATCH);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length > 1 && lines.every(looksLikePayment) ? lines.slice(0, MAX_BATCH) : blocks.slice(0, MAX_BATCH);
}

export function readBatch(
  text: string, todayIso: string,
  entries: Parameters<typeof suggestCategory>[1] & Parameters<typeof alreadyAdded>[0],
  categories: Parameters<typeof suggestCategory>[2],
): BatchRow[] {
  const seen = new Set<string>();
  return splitMessages(text).map((t, i) => {
    const r = parseMessage(t, todayIso);
    if (!r.ok) return { key: String(i), text: t, payment: null, problem: r.problem, category: null, duplicate: false, note: '' };
    const p = r.payment;
    const dupe = (p.ref !== null && seen.has(p.ref)) || alreadyAdded(entries, p.ref);
    if (p.ref !== null) seen.add(p.ref);
    const category = p.kind === 'in' ? p.incomeCategory : suggestCategory(p.merchant, entries, categories);
    return { key: String(i), text: t, payment: p, problem: null, category, duplicate: dupe, note: noteFor(p) };
  });
}

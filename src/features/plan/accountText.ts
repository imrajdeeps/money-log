// The words around an account (version 2.3, from the design): the line under it in the list, what moves it, and each payment's line on its
// page. Kept apart from the components so they stay short.
import type { AccountSettings, Flow, Worked } from '../../core/accounts.ts';
import { shortDate } from '../../core/format.ts';
import type { WorthItem } from '../../core/goals.ts';
import { fmtINR } from '../../core/logic.ts';
import type { Method } from '../../core/logic.ts';
import { classLabel } from '../../core/worth.ts';
import { tr } from '../../core/i18n.ts';

/** A way of paying, in words. */
export function methodName(m: Method): string {
  if (m === 'UPI') return tr('UPI');
  if (m === 'Card') return tr('card');
  if (m === 'Cash') return tr('cash');
  return tr('other ways of paying');
}

const joinAnd = (parts: string[]): string => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${tr('and')} ${parts.at(-1)}`);

/** "moved by UPI, card and money you receive": what moves an account, for the line under its name on its page. */
export function movedBy(s: AccountSettings): string {
  const parts = s.pay.map(methodName);
  if (s.inc) parts.push(tr('money you receive'));
  if (s.cat.length > 0) parts.push(s.cat.join(', '));
  if (s.mk) return parts.length ? tr('your market value at the check-in, and {0}', joinAnd(parts)) : tr('your market value at the check-in');
  if (s.ir > 0) parts.push(tr('{0}% a year', s.ir));
  return parts.length ? tr('moved by {0}', joinAnd(parts)) : tr('nothing moves it yet');
}

/** The line under an account in the list, and its tag. */
export function accountLine(it: WorthItem, s: AccountSettings, w: Worked | undefined): { text: string; tag: 'estimated' | 'check' } {
  const kind = classLabel(it.s, it.c);
  const since = shortDate(w?.since ?? it.d);
  if (s.mk) return { text: `${kind} · ${w && w.inflow > 0 ? tr('+{0} put in, value from {1}', fmtINR(w.inflow), since) : tr('value from {0}', since)}`, tag: 'check' };
  if (it.s === 'd') return { text: `${kind} · ${tr('{0} spent, {1} paid off', fmtINR(w?.inflow ?? 0), fmtINR(w?.outflow ?? 0))}`, tag: 'estimated' };
  if (s.ir > 0) return { text: `${kind} · ${w && w.inflow > 0 ? tr('+{0} added, {1}% a year', fmtINR(w.inflow), s.ir) : tr('{0}% a year', s.ir)}`, tag: 'estimated' };
  return { text: `${kind} · ${paymentsSince(w?.flows.length ?? 0, since)}`, tag: 'estimated' };
}

function paymentsSince(count: number, since: string): string {
  if (count === 0) return tr('no payments since {0}', since);
  return count === 1 ? tr('1 payment since {0}', since) : tr('{0} payments since {1}', count, since);
}

/** The line under one payment on an account's page. */
export function flowLine(f: Flow, names: ReadonlyMap<string, string>): string {
  if (f.kind === 'in') return tr('money received');
  if (f.kind === 'spent') return tr('spent');
  if (f.kind === 'settled') return tr('with a friend, not spending');
  const other = f.with ? names.get(f.with) : undefined;
  if (f.kind === 'moved-out') return other ? tr('moved to {0}', other) : tr('moved to another account');
  return other ? tr('moved from {0}', other) : tr('moved in');
}

/** "+₹1,40,000" / "−₹5,000" */
export const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${fmtINR(Math.abs(n))}`;

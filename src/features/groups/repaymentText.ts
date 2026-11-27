// The words around Simplify repayments (version 2.1): how many payments, what a pair's payment is for, and why a simplified payment of
// yours is what it is. Whole sentences, so each language can order the words its own way.
import { fmtINR } from '../../core/logic.ts';
import type { Debt } from '../../core/groups.ts';
import { partsSummary } from '../../core/repayments.ts';
import type { MyWhy, PairDebt } from '../../core/repayments.ts';
import { tr } from '../../core/i18n.ts';

export const paymentsText = (n: number): string => (n === 1 ? tr('1 payment') : tr('{0} payments', n));

// "Wi-Fi, Gas and Water": up to three names; more is "Wi-Fi, Gas and 4 more"
function joinNames(names: readonly string[]): string {
  if (names.length > 3) return tr('{0} and {1} more', names.slice(0, 2).join(', '), names.length - 2);
  if (names.length < 2) return names.join('');
  return tr('{0} and {1}', names.slice(0, -1).join(', '), names.at(-1)!);
}

/** What a pair's payment is for: "Wi-Fi, Gas and Water ₹1,132, less Electricity ₹400". */
export function pairLine(d: PairDebt): string {
  const o = partsSummary(d.owes);
  const l = partsSummary(d.less);
  const parts: string[] = [];
  if (o.names.length > 0) parts.push(`${joinNames(o.names)} ${fmtINR(o.expenses)}`);
  if (o.paidBack > 0) parts.push(tr('{0} paid the other way', fmtINR(o.paidBack)));
  if (l.names.length > 0) parts.push(tr('less {0}', `${joinNames(l.names)} ${fmtINR(l.expenses)}`));
  if (l.paidBack > 0) parts.push(tr('less {0} already paid', fmtINR(l.paidBack)));
  return parts.join(', ');
}

const plus = (items: readonly string[]): string => items.reduce((a, b) => tr('{0}, plus {1}', a, b));

/** "₹732 you owe Aakash, plus ₹160 you owe Meera." / "Simplified, you pay the same ₹892 in all: ₹892 to Aakash." */
export function whyLines(w: MyWhy, me: string, nameOf: (uid: string) => string): string[] {
  const owe = w.pairs.filter((d) => d.from === me).map((d) => tr('{0} you owe {1}', fmtINR(d.amount), nameOf(d.to)));
  const owed = w.pairs.filter((d) => d.to === me).map((d) => tr('{0} owes you {1}', nameOf(d.from), fmtINR(d.amount)));
  const lines: string[] = [];
  if (owe.length > 0) lines.push(`${plus(owe)}.`);
  if (owed.length > 0) lines.push(`${plus(owed)}.`);
  const sum = w.simplified.reduce((n, d) => n + d.amount, 0);
  const pays = w.simplified.some((d: Debt) => d.from === me);
  const list = w.simplified.map((d) => (d.from === me ? tr('{0} to {1}', fmtINR(d.amount), nameOf(d.to)) : tr('{0} from {1}', fmtINR(d.amount), nameOf(d.from)))).join(', ');
  lines.push(pays ? tr('Simplified, you pay the same {0} in all: {1}.', fmtINR(sum), list) : tr('Simplified, you get the same {0} in all: {1}.', fmtINR(sum), list));
  return lines;
}

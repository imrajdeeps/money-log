// What a Couple group does differently: one line for the balance, and four ways to say who paid and who owes (instead of
// the full split editor). Pure helpers, no DOM, no storage, no network, so the browser and the Node test runner share it.
import { fmtINR } from './logic.ts';
import { equalShares, fromPaise } from './groups.ts';
import { tr } from './i18n.ts';

// me or the partner paid; and the cost is shared 50/50 or is all the other person's.
export type CoupleChoice = 'meHalf' | 'meAll' | 'themHalf' | 'themAll';
export const COUPLE_CHOICES: CoupleChoice[] = ['meHalf', 'meAll', 'themHalf', 'themAll'];

export const coupleLabel = (c: CoupleChoice, partner: string): string =>
  c === 'meHalf' ? tr('You paid · 50/50') : c === 'meAll' ? tr('You paid · {0} owes all', partner) : c === 'themHalf' ? tr('{0} paid · 50/50', partner) : tr('{0} paid · you owe all', partner);

// The split state (who paid, who shares in it) a choice stands for. Equal split among the people included.
export function coupleSetting(c: CoupleChoice, me: string, partner: string): { paidBy: string; included: string[] } {
  if (c === 'meHalf') return { paidBy: me, included: [me, partner] };
  if (c === 'meAll') return { paidBy: me, included: [partner] };
  if (c === 'themHalf') return { paidBy: partner, included: [me, partner] };
  return { paidBy: partner, included: [me] };
}

// Which choice the current split state is, or null when it is something else (an expense edited elsewhere).
export function coupleChoiceOf(paidBy: string, included: string[], me: string, partner: string): CoupleChoice | null {
  return COUPLE_CHOICES.find((c) => {
    const s = coupleSetting(c, me, partner);
    return s.paidBy === paidBy && s.included.length === included.length && s.included.every((id) => included.includes(id));
  }) ?? null;
}

// The line the two of them care about. myPaise > 0: the partner owes me.
export function coupleLine(myPaise: number, partner: string): { text: string; tone: 'owed' | 'late' | 'muted' } {
  if (myPaise === 0) return { text: tr('You and {0} are all settled', partner), tone: 'muted' };
  return myPaise > 0
    ? { text: tr('{0} owes you {1}', partner, fmtINR(fromPaise(myPaise))), tone: 'owed' }
    : { text: tr('You owe {0} {1}', partner, fmtINR(fromPaise(-myPaise))), tone: 'late' };
}

// What the choice means for this amount, in words: "Priya owes you ₹250".
export function coupleSummary(c: CoupleChoice, total: number, me: string, partner: string, partnerName: string): string {
  if (!(total > 0)) return '';
  const { paidBy, included } = coupleSetting(c, me, partner);
  const shares = equalShares(total, included);
  return paidBy === me
    ? tr('{0} owes you {1}', partnerName, fmtINR(shares[partner] ?? 0))
    : tr('You owe {0} {1}', partnerName, fmtINR(shares[me] ?? 0));
}

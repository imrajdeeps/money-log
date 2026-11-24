// What a shared expense means for one person, for the group's history: green where they are owed (they paid, the others owe their
// shares) and red where they owe (someone else paid and they have a share). An expense they have no part in is neither.
import type { Entry } from './logic.ts';
import { fromPaise, toPaise } from './groups.ts';

export interface Effect { side: 'owed' | 'owe' | 'none'; amount: number }
const NONE: Effect = { side: 'none', amount: 0 };

export function expenseEffect(e: Pick<Entry, 'amount' | 'paid_by' | 'shares'>, me: string | null): Effect {
  if (!me) return NONE;
  const mine = toPaise(e.shares?.[me] ?? 0);
  if (e.paid_by === me) {
    const owedToMe = toPaise(e.amount) - mine; // what the others owe for it
    return owedToMe > 0 ? { side: 'owed', amount: fromPaise(owedToMe) } : NONE;
  }
  return mine > 0 ? { side: 'owe', amount: fromPaise(mine) } : NONE;
}

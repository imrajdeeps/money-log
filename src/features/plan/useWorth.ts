import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { accountEntries, cashMoves, isWorkedOut, workAccounts } from '../../core/accounts.ts';
import type { Worked } from '../../core/accounts.ts';
import { isoDate } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import { worthSummary } from '../../core/worth.ts';
import type { AutoLine, WorthSummary } from '../../core/worth.ts';
import { useAutoLines } from './useAutoLines.ts';

export interface WorthView {
  today: string;
  workedOut: boolean; // 2.3: worked out from accounts (at least one item set up)
  auto: AutoLine[];
  entries: Entry[]; // the payments that move the accounts
  worked: Record<string, Worked>; // each account's worked-out figure (empty when kept by hand)
  summary: WorthSummary;
}

/** Net worth as it stands now, for every part of the Plan page: the automatic lines, the accounts worked out, and the totals. */
export function useWorth(): WorthView {
  const app = useApp();
  const today = isoDate();
  const workedOut = useMemo(() => isWorkedOut(app.goals), [app.goals]);
  const auto = useAutoLines(workedOut);
  const entries = useMemo(() => accountEntries(app.entries, app.groupEntries, app.me), [app.entries, app.groupEntries, app.me]);
  const worked = useMemo(() => (workedOut ? workAccounts(app.goals, entries, app.me, today, cashMoves(app.settlements, app.goals, app.me)) : {}), [workedOut, app.goals, entries, app.settlements, app.me, today]);
  const summary = useMemo(() => worthSummary(app.goals, today, auto, worked), [app.goals, today, auto, worked]);
  return { today, workedOut, auto, entries, worked, summary };
}

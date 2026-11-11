import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { useLastBackup } from '../../data/useLastBackup.ts';
import { planForMonth } from '../../core/categories.ts';
import { activeGoals, goalLine, goalProgress, netNow } from '../../core/goals.ts';
import { activeMembers, fromPaise, groupBalances } from '../../core/groups.ts';
import { buildNotices } from '../../core/notifications.ts';
import type { Notice, NoticeInput } from '../../core/notifications.ts';
import { budgetEntries, isoDate, monthOf, summarizeMonth } from '../../core/logic.ts';
import { recurringThisMonth } from '../../core/recurring.ts';

// The notifications to show now. Worked out from what the phone already holds, again whenever that changes or the day does.
export function useNotices(): Notice[] {
  const app = useApp();
  const lastBackup = useLastBackup();
  const today = isoDate();
  const { dueItems, recurring, entries, me, mine, goals, groups, members, groupEntries, settlements, sync, noticeKinds, dismissed, sessions } = app;
  return useMemo(() => {
    const own = budgetEntries(entries, me);
    const month = monthOf(today);
    const input: NoticeInput = {
      today,
      nowMs: Date.now(),
      dueItems,
      recurring: recurringThisMonth(recurring, today),
      budgetRows: summarizeMonth(own, planForMonth(mine, month), month).rows,
      goals: activeGoals(goals).map((goal) => {
        const progress = goalProgress(goal, goals, own);
        return { goal, progress, line: goalLine(goal, progress, today) };
      }),
      groups: groups
        .filter((g) => activeMembers(members, g.id).length >= 2)
        .map((g) => ({ id: g.id, name: g.name, balance: me ? fromPaise(groupBalances(g.id, groupEntries, settlements)[me] ?? 0) : 0 })),
      netWorth: netNow(goals),
      lastBackupMs: lastBackup,
      hasPayments: entries.length > 0,
      sync: { mode: sync.mode, pending: sync.pending, lastSync: sync.lastSync, error: sync.error },
      sessions,
    };
    return buildNotices(input, noticeKinds, dismissed);
  }, [today, dueItems, recurring, entries, me, mine, goals, groups, members, groupEntries, settlements, sync, lastBackup, noticeKinds, dismissed, sessions]);
}

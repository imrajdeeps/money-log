import { useMemo } from 'react';
import { useApp } from './context.tsx';
import { shareEntries } from '../core/groupShares.ts';
import type { Entry } from '../core/logic.ts';
import { shareSwitches } from './phonePrefs.ts';

/**
 * The entries every sum of spending is built from (month, budgets, goals, insights, cash flow, notifications): the person's own payments,
 * plus their share of what others added in groups where "count my share" is on (see core/groupShares.ts). Lists of payments use
 * `app.entries`, which stays exactly what was saved.
 */
export function useSpendEntries(): Entry[] {
  const app = useApp();
  const sw = shareSwitches.use();
  return useMemo(() => {
    const extra = shareEntries(app.groupEntries, app.entries, app.groups, sw, app.me);
    return extra.length === 0 ? app.entries : [...app.entries, ...extra];
  }, [app.entries, app.groupEntries, app.groups, sw, app.me]);
}

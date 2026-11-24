import { useEffect, useMemo } from 'react';
import { useApp } from './context.tsx';
import { shareEntries } from '../core/groupShares.ts';
import { isoDate } from '../core/logic.ts';
import type { Entry } from '../core/logic.ts';
import { shareSwitches, sharesFrom } from './phonePrefs.ts';

/**
 * The entries every sum of spending is built from (month, budgets, goals, insights, cash flow, notifications): the person's own payments,
 * plus their share of what others added in groups where "count my share" is on, from the day it started (see core/groupShares.ts). Lists
 * of payments use `app.entries`, which stays exactly what was saved.
 */
export function useSpendEntries(): Entry[] {
  const app = useApp();
  const sw = shareSwitches.use();
  const stored = sharesFrom.use();
  const today = isoDate();
  // the first time this runs, counting by default starts today: nothing already in the past changes by itself
  useEffect(() => { if (!sharesFrom.load()) sharesFrom.save(isoDate()); }, []);
  const defaultFrom = stored || today;
  return useMemo(() => {
    const extra = shareEntries(app.groupEntries, app.entries, app.groups, sw, app.me, defaultFrom);
    return extra.length === 0 ? app.entries : [...app.entries, ...extra];
  }, [app.entries, app.groupEntries, app.groups, sw, app.me, defaultFrom]);
}

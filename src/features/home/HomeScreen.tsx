import { useMemo } from 'react';
import { SyncPill } from '../../ui/SyncPill.tsx';
import { useApp } from '../../data/context.tsx';
import { udhaarTotals } from '../../core/udhaar.ts';
import { safeToSpend } from '../../core/safeToSpend.ts';
import { WeekRecapCard } from './WeekRecapCard.tsx';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { BentoGrid } from '../../ui/Bento.tsx';
import { MonthTile } from './MonthTile.tsx';
import { CashFlowTile, CategoryGroupTile, CoupleTile, DueTile, GoalsTile, GroupsTile, InsightsTile, NetWorthTile, RecentTile, UdhaarTile, WhereItWentTile } from './Tiles.tsx';
import { RecurringTile } from '../recurring/index.ts';
import { netNow } from '../../core/goals.ts';
import type { NetUpdate } from '../../core/goals.ts';
import { planForMonth } from '../../core/categories.ts';
import { cashFlow } from '../../core/income.ts';
import { coupleTiles, dueOverview, nearestGoal, groupsOverview, monthOverview, overviewGroups, topCategories, upcomingThisMonth } from './dashboard.ts';
import { monthLabel } from '../../core/format.ts';
import { averageOf, groupLookup, monthlyTotals, monthsEnding, projectedMonthEnd } from '../../core/analytics.ts';
import type { Group } from '../../core/logic.ts';
import { budgetEntries, isoDate, monthOf, shiftMonth } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The pages a tile can open (App.tsx owns them; each has its own address).
export type Section = 'payments' | 'month' | 'plan' | 'groups' | 'goals' | 'analytics' | 'cashflow' | 'circle' | 'udhaar' | 'notifications';

interface Props {
  open: (s: Section, anchor?: string) => void;
  openMonth: (group?: Group) => void; // the Month page, for one group's categories or for all
  openGroup: (id: string) => void; // one group's page
  openAdd: () => void;
  openAddIncome: () => void; // Add, opened on Received
  goSettings: () => void;
  openAccount: () => void; // the sync pill on a phone sits here, beside the month (version 2.0): the top bar has no room for it
}

/** Fewer payments than this and the Overview shows only what is useful on day one. */
export const GETTING_STARTED = 5;


// The surface layer: one figure or picture per tile, every tile a door to its details. Everything shown is worked out from
// what the app already holds; there is no tile for figures the app does not record.
export function HomeScreen({ open, openMonth, openGroup, openAdd, openAddIncome, goSettings, openAccount }: Props) {
  const app = useApp();
  const today = isoDate();
  const month = monthOf(today);
  const spend = useSpendEntries(); // your own payments, plus your share of friends' group expenses where that counts
  const ov = useMemo(() => monthOverview(
    spend, app.me, planForMonth(app.mine, month), planForMonth(app.mine, shiftMonth(month, -1)), today,
  ), [spend, app.me, app.mine, month, today]);
  const cats = useMemo(() => topCategories(ov.summary), [ov]);
  const due = useMemo(() => dueOverview(app.dueItems, today), [app.dueItems, today]);
  const net = useMemo(() => netNow(app.goals), [app.goals]);
  // two more of the snapshot's figures for context; the Plan sheet lists them all
  const shared = useMemo(() => groupsOverview(app.groups, app.groupEntries, app.settlements, app.me), [app.groups, app.groupEntries, app.settlements, app.me]);
  const couples = useMemo(() => coupleTiles(app.groups, app.members, app.groupEntries, app.settlements, app.me), [app.groups, app.members, app.groupEntries, app.settlements, app.me]);
  const goalTile = useMemo(() => nearestGoal(app.goals, budgetEntries(spend, app.me), today), [app.goals, spend, app.me, today]);

  const flow = useMemo(() => cashFlow(spend, app.me, groupLookup(app.categories), month), [spend, app.me, app.categories, month]);

  // Getting started (fewer than five payments logged): tiles that would only show an empty invitation stay out of the way. They come
  // by themselves once there is something to show, and every page is still one tap away in the menu.
  const starting = app.entries.length < GETTING_STARTED;
  const udhaar = useMemo(() => udhaarTotals(app.goals), [app.goals]);
  // what is safe to spend each day for the rest of the month, once there is a budget (after what is still to come this month)
  const safe = useMemo(
    () => (ov.budgeted ? safeToSpend(ov.budget, ov.spent, upcomingThisMonth(app.dueItems, app.recurring, today, groupLookup(app.categories)), today) : null),
    [ov.budgeted, ov.budget, ov.spent, app.dueItems, app.recurring, app.categories, today],
  );
  const tiles = overviewGroups(ov.summary.groups, starting);
  const projected = projectedMonthEnd(ov.daily, month, ov.lastDaily); // where the month ends at this pace, once there are days enough to say
  // a usual month: the average of the three months before this one that had any spending
  const usual = useMemo(() => {
    const prev = monthlyTotals(budgetEntries(spend, app.me), groupLookup(app.categories), monthsEnding(shiftMonth(month, -1), 3));
    return averageOf(prev.filter((t) => t.spent > 0).map((t) => t.spent));
  }, [spend, app.me, app.categories, month]);
  // The net worth's updates, oldest first, for the tile's little line (the last six).
  const netHistory = useMemo(() => Object.values(app.goals).filter((g): g is NetUpdate => g.k === 'n' && !g.x).sort((a, b) => a.d.localeCompare(b.d)).slice(-6).map((g) => g.a), [app.goals]);
  // The design's three states: no payments at all, getting started (a few), and the whole Overview.
  const state = app.entries.length === 0 ? 'empty' : starting ? 'getting' : 'full';
  const full = state === 'full';

  return (
    <section aria-labelledby="home-title">
      <div className={ui.pageHead}>
        <div><h2 id="home-title">{tr('Overview')}</h2><p className="text-muted text-[14px]">{monthLabel(month)}</p></div>
        <span className="lg:hidden"><SyncPill onOpenSettings={openAccount} /></span>
      </div>
      <BentoGrid>
        <MonthTile state={state} ov={ov} safe={safe} projected={projected} month={month} count={app.entries.length} onOpen={() => open('month')} openAdd={openAdd} openBudgets={() => openMonth()} />
        {full && <WeekRecapCard />}
        {full && <NetWorthTile net={net} history={netHistory} open={open} />}
        {full && tiles.map((g) => <CategoryGroupTile key={g} g={g} ov={ov} openMonth={openMonth} />)}
        {full && <RecurringTile />}
        <RecentTile open={open} tall={full} />
        {full && <DueTile due={due} open={open} />}
        {full && <CashFlowTile flow={flow} open={open} openAddIncome={openAddIncome} />}
        {full && <InsightsTile usual={usual} projected={projected} ov={ov} open={open} />}
        {full && <WhereItWentTile cats={cats} open={open} openAdd={openAdd} />}
        {full && couples.map((c) => <CoupleTile key={c.id} c={c} openGroup={openGroup} />)}
        <GroupsTile shared={shared} open={open} goSettings={goSettings} half={full} />
        {full && <GoalsTile goal={goalTile} open={open} />}
        {full && <UdhaarTile totals={udhaar} hasEntries={app.udhaar.length > 0} open={open} />}
      </BentoGrid>
    </section>
  );
}

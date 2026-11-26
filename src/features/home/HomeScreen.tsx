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
  manageRecurring: () => void;
}

/** Fewer payments than this and the Overview shows only what is useful on day one. */
export const GETTING_STARTED = 5;


// The surface layer: one figure or picture per tile, every tile a door to its details. Everything shown is worked out from
// what the app already holds; there is no tile for figures the app does not record.
export function HomeScreen({ open, openMonth, openGroup, openAdd, openAddIncome, goSettings, openAccount, manageRecurring }: Props) {
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
  const tileSpan = (12 / Math.max(1, tiles.length)) as 3 | 4 | 6 | 12;

  const projected = projectedMonthEnd(ov.daily, month, ov.lastDaily); // where the month ends at this pace, once there are days enough to say
  // a usual month: the average of the three months before this one that had any spending
  const usual = useMemo(() => {
    const prev = monthlyTotals(budgetEntries(spend, app.me), groupLookup(app.categories), monthsEnding(shiftMonth(month, -1), 3));
    return averageOf(prev.filter((t) => t.spent > 0).map((t) => t.spent));
  }, [spend, app.me, app.categories, month]);
  // which tiles are drawn: one with nothing to say yet stays out of the way while the person is getting started
  const showNet = Boolean(net) || !starting;
  const showDue = Boolean(due) || !starting;
  const showGoals = Boolean(goalTile) || !starting;
  const showUdhaar = app.udhaar.length > 0 || !starting;
  const showFlow = !starting || flow.income > 0;
  const showInsights = !starting || usual > 0;
  const showWhere = !starting || cats.total > 0;

  return (
    <section aria-labelledby="home-title">
      <div className={ui.pageHead}>
        <div><h2 id="home-title">{tr('Overview')}</h2><p className="text-muted">{monthLabel(month)}</p></div>
        <span className="lg:hidden"><SyncPill onOpenSettings={openAccount} /></span>
      </div>
      <BentoGrid>
        <MonthTile ov={ov} safe={safe} projected={projected} month={month} onOpen={() => open('month')} openAdd={openAdd} />

        <WeekRecapCard />

        {showNet && <NetWorthTile net={net} open={open} />}

        {tiles.map((g, i) => <CategoryGroupTile key={g} g={g} ov={ov} span={tileSpan} fill={tiles.length % 2 === 1 && i === tiles.length - 1} openMonth={openMonth} />)}

        <RecurringTile onManage={manageRecurring} />

        <RecentTile open={open} openAdd={openAdd} />

        {showDue && <DueTile due={due} open={open} />}

        {showFlow && <CashFlowTile flow={flow} open={open} openAddIncome={openAddIncome} />}

        {showInsights && <InsightsTile usual={usual} projected={projected} ov={ov} open={open} />}

        {showWhere && <WhereItWentTile cats={cats} open={open} openAdd={openAdd} />}

        {couples.map((c) => <CoupleTile key={c.id} c={c} openGroup={openGroup} />)}

        <GroupsTile shared={shared} open={open} goSettings={goSettings} />

        {showGoals && <GoalsTile goal={goalTile} open={open} />}

        {showUdhaar && <UdhaarTile totals={udhaar} hasEntries={app.udhaar.length > 0} open={open} />}

      </BentoGrid>
    </section>
  );
}

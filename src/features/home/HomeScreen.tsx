import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { SyncPill } from '../../ui/SyncPill.tsx';
import { useApp } from '../../data/context.tsx';
import { udhaarTotals } from '../../core/udhaar.ts';
import { safeToSpend } from '../../core/safeToSpend.ts';
import { useWeekRecap, WeekRecapCard } from './WeekRecapCard.tsx';
import type { WeekRecap } from '../../core/weekRecap.ts';
import { activeRecurring } from '../../core/recurring.ts';
import { packTiles } from '../../core/bento.ts';
import type { TileSize } from '../../core/bento.ts';
import type { Feature } from '../../core/features.ts';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { BentoGrid, TileSpan } from '../../ui/Bento.tsx';
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
  // (items on the due list count only while Plan, where they live, is on: a hidden list would be an unexplained number)
  const planOn = app.features.has('plan');
  const safe = useMemo(
    () => (ov.budgeted ? safeToSpend(ov.budget, ov.spent, upcomingThisMonth(planOn ? app.dueItems : [], app.recurring, today, groupLookup(app.categories)), today) : null),
    [ov.budgeted, ov.budget, ov.spent, planOn, app.dueItems, app.recurring, app.categories, today],
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
  const recap = useWeekRecap();
  const hasRecurring = useMemo(() => activeRecurring(app.recurring).length > 0, [app.recurring]);

  const monthTile = <MonthTile state={state} ov={ov} safe={safe} projected={projected} month={month} count={app.entries.length} onOpen={() => open('month')} openAdd={openAdd} openBudgets={() => openMonth()} />;
  const data: TileData = {
    monthTile, recap, hasRecurring, net, netHistory, tiles, ov, due, flow, usual, projected, cats, couples, shared, goalTile, udhaar,
    hasUdhaar: app.udhaar.length > 0, open, openMonth, openGroup, openAdd, openAddIncome, goSettings,
  };
  // a tile of a part that is turned off (Settings, Features) is left out
  const specs = (state === 'full' ? fullTiles(data) : startTiles(data)).filter((s) => !s.needs || app.features.has(s.needs));
  // each tile's wide-screen width and place, so every row is full there (version 2.0.1); the page itself keeps the design's order
  const places = new Map(packTiles(specs).map((p, order) => [p.id, { span: p.span, order }]));

  return (
    <section aria-labelledby="home-title">
      <div className={ui.pageHead}>
        <div><h2 id="home-title">{tr('Overview')}</h2><p className="text-muted text-[14px]">{monthLabel(month)}</p></div>
        <span className="lg:hidden"><SyncPill onOpenSettings={openAccount} /></span>
      </div>
      <BentoGrid packed>
        {specs.map((s) => <TileSpan.Provider key={s.id} value={places.get(s.id) ?? null}>{s.node}</TileSpan.Provider>)}
      </BentoGrid>
    </section>
  );
}

interface TileSpec extends TileSize { node: ReactNode; needs?: Feature } // needs: the part (Settings, Features) the tile belongs to

interface TileData {
  monthTile: ReactNode;
  recap: WeekRecap | null;
  hasRecurring: boolean;
  net: ReturnType<typeof netNow>;
  netHistory: number[];
  tiles: Group[];
  ov: ReturnType<typeof monthOverview>;
  due: ReturnType<typeof dueOverview>;
  flow: ReturnType<typeof cashFlow>;
  usual: number;
  projected: number | null;
  cats: ReturnType<typeof topCategories>;
  couples: ReturnType<typeof coupleTiles>;
  shared: ReturnType<typeof groupsOverview>;
  goalTile: ReturnType<typeof nearestGoal>;
  udhaar: ReturnType<typeof udhaarTotals>;
  hasUdhaar: boolean;
  open: Props['open'];
  openMonth: Props['openMonth'];
  openGroup: Props['openGroup'];
  openAdd: () => void;
  openAddIncome: () => void;
  goSettings: () => void;
}

// The whole Overview, in the order of the design. Each tile says the width it would like on a wide screen; packTiles may widen it.
function fullTiles(d: TileData): TileSpec[] {
  const recap: TileSpec[] = d.recap ? [{ id: 'recap', span: 4, node: <WeekRecapCard recap={d.recap} /> }] : [];
  const recurring: TileSpec[] = d.hasRecurring ? [{ id: 'recurring', span: 4, node: <RecurringTile /> }] : [];
  return [
    { id: 'month', span: 8, tall: true, node: d.monthTile },
    ...recap,
    { id: 'net', span: 4, needs: 'worth', node: <NetWorthTile net={d.net} history={d.netHistory} open={d.open} /> },
    ...d.tiles.map((g) => ({ id: `group-${g}`, span: 3, node: <CategoryGroupTile g={g} ov={d.ov} openMonth={d.openMonth} /> })),
    ...recurring,
    { id: 'recent', span: 8, tall: true, node: <RecentTile open={d.open} tall /> },
    { id: 'due', span: 4, needs: 'plan', node: <DueTile due={d.due} open={d.open} /> },
    { id: 'cash', span: 3, needs: 'insights', node: <CashFlowTile flow={d.flow} open={d.open} openAddIncome={d.openAddIncome} /> },
    { id: 'insights', span: 3, needs: 'insights', node: <InsightsTile usual={d.usual} projected={d.projected} ov={d.ov} cats={d.cats} open={d.open} /> },
    { id: 'where', span: 6, node: <WhereItWentTile cats={d.cats} open={d.open} openAdd={d.openAdd} /> },
    ...d.couples.map((c) => ({ id: `couple-${c.id}`, span: 3, node: <CoupleTile c={c} openGroup={d.openGroup} /> })),
    { id: 'groups', span: 3, node: <GroupsTile shared={d.shared} open={d.open} goSettings={d.goSettings} half /> },
    { id: 'goals', span: 3, needs: 'plan', node: <GoalsTile goal={d.goalTile} open={d.open} /> },
    { id: 'udhaar', span: 3, needs: 'udhaar', node: <UdhaarTile totals={d.udhaar} hasEntries={d.hasUdhaar} open={d.open} /> },
  ];
}

// No payments yet, or only a few: the month, the last payments and the groups.
function startTiles(d: TileData): TileSpec[] {
  return [
    { id: 'month', span: 8, node: d.monthTile },
    { id: 'recent', span: 8, node: <RecentTile open={d.open} tall={false} /> },
    { id: 'groups', span: 4, node: <GroupsTile shared={d.shared} open={d.open} goSettings={d.goSettings} half={false} /> },
  ];
}

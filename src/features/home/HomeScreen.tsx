import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { BentoCard, BentoEmpty, BentoGrid } from '../../ui/Bento.tsx';
import { BudgetLine } from '../../ui/BudgetLine.tsx';
import { PaceChart } from './PaceChart.tsx';
import { RecurringTile } from '../recurring/index.ts';
import { RecentList } from '../payments/index.ts';
import { dueRelative, fmtNet } from '../../core/blocks.ts';
import { planForMonth } from '../../core/categories.ts';
import { coupleTiles, dueOverview, nearestGoal, exportOverview, groupsOverview, headlineNet, monthOverview, overviewGroups, topCategories } from './dashboard.ts';
import { monthLabel, shortDate } from '../../core/format.ts';
import type { Group } from '../../core/logic.ts';
import { budgetEntries, fmtINR, nearBudget, isoDate, monthOf, shiftMonth } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import * as hs from '../../ui/tileStyles.ts';

// The pages a tile can open (App.tsx owns them; each has its own address).
export type Section = 'payments' | 'month' | 'plan' | 'groups' | 'export' | 'goals';

interface Props {
  open: (s: Section, anchor?: string) => void;
  openMonth: (group?: Group) => void; // the Month page, for one group's categories or for all
  openGroup: (id: string) => void; // one group's page
  openAdd: () => void;
  goSettings: () => void;
  manageRecurring: () => void;
}

const pct = (f: number): string => { const v = Math.abs(f * 100); return `${v < 100 ? v.toFixed(1) : Math.round(v)}%`; };
const whole = (f: number): string => `${Math.round(f * 100)}%`;

// The surface layer: one figure or picture per tile, every tile a door to its details. Everything shown is worked out from
// what the app already holds; there is no tile for figures the app does not record (income, net worth over time).
export function HomeScreen({ open, openMonth, openGroup, openAdd, goSettings, manageRecurring }: Props) {
  const app = useApp();
  const today = isoDate();
  const month = monthOf(today);
  const ov = useMemo(() => monthOverview(
    app.entries, app.me, planForMonth(app.plan, app.mine, month), planForMonth(app.plan, app.mine, shiftMonth(month, -1)), today,
  ), [app.entries, app.me, app.plan, app.mine, month, today]);
  const cats = useMemo(() => topCategories(ov.summary), [ov]);
  const due = useMemo(() => dueOverview(app.due, app.doneMap, today), [app.due, app.doneMap, today]);
  const net = useMemo(() => (app.net ? headlineNet(app.net.items) : null), [app.net]);
  // two more of the snapshot's figures for context; the Plan sheet lists them all
  const netFacts = useMemo(() => (app.net?.items ?? []).filter((i) => i !== net?.main && i !== net?.goal).slice(0, 2), [app.net, net]);
  const shared = useMemo(() => groupsOverview(app.groups, app.groupEntries, app.settlements, app.me), [app.groups, app.groupEntries, app.settlements, app.me]);
  const couples = useMemo(() => coupleTiles(app.groups, app.members, app.groupEntries, app.settlements, app.me), [app.groups, app.members, app.groupEntries, app.settlements, app.me]);
  const goalTile = useMemo(() => nearestGoal(app.goals, budgetEntries(app.entries, app.me), today), [app.goals, app.entries, app.me, today]);
  const ex = useMemo(() => exportOverview(app.entries, app.allEntries, app.me), [app.entries, app.allEntries, app.me]);

  const tiles = overviewGroups(ov.summary.groups);
  const tileSpan = (12 / tiles.length) as 3 | 4 | 6 | 12;

  const mon = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(`${month}-15T12:00:00`));
  const lastMon = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(`${shiftMonth(month, -1)}-15T12:00:00`));
  const toDate = ov.daily[ov.daily.length - 1] ?? 0;
  const left = ov.budget - ov.spent;
  const paceLabel = `Spending this month by day: ${fmtINR(toDate)} by ${ov.day} ${mon}; last month ${fmtINR(ov.lastToDate)} by the same day`
    + (ov.budgeted ? `; budget ${fmtINR(ov.budget)}.` : '.');

  return (
    <section aria-labelledby="home-title">
      <div className={ui.pageHead}>
        <h2 id="home-title">Overview</h2>
        <p className="text-muted">{monthLabel(month)}</p>
      </div>
      <BentoGrid>
        <BentoCard title="This month" span={8} hero onOpen={() => open('month')} openLabel={`Open ${monthLabel(month)}: groups, categories and budgets`}>
          <div className={hs.heroTop}>
            <div>
              <p className={hs.heroNum}>{fmtINR(ov.spent)}</p>
              <p className={hs.note}>spent{ov.budgeted ? ` of ${fmtINR(ov.budget)} budget` : ''} · savings not counted</p>
            </div>
            {ov.change !== null && (
              <span className={hs.delta(ov.change > 0 ? 'bad' : ov.change < 0 ? 'good' : '')}>
                <span aria-hidden="true">{ov.change > 0 ? '▲ ' : ov.change < 0 ? '▼ ' : ''}</span>
                {ov.change === 0 ? 'Same as' : <>{pct(ov.change)}<span className="sr-only">{ov.change > 0 ? ' more than' : ' less than'}</span></>} last month
              </span>
            )}
          </div>
          <p className={hs.status(ov.budgeted && left < 0 ? 'bad' : ov.budgeted && nearBudget(ov.spent, ov.budget) ? 'warn' : '')}>
            {!ov.budgeted ? 'No budgets yet: open to set them.' : left >= 0 ? `${fmtINR(left)} left this month${nearBudget(ov.spent, ov.budget) ? ', budget nearly used' : ''}` : `${fmtINR(-left)} over budget`}
          </p>
          {toDate === 0 && (ov.lastDaily[ov.lastDaily.length - 1] ?? 0) === 0 ? (
            // nothing to draw yet: a flat line at zero would say less than these words
            <BentoEmpty cta="Add expense" onCta={openAdd}>No spending logged this month or last (savings are not counted here). Your spending by day shows here once you log a payment.</BentoEmpty>
          ) : (
            <>
              <PaceChart daily={ov.daily} lastDaily={ov.lastDaily} days={ov.days} budget={ov.budgeted ? ov.budget : 0} label={paceLabel} />
              <div className={hs.paceAxis} aria-hidden="true"><span>1 {mon}</span><span>{ov.days} {mon}</span></div>
              <ul className={hs.legend}>
                <li><i className={hs.key.now} aria-hidden="true" />This month <b>{fmtINR(toDate)}</b></li>
                <li><i className={hs.key.last} aria-hidden="true" />{lastMon}, by day {Math.min(ov.day, ov.lastDaily.length)} <b>{fmtINR(ov.lastToDate)}</b></li>
                {ov.budgeted && <li><i className={hs.key.budget} aria-hidden="true" />Budget <b>{fmtINR(ov.budget)}</b></li>}
              </ul>
            </>
          )}
        </BentoCard>

        {app.net ? (
          <BentoCard title="Net worth" span={4} onOpen={() => open('plan', 'networth')} openLabel="Open net worth and goals">
            <p className={hs.statNum()}>{net?.main ? fmtNet(net.main) : app.net.items[0] ? fmtNet(app.net.items[0]) : ''}</p>
            <p className={hs.note}>{net?.main?.label ?? app.net.items[0]?.label}</p>
            {net?.goal && (
              <div className={hs.goal}>
                <div className={ui.meter('good')} aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, net.goal.value))}%` }} /></div>
                <span className={ui.leftText()}>{net.goal.label}: {fmtNet(net.goal)}</span>
              </div>
            )}
            {netFacts.length > 0 && (
              <ul className={hs.netFacts}>{netFacts.map((i) => <li key={i.label}><span>{i.label}</span><b>{fmtNet(i)}</b></li>)}</ul>
            )}
            <p className={hs.noteFoot}>
              {app.net.asOf ? `Plan month ${monthLabel(app.net.asOf.slice(0, 7))}` : `Imported ${shortDate(app.net.importedAt.slice(0, 10))}`} · a snapshot from your spreadsheet
            </p>
          </BentoCard>
        ) : (
          <BentoCard title="Net worth" span={4}>
            <BentoEmpty cta="Import in Settings" onCta={goSettings}>
              Net worth and goals come from your spreadsheet's App export tab. Nothing is imported yet.
            </BentoEmpty>
          </BentoCard>
        )}

        {tiles.map((g, i) => {
          const t = ov.summary.groups[g];
          return (
            <BentoCard key={g} title={g} span={tileSpan} compact fill={tiles.length % 2 === 1 && i === tiles.length - 1} onOpen={() => openMonth(g)} openLabel={`Open ${g} for the month`}>
              <p className={hs.statNum(true)}>{fmtINR(t.spent)}</p>
              <p className={hs.note}>{t.budgeted ? `of ${fmtINR(t.planned)}` : ' '}</p>
              <BudgetLine group={g} spent={t.spent} planned={t.planned} over={false} budgeted={t.budgeted} />
            </BentoCard>
          );
        })}

        <RecurringTile onManage={manageRecurring} />

        <BentoCard
          title="Recent payments"
          span={8}
          action={app.entries.length > 0 ? <button type="button" className={hs.seeAll} onClick={() => open('payments')}>See all</button> : null}
        >
          <RecentList limit={5} plain empty={<BentoEmpty cta="Add your first expense" onCta={openAdd}>No payments yet. The latest ones show here.</BentoEmpty>} />
        </BentoCard>

        {due ? (
          <BentoCard title="Due soon" span={4} onOpen={() => open('plan')} openLabel="Open the due list">
            <p className={hs.statNum()}>{due.open === 0 ? 'All done' : due.overdue > 0 ? <span className={ui.late}>{due.overdue} overdue</span> : `${due.open} open`}</p>
            {due.open > 0 && due.overdue > 0 && <p className={hs.note}>{due.open} open in all</p>}
            {due.next.length > 0 && (
              <ul className={hs.mini}>
                {due.next.map((v) => (
                  <li key={v.k}>
                    <span className={ui.rowMain()}>
                      <b>{v.title}</b>
                      <small className={v.state === 'overdue' ? ui.late : undefined}>{v.due ? `${shortDate(v.due)} · ${dueRelative(v.days)}` : 'No date'}</small>
                    </span>
                    {v.amount ? <span className="font-bold tabular-nums">{fmtINR(v.amount)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </BentoCard>
        ) : (
          <BentoCard title="Due soon" span={4}>
            <BentoEmpty cta="Import in Settings" onCta={goSettings}>
              One-off payments and to-dos come from your spreadsheet's App export tab. Nothing is imported yet.
            </BentoEmpty>
          </BentoCard>
        )}

        <BentoCard title="Where it went" span={4} onOpen={cats.total > 0 ? () => open('month') : undefined} openLabel="Open this month's categories">
          {cats.total === 0 ? (
            <BentoEmpty cta="Add expense" onCta={openAdd}>Nothing spent yet this month.</BentoEmpty>
          ) : (
            <ul className={hs.shares}>
              {cats.top.map((c) => (
                <li key={c.category}>
                  <span className={hs.shareLine}><span className={hs.shareName}>{c.category}</span><span className="text-muted">{whole(c.share)}</span><b>{fmtINR(c.spent)}</b></span>
                  <span className={hs.shareBar} aria-hidden="true"><i style={{ width: `${Math.max(1, c.share * 100)}%` }} /></span>
                </li>
              ))}
              {cats.rest.count > 0 && <li className={hs.note}>{cats.rest.count} more {cats.rest.count === 1 ? 'category' : 'categories'} · {fmtINR(cats.rest.spent)} ({whole(cats.rest.share)})</li>}
            </ul>
          )}
        </BentoCard>

        {couples.map((c) => (
          <BentoCard key={c.id} title={`You and ${c.partner}`} span={4} onOpen={() => openGroup(c.id)} openLabel={`Open your couple group with ${c.partner}`}>
            <p className={`${hs.statNum()} ${c.tone === 'owed' ? 'text-good' : c.tone === 'late' ? 'text-bad' : 'text-muted'}`}>{c.text}</p>
            <p className={hs.note}>{c.tone === 'muted' ? 'Nothing to settle' : 'Open to settle up'}</p>
          </BentoCard>
        ))}

        {!app.syncEnabled ? (
          <BentoCard title="Groups" span={4}><BentoEmpty>Groups need cloud sync, which is not set up in this build.</BentoEmpty></BentoCard>
        ) : app.sync.mode === 'signedout' || !app.me ? (
          <BentoCard title="Groups" span={4}>
            <BentoEmpty cta="Sign in" onCta={goSettings}>Sign in to share expenses with the family or on a trip, and settle up.</BentoEmpty>
          </BentoCard>
        ) : app.groups.length === 0 ? (
          <BentoCard title="Groups" span={4}>
            <BentoEmpty cta="Make or join a group" onCta={() => open('groups')}>No groups yet. Make one for the family or a trip.</BentoEmpty>
          </BentoCard>
        ) : (
          <BentoCard title="Groups" span={4} onOpen={() => open('groups')} openLabel="Open groups and settle up">
            {shared.owed === shared.owe ? (
              <p className={hs.statNum()}>All settled</p>
            ) : shared.owed > shared.owe ? (
              <p className={hs.statNum()}><span className={ui.owed}>{fmtINR(shared.owed - shared.owe)}</span> <span className={hs.statUnit}>owed to you</span></p>
            ) : (
              <p className={hs.statNum()}><span className={ui.late}>{fmtINR(shared.owe - shared.owed)}</span> <span className={hs.statUnit}>you owe</span></p>
            )}
            <p className={hs.note}>
              {app.groups.length} {app.groups.length === 1 ? 'group' : 'groups'}
              {shared.owed > 0 && shared.owe > 0 ? ` · ${fmtINR(shared.owed)} owed to you, ${fmtINR(shared.owe)} you owe` : ''}
            </p>
          </BentoCard>
        )}

        {goalTile ? (
          <BentoCard title="Goals" span={4} onOpen={() => open('goals')} openLabel="Open your goals and the plan">
            <p className={hs.statNum()}>{fmtINR(goalTile.progress.saved)} <span className={hs.statUnit}>of {fmtINR(goalTile.goal.a)}</span></p>
            <p className={hs.note}>{goalTile.goal.n} · {goalTile.term === 'short' ? 'short term' : 'long term'}{goalTile.count > 1 ? ` · ${goalTile.count} goals` : ''}</p>
            <div className={ui.meter(goalTile.line.state === 'reached' ? 'good' : goalTile.line.state === 'passed' ? 'bad' : 'accent')} aria-hidden="true"><i style={{ width: `${Math.round(goalTile.progress.fraction * 100)}%` }} /></div>
            <p className={hs.note}>{goalTile.line.state === 'reached' ? 'Reached' : goalTile.line.state === 'passed' ? 'The date has passed' : `Needs ${fmtINR(goalTile.line.monthly)} a month`}</p>
          </BentoCard>
        ) : (
          <BentoCard title="Goals" span={4}>
            <BentoEmpty cta="Make a goal" onCta={() => open('goals')}>No goals yet. Set a target and a date, and see what to set aside each month.</BentoEmpty>
          </BentoCard>
        )}

        <BentoCard title="Export" span={4} onOpen={() => open('export')} openLabel="Open export to the spreadsheet">
          <p className={hs.statNum()}>{app.entries.length === 0 ? 'Nothing yet' : ex.waiting === 0 ? 'All exported' : `${ex.waiting} to export`}</p>
          {ex.changed > 0 ? (
            <p className={hs.warnText}>{ex.changed} changed after export: fix {ex.changed === 1 ? 'that row' : 'those rows'} in the spreadsheet</p>
          ) : (
            <p className={hs.note}>
              {app.entries.length === 0 ? "Payments you log can be copied into the spreadsheet's Log tab" : ex.waiting > 0 ? "Copy them into the spreadsheet's Log tab" : 'Nothing new since the last copy'}
            </p>
          )}
        </BentoCard>
      </BentoGrid>
    </section>
  );
}

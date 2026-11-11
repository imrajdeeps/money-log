import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { BentoCard, BentoEmpty, BentoGrid } from '../../ui/Bento.tsx';
import { BudgetLine } from '../../ui/BudgetLine.tsx';
import { PaceChart } from './PaceChart.tsx';
import { RecurringTile } from '../recurring/index.ts';
import { RecentList } from '../payments/index.ts';
import { dueRelative } from '../../core/blocks.ts';
import { netNow } from '../../core/goals.ts';
import { planForMonth } from '../../core/categories.ts';
import { coupleTiles, dueOverview, nearestGoal, groupsOverview, monthOverview, overviewGroups, topCategories } from './dashboard.ts';
import { monthLabel, monthShort, shortDate } from '../../core/format.ts';
import { averageOf, groupLookup, monthlyTotals, monthsEnding, projectedMonthEnd } from '../../core/analytics.ts';
import type { Group } from '../../core/logic.ts';
import { budgetEntries, fmtINR, nearBudget, isoDate, monthOf, shiftMonth } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import * as hs from '../../ui/tileStyles.ts';
import { tr } from '../../core/i18n.ts';

// The pages a tile can open (App.tsx owns them; each has its own address).
export type Section = 'payments' | 'month' | 'plan' | 'groups' | 'goals' | 'analytics';

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
    app.entries, app.me, planForMonth(app.mine, month), planForMonth(app.mine, shiftMonth(month, -1)), today,
  ), [app.entries, app.me, app.mine, month, today]);
  const cats = useMemo(() => topCategories(ov.summary), [ov]);
  const due = useMemo(() => dueOverview(app.dueItems, today), [app.dueItems, today]);
  const net = useMemo(() => netNow(app.goals), [app.goals]);
  // two more of the snapshot's figures for context; the Plan sheet lists them all
  const shared = useMemo(() => groupsOverview(app.groups, app.groupEntries, app.settlements, app.me), [app.groups, app.groupEntries, app.settlements, app.me]);
  const couples = useMemo(() => coupleTiles(app.groups, app.members, app.groupEntries, app.settlements, app.me), [app.groups, app.members, app.groupEntries, app.settlements, app.me]);
  const goalTile = useMemo(() => nearestGoal(app.goals, budgetEntries(app.entries, app.me), today), [app.goals, app.entries, app.me, today]);

  const tiles = overviewGroups(ov.summary.groups);
  const tileSpan = (12 / tiles.length) as 3 | 4 | 6 | 12;

  const mon = monthShort(month);
  const lastMon = monthShort(shiftMonth(month, -1));
  const projected = projectedMonthEnd(ov.daily, month, ov.lastDaily); // where the month ends at this pace, once there are days enough to say
  // a usual month: the average of the three months before this one that had any spending
  const usual = useMemo(() => {
    const prev = monthlyTotals(budgetEntries(app.entries, app.me), groupLookup(app.categories), monthsEnding(shiftMonth(month, -1), 3));
    return averageOf(prev.filter((t) => t.spent > 0).map((t) => t.spent));
  }, [app.entries, app.me, app.categories, month]);
  const toDate = ov.daily.at(-1) ?? 0;
  const left = ov.budget - ov.spent;
  const paceLabel = tr('Spending this month by day: {0} by {1} {2}; last month {3} by the same day', fmtINR(toDate), ov.day, mon, fmtINR(ov.lastToDate))
    + (ov.budgeted ? tr('; budget {0}.', fmtINR(ov.budget)) : '.');

  return (
    <section aria-labelledby="home-title">
      <div className={ui.pageHead}>
        <h2 id="home-title">{tr('Overview')}</h2>
        <p className="text-muted">{monthLabel(month)}</p>
      </div>
      <BentoGrid>
        <BentoCard title={tr('This month')} span={8} hero onOpen={() => open('month')} openLabel={`Open ${monthLabel(month)}: groups, categories and budgets`}>
          <div className={hs.heroTop}>
            <div>
              <p className={hs.heroNum}>{fmtINR(ov.spent)}</p>
              <p className={hs.note}>{tr('spent{0} · savings not counted', ov.budgeted ? tr(' of {0} budget', fmtINR(ov.budget)) : '')}</p>
            </div>
            {ov.change !== null && (
              <span className={hs.delta(ov.change > 0 ? 'bad' : ov.change < 0 ? 'good' : '')}>
                <span aria-hidden="true">{ov.change > 0 ? '▲ ' : ov.change < 0 ? '▼ ' : ''}</span>
                {ov.change === 0 ? tr('Same as') : <>{pct(ov.change)}<span className="sr-only">{ov.change > 0 ? ' more than' : ' less than'}</span></>}{' '}{tr('last month')}
              </span>
            )}
          </div>
          <p className={hs.status(ov.budgeted && left < 0 ? 'bad' : ov.budgeted && nearBudget(ov.spent, ov.budget) ? 'warn' : '')}>
            {!ov.budgeted ? tr('No budgets yet: open to set them.') : left >= 0 ? tr('{0} left this month{1}', fmtINR(left), nearBudget(ov.spent, ov.budget) ? tr(', budget nearly used') : '') : tr('{0} over budget', fmtINR(-left))}
          </p>
          {toDate === 0 && (ov.lastDaily.at(-1) ?? 0) === 0 ? (
            // nothing to draw yet: a flat line at zero would say less than these words
            <BentoEmpty cta={tr('Add expense')} onCta={openAdd}>{tr('No spending logged this month or last (savings are not counted here). Your spending by day shows here once you log a payment.')}</BentoEmpty>
          ) : (
            <>
              <PaceChart daily={ov.daily} lastDaily={ov.lastDaily} days={ov.days} budget={ov.budgeted ? ov.budget : 0} projected={ov.day < ov.days ? projected : null} label={paceLabel} />
              <div className={hs.paceAxis} aria-hidden="true"><span>1 {mon}</span><span>{ov.days} {mon}</span></div>
              <ul className={hs.legend}>
                <li><i className={hs.key.now} aria-hidden="true" />{tr('This month')}{' '}<b>{fmtINR(toDate)}</b></li>
                <li><i className={hs.key.last} aria-hidden="true" />{tr('{0}, by day {1}', lastMon, Math.min(ov.day, ov.lastDaily.length))}{' '}<b>{fmtINR(ov.lastToDate)}</b></li>
                {projected !== null && ov.day < ov.days && <li><i className={hs.key.proj} aria-hidden="true" />{tr('Likely by month end')} <b>{fmtINR(Math.round(projected))}</b></li>}
                {ov.budgeted && <li><i className={hs.key.budget} aria-hidden="true" />{tr('Budget')}{' '}<b>{fmtINR(ov.budget)}</b></li>}
              </ul>
            </>
          )}
        </BentoCard>

        {net ? (
          <BentoCard title={tr('Net worth')} span={4} onOpen={() => open('plan', 'networth')} openLabel={tr('Open net worth and goals')}>
            <p className={hs.statNum()}>{fmtINR(net.value)}</p>
            {net.change !== null && net.change !== 0 && net.previous && (
              <p className={ui.leftText(net.change > 0 ? 'good' : 'bad')}>{net.change > 0 ? '▲ ' + tr('Up {0} since {1}', fmtINR(net.change), shortDate(net.previous.date)) : '▼ ' + tr('Down {0} since {1}', fmtINR(Math.abs(net.change)), shortDate(net.previous.date))}</p>
            )}
            <p className={hs.noteFoot}>{tr('As of {0}', shortDate(net.date))}</p>
          </BentoCard>
        ) : (
          <BentoCard title={tr('Net worth')} span={4}>
            <BentoEmpty cta={tr('Add your net worth')} onCta={() => open('plan', 'networth')}>
              {tr('Add what you own minus what you owe, and update it now and then to see it move.')}
            </BentoEmpty>
          </BentoCard>
        )}

        {tiles.map((g, i) => {
          const t = ov.summary.groups[g];
          return (
            <BentoCard key={g} title={tr(g)} span={tileSpan} compact fill={tiles.length % 2 === 1 && i === tiles.length - 1} onOpen={() => openMonth(g)} openLabel={`Open ${g} for the month`}>
              <p className={hs.statNum(true)}>{fmtINR(t.spent)}</p>
              <p className={hs.note}>{t.budgeted ? tr('of {0}', fmtINR(t.planned)) : ' '}</p>
              <BudgetLine group={g} spent={t.spent} planned={t.planned} over={false} budgeted={t.budgeted} />
            </BentoCard>
          );
        })}

        <RecurringTile onManage={manageRecurring} />

        <BentoCard
          title={tr('Recent payments')}
          span={8}
          action={app.entries.length > 0 ? <button type="button" className={hs.seeAll} onClick={() => open('payments')}>{tr('See all')}</button> : null}
        >
          <RecentList limit={5} plain empty={<BentoEmpty cta={tr('Add your first expense')} onCta={openAdd}>{tr('No payments yet. The latest ones show here.')}</BentoEmpty>} />
        </BentoCard>

        {due ? (
          <BentoCard title={tr('Due soon')} span={4} onOpen={() => open('plan')} openLabel={tr('Open the due list')}>
            <p className={hs.statNum()}>{due.open === 0 ? tr('All done') : due.overdue > 0 ? <span className={ui.late}>{tr('{0} overdue', due.overdue)}</span> : tr('{0} open', due.open)}</p>
            {due.open > 0 && due.overdue > 0 && <p className={hs.note}>{tr('{0} open in all', due.open)}</p>}
            {due.next.length > 0 && (
              <ul className={hs.mini}>
                {due.next.map((v) => (
                  <li key={v.k}>
                    <span className={ui.rowMain()}>
                      <b>{v.title}</b>
                      <small className={v.state === 'overdue' ? ui.late : undefined}>{v.due ? `${shortDate(v.due)} · ${dueRelative(v.days)}` : tr('No date')}</small>
                    </span>
                    {v.amount ? <span className="font-bold tabular-nums">{fmtINR(v.amount)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </BentoCard>
        ) : (
          <BentoCard title={tr('Due soon')} span={4}>
            <BentoEmpty cta={tr('Add an item')} onCta={() => open('plan', 'due')}>
              {tr('Add one-off payments and to-dos, with a date, and see what is due soon.')}
            </BentoEmpty>
          </BentoCard>
        )}

        <BentoCard title={tr('Insights')} span={4} onOpen={() => open('analytics')} openLabel={tr('Open insights')}>
          {usual > 0 ? (
            <>
              <p className={hs.statNum()}>{fmtINR(usual)} <span className={hs.statUnit}>{tr('a usual month')}</span></p>
              <p className={hs.note}>{projected !== null && ov.day < ov.days ? tr('This month will likely end near {0}.', fmtINR(Math.round(projected))) : tr('{0} so far this month.', fmtINR(toDate))}</p>
              <p className={hs.noteFoot}>{tr('Months, categories, days of the week and goals, added up.')}</p>
            </>
          ) : (
            <BentoEmpty>{tr('Insights fill in once you have logged a month or two of payments.')}</BentoEmpty>
          )}
        </BentoCard>

        <BentoCard title={tr('Where it went')} span={4} onOpen={cats.total > 0 ? () => open('month') : undefined} openLabel={tr('Open this month\'s categories')}>
          {cats.total === 0 ? (
            <BentoEmpty cta={tr('Add expense')} onCta={openAdd}>{tr('Nothing spent yet this month.')}</BentoEmpty>
          ) : (
            <ul className={hs.shares}>
              {cats.top.map((c) => (
                <li key={c.category}>
                  <span className={hs.shareLine}><span className={hs.shareName}>{c.category}</span><span className="text-muted">{whole(c.share)}</span><b>{fmtINR(c.spent)}</b></span>
                  <span className={hs.shareBar} aria-hidden="true"><i style={{ width: `${Math.max(1, c.share * 100)}%` }} /></span>
                </li>
              ))}
              {cats.rest.count > 0 && <li className={hs.note}>{tr('{0} more {1} · {2} ({3})', cats.rest.count, cats.rest.count === 1 ? 'category' : 'categories', fmtINR(cats.rest.spent), whole(cats.rest.share))}</li>}
            </ul>
          )}
        </BentoCard>

        {couples.map((c) => (
          <BentoCard key={c.id} title={tr('You and {0}', c.partner)} span={4} onOpen={() => openGroup(c.id)} openLabel={`Open your couple group with ${c.partner}`}>
            <p className={`${hs.statNum()} ${c.tone === 'owed' ? 'text-good' : c.tone === 'late' ? 'text-bad' : 'text-muted'}`}>{c.text}</p>
            <p className={hs.note}>{c.tone === 'muted' ? tr('Nothing to settle') : tr('Open to settle up')}</p>
          </BentoCard>
        ))}

        {!app.syncEnabled ? (
          <BentoCard title={tr('Groups')} span={4}><BentoEmpty>{tr('Groups need cloud sync, which is not set up in this build.')}</BentoEmpty></BentoCard>
        ) : app.sync.mode === 'signedout' || !app.me ? (
          <BentoCard title={tr('Groups')} span={4}>
            <BentoEmpty cta={tr('Sign in')} onCta={goSettings}>{tr('Sign in to share expenses with the family or on a trip, and settle up.')}</BentoEmpty>
          </BentoCard>
        ) : app.groups.length === 0 ? (
          <BentoCard title={tr('Groups')} span={4}>
            <BentoEmpty cta={tr('Make or join a group')} onCta={() => open('groups')}>{tr('No groups yet. Make one for the family or a trip.')}</BentoEmpty>
          </BentoCard>
        ) : (
          <BentoCard title={tr('Groups')} span={4} onOpen={() => open('groups')} openLabel={tr('Open groups and settle up')}>
            {shared.owed === shared.owe ? (
              <p className={hs.statNum()}>{tr('All settled')}</p>
            ) : shared.owed > shared.owe ? (
              <p className={hs.statNum()}><span className={ui.owed}>{fmtINR(shared.owed - shared.owe)}</span> <span className={hs.statUnit}>{tr('owed to you')}</span></p>
            ) : (
              <p className={hs.statNum()}><span className={ui.late}>{fmtINR(shared.owe - shared.owed)}</span> <span className={hs.statUnit}>{tr('you owe')}</span></p>
            )}
            <p className={hs.note}>
              {app.groups.length} {app.groups.length === 1 ? 'group' : 'groups'}
              {shared.owed > 0 && shared.owe > 0 ? tr(' · {0} owed to you, {1} you owe', fmtINR(shared.owed), fmtINR(shared.owe)) : ''}
            </p>
          </BentoCard>
        )}

        {goalTile ? (
          <BentoCard title={tr('Goals')} span={4} onOpen={() => open('plan', 'goals')} openLabel={tr('Open your goals and the plan')}>
            <p className={hs.statNum()}>{fmtINR(goalTile.progress.saved)} <span className={hs.statUnit}>{tr('of {0}', fmtINR(goalTile.goal.a))}</span></p>
            <p className={hs.note}>{goalTile.goal.n} · {goalTile.term === 'short' ? tr('short term') : tr('long term')}{goalTile.count > 1 ? tr(' · {0} goals', goalTile.count) : ''}</p>
            <div className={ui.meter(goalTile.line.state === 'reached' ? 'good' : goalTile.line.state === 'passed' ? 'bad' : 'accent')} aria-hidden="true"><i style={{ width: `${Math.round(goalTile.progress.fraction * 100)}%` }} /></div>
            <p className={hs.note}>{goalTile.line.state === 'reached' ? tr('Reached') : goalTile.line.state === 'passed' ? tr('The date has passed') : tr('Needs {0} a month', fmtINR(goalTile.line.monthly))}</p>
          </BentoCard>
        ) : (
          <BentoCard title={tr('Goals')} span={4}>
            <BentoEmpty cta={tr('Make a goal')} onCta={() => open('plan', 'goals')}>{tr('No goals yet. Set a target and a date, and see what to set aside each month.')}</BentoEmpty>
          </BentoCard>
        )}

      </BentoGrid>
    </section>
  );
}

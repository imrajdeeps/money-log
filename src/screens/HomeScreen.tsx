import { useMemo } from 'react';
import { useApp } from '../context.tsx';
import { BentoCard, BentoEmpty, BentoGrid } from '../components/Bento.tsx';
import { BudgetLine } from '../components/BudgetLine.tsx';
import { PaceChart } from '../components/PaceChart.tsx';
import { RecentList } from '../components/RecentList.tsx';
import { dueRelative, fmtNet } from '../blocks.ts';
import { planForMonth } from '../categories.ts';
import { dueOverview, exportOverview, groupsOverview, headlineNet, monthOverview, overviewGroups, topCategories } from '../dashboard.ts';
import { monthLabel, shortDate } from '../format.ts';
import { fmtINR, isoDate, monthOf, shiftMonth } from '../logic.ts';

// The sheets a tile can open (App.tsx owns them).
export type Section = 'recent' | 'month' | 'plan' | 'groups' | 'export';

interface Props {
  open: (s: Section, anchor?: string) => void;
  openAdd: () => void;
  goSettings: () => void;
}

const pct = (f: number): string => { const v = Math.abs(f * 100); return `${v < 100 ? v.toFixed(1) : Math.round(v)}%`; };
const whole = (f: number): string => `${Math.round(f * 100)}%`;

// The surface layer: one figure or picture per tile, every tile a door to its details. Everything shown is worked out from
// what the app already holds; there is no tile for figures the app does not record (income, net worth over time).
export function HomeScreen({ open, openAdd, goSettings }: Props) {
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
      <div className="pagehead">
        <h2 id="home-title">Overview</h2>
        <p className="muted">{monthLabel(month)}</p>
      </div>
      <BentoGrid>
        <BentoCard title="This month" span={8} className="hero" onOpen={() => open('month')} openLabel={`Open ${monthLabel(month)}: groups, categories and budgets`}>
          <div className="hero-top">
            <div>
              <p className="hero-num">{fmtINR(ov.spent)}</p>
              <p className="muted small">spent{ov.budgeted ? ` of ${fmtINR(ov.budget)} budget` : ''} · savings not counted</p>
            </div>
            {ov.change !== null && (
              <span className={`delta ${ov.change > 0 ? 'bad' : ov.change < 0 ? 'good' : ''}`}>
                <span aria-hidden="true">{ov.change > 0 ? '▲ ' : ov.change < 0 ? '▼ ' : ''}</span>
                {ov.change === 0 ? 'Same as' : <>{pct(ov.change)}<span className="sr">{ov.change > 0 ? ' more than' : ' less than'}</span></>} last month
              </span>
            )}
          </div>
          <p className={`status ${ov.budgeted && left < 0 ? 'bad' : ''}`}>
            {!ov.budgeted ? 'No budgets yet: open to set them.' : left >= 0 ? `${fmtINR(left)} left this month` : `${fmtINR(-left)} over budget`}
          </p>
          {toDate === 0 && (ov.lastDaily[ov.lastDaily.length - 1] ?? 0) === 0 ? (
            // nothing to draw yet: a flat line at zero would say less than these words
            <BentoEmpty cta="Add expense" onCta={openAdd}>No spending logged this month or last (savings are not counted here). Your spending by day shows here once you log a payment.</BentoEmpty>
          ) : (
            <>
              <PaceChart daily={ov.daily} lastDaily={ov.lastDaily} days={ov.days} budget={ov.budgeted ? ov.budget : 0} label={paceLabel} />
              <div className="pace-axis" aria-hidden="true"><span>1 {mon}</span><span>{ov.days} {mon}</span></div>
              <ul className="legend">
                <li><i className="key now" aria-hidden="true" />This month <b>{fmtINR(toDate)}</b></li>
                <li><i className="key last" aria-hidden="true" />{lastMon}, by day {Math.min(ov.day, ov.lastDaily.length)} <b>{fmtINR(ov.lastToDate)}</b></li>
                {ov.budgeted && <li><i className="key budget" aria-hidden="true" />Budget <b>{fmtINR(ov.budget)}</b></li>}
              </ul>
            </>
          )}
        </BentoCard>

        {app.net ? (
          <BentoCard title="Net worth" span={4} onOpen={() => open('plan', 'networth')} openLabel="Open net worth and goals">
            <p className="stat-num">{net?.main ? fmtNet(net.main) : app.net.items[0] ? fmtNet(app.net.items[0]) : ''}</p>
            <p className="muted small">{net?.main?.label ?? app.net.items[0]?.label}</p>
            {net?.goal && (
              <div className="goal">
                <div className="bar meter-good" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, net.goal.value))}%` }} /></div>
                <span className="left">{net.goal.label}: {fmtNet(net.goal)}</span>
              </div>
            )}
            {netFacts.length > 0 && (
              <ul className="netfacts">{netFacts.map((i) => <li key={i.label}><span>{i.label}</span><b>{fmtNet(i)}</b></li>)}</ul>
            )}
            <p className="muted small foot">
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
            <BentoCard key={g} title={g} span={tileSpan} compact className={tiles.length % 2 === 1 && i === tiles.length - 1 ? 'fill' : undefined} onOpen={() => open('month')} openLabel={`Open the month: ${g}`}>
              <p className="stat-num">{fmtINR(t.spent)}</p>
              <p className="muted small">{t.budgeted ? `of ${fmtINR(t.planned)}` : ' '}</p>
              <BudgetLine group={g} spent={t.spent} planned={t.planned} over={false} budgeted={t.budgeted} />
            </BentoCard>
          );
        })}

        <BentoCard
          title="Recent payments"
          span={8}
          action={app.entries.length > 0 ? <button type="button" className="seeall" aria-haspopup="dialog" onClick={() => open('recent')}>See all</button> : null}
        >
          <RecentList limit={5} plain empty={<BentoEmpty cta="Add your first expense" onCta={openAdd}>No payments yet. The latest ones show here.</BentoEmpty>} />
        </BentoCard>

        {due ? (
          <BentoCard title="Due soon" span={4} onOpen={() => open('plan')} openLabel="Open the due list">
            <p className="stat-num">{due.open === 0 ? 'All done' : due.overdue > 0 ? <span className="late">{due.overdue} overdue</span> : `${due.open} open`}</p>
            {due.open > 0 && due.overdue > 0 && <p className="muted small">{due.open} open in all</p>}
            {due.next.length > 0 && (
              <ul className="mini">
                {due.next.map((v) => (
                  <li key={v.k}>
                    <span className="row-main">
                      <b>{v.title}</b>
                      <small className={v.state === 'overdue' ? 'late' : undefined}>{v.due ? `${shortDate(v.due)} · ${dueRelative(v.days)}` : 'No date'}</small>
                    </span>
                    {v.amount ? <span className="amt">{fmtINR(v.amount)}</span> : null}
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
            <ul className="shares">
              {cats.top.map((c) => (
                <li key={c.category}>
                  <span className="share-line"><span className="share-name">{c.category}</span><span className="muted">{whole(c.share)}</span><b>{fmtINR(c.spent)}</b></span>
                  <span className="share-bar" aria-hidden="true"><i style={{ width: `${Math.max(1, c.share * 100)}%` }} /></span>
                </li>
              ))}
              {cats.rest.count > 0 && <li className="muted small">{cats.rest.count} more {cats.rest.count === 1 ? 'category' : 'categories'} · {fmtINR(cats.rest.spent)} ({whole(cats.rest.share)})</li>}
            </ul>
          )}
        </BentoCard>

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
              <p className="stat-num">All settled</p>
            ) : shared.owed > shared.owe ? (
              <p className="stat-num"><span className="owed">{fmtINR(shared.owed - shared.owe)}</span> <span className="stat-unit">owed to you</span></p>
            ) : (
              <p className="stat-num"><span className="late">{fmtINR(shared.owe - shared.owed)}</span> <span className="stat-unit">you owe</span></p>
            )}
            <p className="muted small">
              {app.groups.length} {app.groups.length === 1 ? 'group' : 'groups'}
              {shared.owed > 0 && shared.owe > 0 ? ` · ${fmtINR(shared.owed)} owed to you, ${fmtINR(shared.owe)} you owe` : ''}
            </p>
          </BentoCard>
        )}

        <BentoCard title="Export" span={4} onOpen={() => open('export')} openLabel="Open export to the spreadsheet">
          <p className="stat-num">{app.entries.length === 0 ? 'Nothing yet' : ex.waiting === 0 ? 'All exported' : `${ex.waiting} to export`}</p>
          {ex.changed > 0 ? (
            <p className="small warn-text">{ex.changed} changed after export: fix {ex.changed === 1 ? 'that row' : 'those rows'} in the spreadsheet</p>
          ) : (
            <p className="muted small">
              {app.entries.length === 0 ? "Payments you log can be copied into the spreadsheet's Log tab" : ex.waiting > 0 ? "Copy them into the spreadsheet's Log tab" : 'Nothing new since the last copy'}
            </p>
          )}
        </BentoCard>
      </BentoGrid>
    </section>
  );
}

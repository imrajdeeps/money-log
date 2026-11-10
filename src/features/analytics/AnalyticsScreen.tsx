import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { activeGoals, goalLine, goalProgress } from '../../core/goals.ts';
import { averageOf, biggestPayments, categoryTrends, cumulativeByDay, groupLookup, groupShares, monthlyTotals, monthsEnding, pctChange, projectedMonthEnd, weekdaySpend } from '../../core/analytics.ts';
import { monthLabel, monthShort, shortDate, weekdayShort } from '../../core/format.ts';
import { budgetEntries, daysInMonth, fmtINR, isoDate, monthOf } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';
import * as ui from '../../ui/styles.ts';
import { BarChart, Sparkline } from './charts.tsx';

const RANGES = [3, 6, 12] as const;
type Range = (typeof RANGES)[number];

const rupees = (n: number) => fmtINR(Math.round(n)); // whole rupees: this page is about the shape of the spending
const pct = (f: number) => `${f > 0 ? '+' : ''}${Math.round(f * 100)}%`;

// What the payments say, added up in a few ways: month by month, by category, by day of the week, the biggest payments, and how
// the goals are going. Everything is worked out on this phone from the payments already here: nothing is sent anywhere.
export function AnalyticsScreen() {
  const app = useApp();
  const [range, setRange] = useState<Range>(6);
  const today = isoDate();
  const thisMonth = monthOf(today);
  const entries = useMemo(() => budgetEntries(app.entries, app.me), [app.entries, app.me]);
  const groupOf = useMemo(() => groupLookup(app.categories), [app.categories]);
  const months = useMemo(() => monthsEnding(thisMonth, range), [thisMonth, range]);
  const totals = useMemo(() => monthlyTotals(entries, groupOf, months), [entries, groupOf, months]);
  const trends = useMemo(() => categoryTrends(entries, groupOf, months, 8, Number(today.slice(8, 10))), [entries, groupOf, months, today]);
  const weekdays = useMemo(() => weekdaySpend(entries, groupOf, today, 90), [entries, groupOf, today]);
  const biggest = useMemo(() => biggestPayments(entries, groupOf, thisMonth, 5), [entries, groupOf, thisMonth]);
  const shares = useMemo(() => groupShares(entries, groupOf, thisMonth), [entries, groupOf, thisMonth]);
  const goals = useMemo(() => activeGoals(app.goals).map((goal) => {
    const progress = goalProgress(goal, app.goals, app.entries);
    return { goal, progress, line: goalLine(goal, progress, today) };
  }), [app.goals, app.entries, today]);

  const day = Number(today.slice(8, 10));
  const daily = cumulativeByDay(entries, groupOf, thisMonth, day);
  const spentNow = daily[daily.length - 1] ?? 0;
  const lastMonth = monthsEnding(thisMonth, 2)[0]!;
  const projected = projectedMonthEnd(daily, thisMonth, cumulativeByDay(entries, groupOf, lastMonth, daysInMonth(lastMonth)));
  const finished = totals.slice(0, -1).filter((t) => t.spent > 0); // months that are over and had spending
  const usual = averageOf(finished.map((t) => t.spent));
  const saved = totals.reduce((a, t) => a + t.saved, 0);
  const anything = entries.some((e) => !e.deleted_at);
  const bestDay = weekdays.reduce((a, b) => (b.average > a.average ? b : a), weekdays[0]!);
  const maxAvg = Math.max(1, ...weekdays.map((w) => w.average));
  const maxTotal = Math.max(1, ...trends.map((t) => t.total));
  const vsUsual = pctChange(projected ?? spentNow, usual);

  if (!anything) {
    return (
      <div className={ui.card()}>
        <p className="m-0 text-muted">{tr('Nothing to show yet. Once you log some payments, this page adds them up: month by month, by category, and by day of the week.')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="border-0 p-0 mx-0 mt-0 mb-3.5 flex flex-wrap gap-2" role="group" aria-label={tr('How many months')}>
        {RANGES.map((r) => (
          <button key={r} type="button" className={ui.chip} aria-pressed={range === r} onClick={() => setRange(r)}>{tr('{0} months', r)}</button>
        ))}
      </div>

      <div className={ui.card()}>
        <h3 className="text-[16px] m-0 mb-2.5 text-ink">{tr('Spending by month')}</h3>
        <BarChart
          label={tr('Spending by month')}
          values={range <= 6}
          items={totals.map((t) => ({ key: t.month, label: monthShort(t.month), value: t.spent, partial: t.month === thisMonth }))}
        />
        <ul className="list-none mt-3 mx-0 mb-0 p-0 text-[14px] [&>li]:mb-1">
          {usual > 0 && <li>{tr('A usual month so far: {0}.', rupees(usual))}</li>}
          <li>{tr('{0} so far this month.', rupees(spentNow))}{usual > 0 && day < daysInMonth(thisMonth) && ` ${tr('The lighter bar is this month, not over yet.')}`}</li>
          {projected !== null && day < daysInMonth(thisMonth) && (
            <li>
              {tr('Likely by the end of the month: about {0}', rupees(projected))}
              {vsUsual !== null && usual > 0 && <> {tr('({0} against a usual month).', pct(vsUsual))}</>}
            </li>
          )}
          {saved > 0 && <li>{tr('Put aside in these {0} months: {1}.', range, rupees(saved))}</li>}
        </ul>
      </div>

      <div className={ui.card()}>
        <h3 className="text-[16px] m-0 mb-1 text-ink">{tr('Categories')}</h3>
        <p className="text-muted text-[13px] mt-0 mb-2.5">{tr('The categories that took the most in these {0} months, and how {1} compares with the same days of last month.', range, monthLabel(thisMonth))}</p>
        {trends.length === 0 ? <p className="text-muted m-0">{tr('No spending in this time.')}</p> : (
          <ul className={ui.list(true)}>
            {trends.map((t) => (
              <li key={t.category} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <b className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{t.category}</b>
                  <span className="flex items-center gap-2.5 flex-none">
                    <Sparkline values={t.values} label={tr('{0} by month', t.category)} />
                    <span className="tabular-nums font-semibold min-w-[72px] text-right">{rupees(t.total)}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1.5 mb-1" aria-hidden="true"><i className={ui.barFill()} style={{ width: `${Math.max(2, (t.total / maxTotal) * 100)}%` }} /></div>
                <p className="m-0 text-[13px] text-muted">
                  {tr('{0} this month', rupees(t.thisMonth))}
                  {t.change !== null ? <> · <span className={t.change > 0.1 ? 'text-bad' : t.change < -0.1 ? 'text-good' : ''}>{t.change > 0 ? '▲' : t.change < 0 ? '▼' : ''} {pct(t.change)} {tr('against the same days last month')}</span></> : t.thisMonth > 0 ? <> · {tr('new this month')}</> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {shares.length > 1 && (
        <div className={ui.card()}>
          <h3 className="text-[16px] m-0 mb-2.5 text-ink">{tr('This month by group')}</h3>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {shares.map((g) => (
              <li key={g.group}>
                <div className="flex justify-between text-[14px]"><span>{tr(g.group)}</span><span className="tabular-nums"><b>{rupees(g.total)}</b> <span className="text-muted">{Math.round(g.share * 100)}%</span></span></div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1 mb-0" aria-hidden="true"><i className={ui.barFill()} style={{ width: `${Math.max(2, g.share * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={ui.card()}>
        <h3 className="text-[16px] m-0 mb-1 text-ink">{tr('Which days')}</h3>
        <p className="text-muted text-[13px] mt-0 mb-2.5">{tr('What a day of the week costs on average, over the last 90 days.')}</p>
        <BarChart
          label={tr('Average spending by day of the week')}
          height={96}
          values={false}
          items={weekdays.map((w) => ({ key: String(w.weekday), label: weekdayShort(w.weekday), value: w.average, partial: w.average < maxAvg }))}
        />
        {bestDay.average > 0 && <p className="mt-2.5 mb-0 text-[14px]">{tr('Most on {0}: about {1} a day.', weekdayShort(bestDay.weekday), rupees(bestDay.average))}</p>}
      </div>

      <div className={ui.card()}>
        <h3 className="text-[16px] m-0 mb-2.5 text-ink">{tr('Biggest payments this month')}</h3>
        {biggest.length === 0 ? <p className="text-muted m-0">{tr('Nothing spent yet this month.')}</p> : (
          <ul className={ui.list(true)}>
            {biggest.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="min-w-0"><b>{e.category}</b><br /><small className="text-muted">{shortDate(e.entry_date)}{e.note ? ` · ${e.note}` : ''}</small></span>
                <span className="font-bold tabular-nums flex-none">{fmtINR(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {goals.length > 0 && (
        <div className={ui.card()}>
          <h3 className="text-[16px] m-0 mb-2.5 text-ink">{tr('Goals')}</h3>
          <ul className={ui.list(true)}>
            {goals.map(({ goal, progress, line }) => (
              <li key={goal.id} className="py-2.5">
                <div className="flex justify-between gap-3"><b className="min-w-0">{goal.n}</b><span className="tabular-nums flex-none">{fmtINR(progress.saved)} <span className="text-muted text-[13px]">{tr('of {0}', fmtINR(goal.a))}</span></span></div>
                <div className={ui.meter(line.state === 'reached' ? 'good' : line.state === 'passed' ? 'bad' : 'accent', 'mt-1.5 mb-1')} aria-hidden="true"><i style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
                <p className="m-0 text-[13px] text-muted">
                  {line.state === 'reached' ? tr('Reached') : line.state === 'passed' ? tr('The date has passed') : tr('Needs {0} a month', fmtINR(line.monthly))}
                  {' · '}{tr('by {0}', shortDate(goal.d))}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted text-[13px]">{tr('Shared expenses count at your own share, and what you put in a Saving category is not counted as spending. All of this is worked out on this phone, from your payments: nothing is sent anywhere.')}</p>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { activeGoals, goalLine, goalProgress } from '../../core/goals.ts';
import { averageOf, biggestPayments, categoryTrends, cumulativeByDay, groupLookup, groupShares, monthlyTotals, monthsEnding, pctChange, projectedMonthEnd, weekdaySpend } from '../../core/analytics.ts';
import { monthLabel, monthShort, shortDate, weekdayShort } from '../../core/format.ts';
import { budgetEntries, daysInMonth, fmtINR, isoDate, monthOf } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';
import * as ui from '../../ui/styles.ts';
import { Sparkline } from './charts.tsx';

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
  const spend = useSpendEntries();
  const entries = useMemo(() => budgetEntries(spend, app.me), [spend, app.me]);
  const groupOf = useMemo(() => groupLookup(app.categories), [app.categories]);
  const months = useMemo(() => monthsEnding(thisMonth, range), [thisMonth, range]);
  const totals = useMemo(() => monthlyTotals(entries, groupOf, months), [entries, groupOf, months]);
  const trends = useMemo(() => categoryTrends(entries, groupOf, months, 8, Number(today.slice(8, 10))), [entries, groupOf, months, today]);
  const weekdays = useMemo(() => weekdaySpend(entries, groupOf, today, 90), [entries, groupOf, today]);
  const biggest = useMemo(() => biggestPayments(entries, groupOf, thisMonth, 5), [entries, groupOf, thisMonth]);
  const shares = useMemo(() => groupShares(entries, groupOf, thisMonth), [entries, groupOf, thisMonth]);
  const goals = useMemo(() => activeGoals(app.goals).map((goal) => {
    const progress = goalProgress(goal, app.goals, entries);
    return { goal, progress, line: goalLine(goal, progress, today) };
  }), [app.goals, entries, today]);

  const day = Number(today.slice(8, 10));
  const daily = cumulativeByDay(entries, groupOf, thisMonth, day);
  const spentNow = daily.at(-1) ?? 0;
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

  const top = Math.max(1, ...totals.map((t) => t.spent), projected ?? 0, usual) * 1.08;
  const px = (v: number) => `${Math.round((v / top) * 170)}px`;
  const cats = trends.filter((t) => t.group === 'Spending' && (t.thisMonth > 0 || t.lastMonth > 0)).sort((a, b) => b.thisMonth - a.thisMonth);
  const lastName = monthLabel(lastMonth).split(' ')[0];
  const dayTop = Math.max(1, ...weekdays.map((w) => w.average));

  if (!anything) {
    return <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('Nothing to show yet. Once you log some payments, this page adds them up: month by month, by category, and by day of the week.')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="radiogroup" aria-label={tr('How many months')}>
        {RANGES.map((r) => (
          <button key={r} type="button" role="radio" className={ui.chip} aria-checked={range === r} aria-pressed={range === r} onClick={() => setRange(r)}>{tr('{0} months', r)}</button>
        ))}
      </div>
      <div className="grid gap-x-6 gap-y-4 items-start lg:grid-cols-2">
        <section className={CARD}>
          <h3 className={H}>{tr('Spending by month')}</h3>
          <div className="relative h-[170px] flex items-end gap-2.5 border-b border-line" role="img" aria-label={tr('Spending by month') + ': ' + totals.map((t) => `${monthShort(t.month)} ${rupees(t.spent)}`).join(', ')}>
            {usual > 0 && <span className="absolute inset-x-0 border-t-2 border-dashed border-muted" style={{ bottom: px(usual) }} aria-hidden="true" />}
            {usual > 0 && <span className="absolute right-0 px-1 bg-card text-[11px] text-muted" style={{ bottom: `calc(${px(usual)} + 4px)` }} aria-hidden="true">{tr('a usual month {0}', rupees(usual))}</span>}
            {totals.map((t) => {
              const now = t.month === thisMonth;
              return (
                <span key={t.month} className="relative flex-1 h-full flex flex-col justify-end" aria-hidden="true">
                  {now && projected !== null && day < daysInMonth(thisMonth) && <span className="absolute inset-x-0 bottom-0 border-2 border-b-0 border-dashed border-accent rounded-t-md" style={{ height: px(projected) }} />}
                  <span className={ui.cx('relative rounded-t-md', now ? 'bg-accent' : 'bg-bar-grey')} style={{ height: px(t.spent) }} />
                </span>
              );
            })}
          </div>
          <div className="flex gap-2.5 text-[12px] text-muted" aria-hidden="true">{totals.map((t) => <span key={t.month} className="flex-1 text-center">{monthShort(t.month)}</span>)}</div>
          <p className="m-0 text-[14px] leading-5 text-muted">
            {tr('{0} so far', monthLabel(thisMonth).split(' ')[0])} <strong className="text-ink">{rupees(spentNow)}</strong>.
            {projected !== null && day < daysInMonth(thisMonth) && <> {tr('The dashed outline is likely by the end of the month:')} <strong className="text-ink">{rupees(projected)}</strong>{vsUsual !== null && usual > 0 ? ` (${tr('{0} against a usual month', pct(vsUsual))})` : ''}.</>}
            {saved > 0 && <> {tr('Put aside in these {0} months: {1}.', range, rupees(saved))}</>}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className={H}>{tr('Categories')}</h3>
          <p className="m-0 text-[13px] text-muted">{tr('This month, against the same {0} days of {1}', day, lastName)}</p>
          {cats.length === 0 ? <p className="m-0 text-muted">{tr('No spending in this time.')}</p> : (
            <ul className="list-none m-0 px-4 bg-card border border-line rounded-card">
              {cats.map((t, i) => {
                const d = Math.round(t.thisMonth - t.lastMonth);
                return (
                  <li key={t.category} className={ui.cx('grid grid-cols-[minmax(0,1fr)_80px_96px] gap-2.5 items-center min-h-14', i > 0 && 'border-t border-line')}>
                    <span className="text-[15px] font-semibold truncate">{t.category}</span>
                    <Sparkline values={t.values} label={tr('{0} by month', t.category)} />
                    <span className="flex flex-col items-end">
                      <span className="text-[15px] font-bold tabular-nums">{rupees(t.thisMonth)}</span>
                      <span className={ui.cx('text-[12px] font-semibold', d > 0 ? 'text-bad' : d < 0 ? 'text-good' : 'text-muted')}>{d > 0 ? `▲ ${tr('{0} more', rupees(d))}` : d < 0 ? `▼ ${tr('{0} less', rupees(-d))}` : tr('same')}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {shares.length > 1 && (
          <section className={CARD}>
            <h3 className={H}>{tr('This month by group')}</h3>
            {shares.map((g) => (
              <div key={g.group} className="flex flex-col gap-1">
                <div className="flex justify-between text-[14px]"><span className="font-semibold">{tr(g.group)}</span><span><span className="text-muted">{Math.round(g.share * 100)}%</span> · <strong className="tabular-nums">{rupees(g.total)}</strong></span></div>
                <span className="flex h-2 rounded-full bg-track" aria-hidden="true"><span className="rounded-full bg-accent" style={{ width: `${Math.max(2, g.share * 100)}%` }} /></span>
              </div>
            ))}
            {totals.at(-1)?.saved ? <p className="m-0 text-[13px] text-muted">{tr('Saving is kept apart: {0} put by this month.', rupees(totals.at(-1)!.saved))}</p> : null}
          </section>
        )}

        <section className={CARD}>
          <h3 className={H}>{tr('Which days')}</h3>
          <div className="h-[110px] flex items-end gap-2" role="img" aria-label={tr('Average spending by day of the week') + ': ' + weekdays.map((w) => `${weekdayShort(w.weekday)} ${rupees(w.average)}`).join(', ')}>
            {weekdays.map((w) => <span key={w.weekday} className={ui.cx('flex-1 rounded-t-md', w.weekday === bestDay.weekday && w.average > 0 ? 'bg-accent' : 'bg-bar-grey')} style={{ height: `${Math.round((w.average / dayTop) * 110)}px` }} aria-hidden="true" />)}
          </div>
          <div className="flex gap-2 text-[12px] text-muted" aria-hidden="true">{weekdays.map((w) => <span key={w.weekday} className="flex-1 text-center">{weekdayShort(w.weekday)}</span>)}</div>
          {bestDay.average > 0 && <p className="m-0 text-[14px] leading-5">{tr('Most on {0}: about {1} a day, over the last 90 days.', weekdayShort(bestDay.weekday), rupees(bestDay.average))}</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className={H}>{tr('Biggest payments this month')}</h3>
          {biggest.length === 0 ? <p className="m-0 text-muted">{tr('Nothing spent yet this month.')}</p> : (
            <ul className="list-none m-0 px-4 bg-card border border-line rounded-card">
              {biggest.map((e, i) => {
                const [head, ...rest] = e.note.split(' · ');
                return (
                  <li key={e.id} className={ui.cx('grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[58px]', i > 0 && 'border-t border-line')}>
                    <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold truncate">{head || e.category}</span><span className="text-[13px] text-muted truncate">{[head ? e.category : '', shortDate(e.entry_date), ...rest].filter(Boolean).join(' · ')}</span></span>
                    <span className="text-[15px] font-bold tabular-nums">{fmtINR(e.amount)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {goals.length > 0 && (
          <section className={CARD}>
            <h3 className={H}>{tr('Goals')}</h3>
            {goals.map(({ goal, progress, line }) => (
              <div key={goal.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3 text-[14px]"><span className="font-semibold min-w-0 truncate">{goal.n}</span><span className="tabular-nums flex-none">{tr('{0} of {1}', fmtINR(progress.saved), fmtINR(goal.a))}</span></div>
                <span className="flex h-2 rounded-full bg-track" aria-hidden="true"><span className={ui.cx('rounded-full', line.state === 'reached' ? 'bg-good' : line.state === 'passed' ? 'bg-bad' : 'bg-accent')} style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></span>
              </div>
            ))}
          </section>
        )}
      </div>
      <p className="m-0 text-muted text-[13px]">{tr('Shared expenses count at your own share, and what you put in a Saving category is not counted as spending. All of this is worked out on this device, from your payments: nothing is sent anywhere.')}</p>
    </div>
  );
}

const CARD = 'flex flex-col gap-3 bg-card border border-line rounded-card p-4';
const H = 'm-0 text-[16px] leading-[22px] font-[650] text-ink';

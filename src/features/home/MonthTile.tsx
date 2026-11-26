import { BentoCard, BentoEmpty } from '../../ui/Bento.tsx';
import { PaceChart } from './PaceChart.tsx';
import { monthStatus, safeLine } from './dashboard.ts';
import type { MonthOverview } from './dashboard.ts';
import type { SafeToSpend } from '../../core/safeToSpend.ts';
import { monthLabel, monthShort } from '../../core/format.ts';
import { fmtINR, shiftMonth } from '../../core/logic.ts';
import * as hs from '../../ui/tileStyles.ts';
import { tr } from '../../core/i18n.ts';

const pct = (f: number): string => { const v = Math.abs(f * 100); return `${v < 100 ? v.toFixed(1) : Math.round(v)}%`; };

// "▲ 12.5% more than last month" (red when spending went up, green when it went down), or "Same as last month".
function MonthDelta({ change }: Readonly<{ change: number | null }>) {
  if (change === null) return null;
  return (
    <span className={hs.delta(change > 0 ? 'bad' : change < 0 ? 'good' : '')}>
      <span aria-hidden="true">{change > 0 ? '▲ ' : change < 0 ? '▼ ' : ''}</span>
      {change === 0 ? tr('Same as') : <>{pct(change)}<span className="sr-only">{change > 0 ? ' more than' : ' less than'}</span></>}{' '}{tr('last month')}
    </span>
  );
}

// The month's spending by day against last month, with its legend; before there is anything to draw, an invitation to add a payment.
function SpendingPace({ ov, projected, month, openAdd }: Readonly<{ ov: MonthOverview; projected: number | null; month: string; openAdd: () => void }>) {
  const toDate = ov.daily.at(-1) ?? 0;
  if (toDate === 0 && (ov.lastDaily.at(-1) ?? 0) === 0) {
    // nothing to draw yet: a flat line at zero would say less than these words
    return <BentoEmpty cta={tr('Add expense')} onCta={openAdd}>{tr('No spending logged this month or last (savings are not counted here). Your spending by day shows here once you log a payment.')}</BentoEmpty>;
  }
  const mon = monthShort(month);
  const lastMon = monthShort(shiftMonth(month, -1));
  const paceLabel = tr('Spending this month by day: {0} by {1} {2}; last month {3} by the same day', fmtINR(toDate), ov.day, mon, fmtINR(ov.lastToDate))
    + (ov.budgeted ? tr('; budget {0}.', fmtINR(ov.budget)) : '.');
  return (
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
  );
}

// The big green tile: what was spent this month, how it compares, what is left, what is safe to spend a day, and the pace chart.
export function MonthTile({ ov, safe, projected, month, onOpen, openAdd }: Readonly<{ ov: MonthOverview; safe: SafeToSpend | null; projected: number | null; month: string; onOpen: () => void; openAdd: () => void }>) {
  const status = monthStatus(ov);
  const safeText = safeLine(safe);
  return (
    <BentoCard title={tr('This month')} span={8} hero onOpen={onOpen} openLabel={`Open ${monthLabel(month)}: groups, categories and budgets`}>
      <div className={hs.heroTop}>
        <div>
          <p className={hs.heroNum}>{fmtINR(ov.spent)}</p>
          <p className={hs.note}>{tr('spent{0} · savings not counted', ov.budgeted ? tr(' of {0} budget', fmtINR(ov.budget)) : '')}</p>
        </div>
        <MonthDelta change={ov.change} />
      </div>
      <p className={hs.status(status.tone)}>{status.text}</p>
      {safeText && <p className={hs.note}>{safeText}</p>}
      <SpendingPace ov={ov} projected={projected} month={month} openAdd={openAdd} />
    </BentoCard>
  );
}

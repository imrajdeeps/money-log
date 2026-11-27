import { BentoCard } from '../../ui/Bento.tsx';
import { PaceChart } from './PaceChart.tsx';
import { monthStatus, safeLine } from './dashboard.ts';
import type { MonthOverview } from './dashboard.ts';
import type { SafeToSpend } from '../../core/safeToSpend.ts';
import { monthLabel, monthShort } from '../../core/format.ts';
import { fmtINR, shiftMonth } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import * as hs from '../../ui/tileStyles.ts';
import { tr } from '../../core/i18n.ts';

const pct = (f: number): string => { const v = Math.abs(f * 100); return `${v < 100 ? v.toFixed(1) : Math.round(v)}%`; };

// "▼ 5.4% less than last month" (lime when spending went down, pink when it went up), or "Same as last month".
function MonthDelta({ change }: Readonly<{ change: number | null }>) {
  if (change === null) return null;
  if (change === 0) return <span className={hs.heroPill('good')}>{tr('Same as last month')}</span>;
  return (
    <span className={hs.heroPill(change > 0 ? 'bad' : 'good')}>
      <span aria-hidden="true">{change > 0 ? '▲ ' : '▼ '}</span>
      {change > 0 ? tr('{0} more than last month', pct(change)) : tr('{0} less than last month', pct(change))}
    </span>
  );
}

// The month's spending by day against last month, the day labels and the legend.
function SpendingPace({ ov, projected, month }: Readonly<{ ov: MonthOverview; projected: number | null; month: string }>) {
  const toDate = ov.daily.at(-1) ?? 0;
  const mon = monthShort(month);
  const lastMon = monthShort(shiftMonth(month, -1));
  const paceLabel = tr('Spending this month by day: {0} by {1} {2}; last month {3} by the same day', fmtINR(toDate), ov.day, mon, fmtINR(ov.lastToDate))
    + (ov.budgeted ? tr('; budget {0}.', fmtINR(ov.budget)) : '.');
  const showProj = projected !== null && ov.day < ov.days;
  return (
    <>
      <PaceChart daily={ov.daily} lastDaily={ov.lastDaily} days={ov.days} budget={ov.budgeted ? ov.budget : 0} projected={showProj ? projected : null} label={paceLabel} />
      <div className={hs.paceAxis} aria-hidden="true"><span>1 {mon}</span><span>{tr('Today, {0} {1}', ov.day, mon)}</span><span>{ov.days} {mon}</span></div>
      <ul className={hs.legend}>
        <li><i className={hs.key.now} aria-hidden="true" />{tr('This month')} {fmtINR(toDate)}</li>
        <li><i className={hs.key.last} aria-hidden="true" />{tr('{0}, by day {1}', lastMon, Math.min(ov.day, ov.lastDaily.length))} {fmtINR(ov.lastToDate)}</li>
        {showProj && <li><i className={hs.key.proj} aria-hidden="true" />{tr('Likely by month end')} {fmtINR(Math.round(projected))}</li>}
        {ov.budgeted && <li><i className={hs.key.budget} aria-hidden="true" />{tr('Budget')} {fmtINR(ov.budget)}</li>}
      </ul>
    </>
  );
}

const LIME_BTN = 'relative z-[2] inline-flex items-center min-h-12 px-[18px] rounded-xl border-0 bg-primary text-primary-ink text-[16px] font-bold cursor-pointer [font-family:inherit]';
const OUTLINE_BTN = 'relative z-[2] inline-flex items-center min-h-12 px-[18px] rounded-xl border border-[rgba(255,255,255,0.35)] bg-transparent text-[#fff] text-[16px] font-[650] cursor-pointer [font-family:inherit]';

export type MonthTileState = 'full' | 'getting' | 'empty';

interface Props {
  state: MonthTileState;
  ov: MonthOverview;
  safe: SafeToSpend | null;
  projected: number | null;
  month: string;
  count: number; // payments logged so far (the getting-started words)
  onOpen: () => void;
  openAdd: () => void;
  openBudgets: () => void;
}

// The big green tile: what was spent this month, how it compares, what is left, what is safe to spend a day, and the pace chart.
// While the person is getting started it says what is coming; with no payments at all it asks for the first one.
export function MonthTile({ state, ov, safe, projected, month, count, onOpen, openAdd, openBudgets }: Readonly<Props>) {
  if (state === 'empty') {
    return (
      <BentoCard title={tr('This month')} span={8} hero gap={10} chevron onOpen={onOpen} openLabel={`Open ${monthLabel(month)}: groups, categories and budgets`}>
        <p className="m-0 text-[28px] leading-[34px] font-[750]">{tr('No payments yet')}</p>
        <p className="m-0 text-[16px] leading-[23px] text-[#dce9df]">{tr('Write down what you spent today. It takes about five seconds, and it stays on this device.')}</p>
        <button type="button" className={ui.cx(LIME_BTN, 'self-start min-h-[52px] mt-1.5 px-5 text-[17px]')} onClick={openAdd}>{tr('Add your first expense')}</button>
      </BentoCard>
    );
  }
  if (state === 'getting') {
    return (
      <BentoCard title={tr('This month')} span={8} hero gap={10} chevron onOpen={onOpen} openLabel={`Open ${monthLabel(month)}: groups, categories and budgets`}>
        <span className="text-[40px] leading-[1.05] font-extrabold">{fmtINR(ov.spent)}</span>
        <span className="text-[14px] text-muted">{tr('spent so far · {0} payments logged', count)}</span>
        <p className="m-0 mt-1 text-[16px] leading-[23px]">{tr('Log a few more and this tile shows your month: how much is left, what a day can take, and how it compares with last month.')}</p>
        <div className="flex flex-wrap gap-2.5 pt-1.5">
          <button type="button" className={LIME_BTN} onClick={openAdd}>{tr('Add expense')}</button>
          <button type="button" className={OUTLINE_BTN} onClick={openBudgets}>{tr('Set budgets')}</button>
        </div>
      </BentoCard>
    );
  }
  const status = monthStatus(ov);
  const safeText = safeLine(safe);
  return (
    <BentoCard title={tr('This month')} span={8} tall hero gap={10} chevron onOpen={onOpen} openLabel={`Open ${monthLabel(month)}: groups, categories and budgets`}>
      <div className={hs.heroTop}>
        <div className="flex flex-col gap-0.5">
          <span className={hs.heroNum}>{fmtINR(ov.spent)}</span>
          <span className={hs.heroSub}>{tr('spent{0} · savings not counted', ov.budgeted ? tr(' of {0} budget', fmtINR(ov.budget)) : '')}</span>
        </div>
        <MonthDelta change={ov.change} />
      </div>
      <p className={hs.heroStatus(status.tone)}>{status.text}</p>
      {safeText && <p className={hs.heroSafe}>{safeText}</p>}
      <SpendingPace ov={ov} projected={projected} month={month} />
    </BentoCard>
  );
}

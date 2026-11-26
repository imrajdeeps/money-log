import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import * as ui from '../../ui/styles.ts';
import { cashFlow, cashFlowSeries } from '../../core/income.ts';
import { groupLookup, monthlyTotals, monthsEnding } from '../../core/analytics.ts';
import { monthShort } from '../../core/format.ts';
import { budgetEntries, fmtINR, isoDate, monthOf } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';

const MONTHS_SHOWN = 6;

// The month's money in and out, as on the design: In, Out, Saved and Left (after spending and saving), and the last six months as bars
// and as a table. Worked out on this phone from the entries already here.
export function CashFlowScreen({ onAdd }: Readonly<{ onAdd: () => void }>) {
  const app = useApp();
  const month = monthOf(isoDate());
  const groupOf = useMemo(() => groupLookup(app.categories), [app.categories]);
  const spend = useSpendEntries(); // your own payments, plus your share of friends' group expenses where that counts
  const flow = useMemo(() => cashFlow(spend, app.me, groupOf, month), [spend, app.me, groupOf, month]);
  const months = useMemo(() => monthsEnding(month, MONTHS_SHOWN), [month]);
  const series = useMemo(() => cashFlowSeries(spend, app.me, groupOf, months), [spend, app.me, groupOf, months]);
  const saves = useMemo(() => monthlyTotals(budgetEntries(spend, app.me), groupOf, months).map((t) => t.saved), [spend, app.me, groupOf, months]);
  const rows = series.map((p, i) => ({ ...p, outAll: p.out + (saves[i] ?? 0), left: p.income - p.out - (saves[i] ?? 0) }));
  const left = flow.left - flow.saved;
  const empty = flow.income === 0 && flow.out === 0 && flow.saved === 0;
  const top = Math.max(1, ...rows.flatMap((r) => [r.income, r.outAll]));
  const h = (v: number) => `${Math.max(v > 0 ? 3 : 0, Math.round((v / top) * 100))}%`;

  return (
    <section aria-label={tr('Monthly cash flow')} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[tr('In'), flow.income, ''], [tr('Out'), flow.out, ''], [tr('Saved'), flow.saved, ''], [tr('Left'), left, left >= 0 ? 'text-good' : 'text-bad']].map(([l, v, c]) => (
          <div key={String(l)} className="flex flex-col gap-1 bg-card border border-line rounded-card p-3.5">
            <span className="text-[13px] text-muted">{l}</span>
            <span className={ui.cx('text-[21px] leading-[26px] font-bold tabular-nums', String(c))}>{fmtINR(Number(v))}</span>
          </div>
        ))}
      </div>
      {empty ? (
        <div className="flex flex-col gap-2.5 bg-card border border-line rounded-card p-[18px]">
          <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('Nothing logged for this month yet. Add what you received (salary, refunds, cashback) and what you spent, and the month shows here.')}</p>
          <button type="button" className={ui.btn('solid', 'none', 'self-start min-h-12 px-[18px]')} onClick={onAdd}>{tr('Add income')}</button>
        </div>
      ) : (
        <p className="m-0 text-[15px] leading-[22px]">
          {left >= 0 ? <>{tr('You have')} <strong>{tr('{0} left', fmtINR(left))}</strong> {tr('this month after spending and saving.')}</> : <>{tr('This month')} <strong>{tr('{0} more went out', fmtINR(-left))}</strong> {tr('than came in, counting savings.')}</>}
        </p>
      )}
      <div className="grid gap-x-6 gap-y-4 items-start lg:grid-cols-2">
        <section className="flex flex-col gap-3 bg-card border border-line rounded-card p-4">
          <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Six months')}</h3>
          <div className="h-40 flex items-end gap-3.5 border-b border-line" role="img" aria-label={tr('Money in and out, month by month') + ': ' + rows.map((r) => `${monthShort(r.month)} ${tr('In')} ${fmtINR(r.income)}, ${tr('Out')} ${fmtINR(r.outAll)}`).join('; ')}>
            {rows.map((r) => (
              <span key={r.month} className="flex-1 h-full flex items-end gap-[3px]" aria-hidden="true">
                <span className="flex-1 rounded-t bg-accent" style={{ height: h(r.income) }} />
                <span className="flex-1 rounded-t bg-bar-out" style={{ height: h(r.outAll) }} />
              </span>
            ))}
          </div>
          <div className="flex gap-3.5 text-[12px] text-muted" aria-hidden="true">{rows.map((r) => <span key={r.month} className="flex-1 text-center">{monthShort(r.month)}</span>)}</div>
          <div className="flex gap-4 text-[13px] text-muted" aria-hidden="true">
            <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-[3px] bg-accent" />{tr('In')}</span>
            <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-[3px] bg-bar-out" />{tr('Out (spent and saved)')}</span>
          </div>
        </section>
        <section className="bg-card border border-line rounded-card px-4">
          <div className="grid grid-cols-4 gap-2 min-h-11 items-center text-[12px] font-semibold text-muted uppercase tracking-[0.04em]"><span>{tr('Month')}</span><span className="text-right">{tr('In')}</span><span className="text-right">{tr('Out')}</span><span className="text-right">{tr('Left')}</span></div>
          {rows.map((r) => (
            <div key={r.month} className="grid grid-cols-4 gap-2 min-h-12 items-center border-t border-line text-[14px] tabular-nums">
              <span className="font-semibold">{monthShort(r.month)}</span>
              <span className="text-right">{fmtINR(r.income)}</span>
              <span className="text-right">{fmtINR(r.outAll)}</span>
              <span className={ui.cx('text-right font-bold', r.left >= 0 ? 'text-good' : 'text-bad')}>{fmtINR(r.left)}</span>
            </div>
          ))}
        </section>
      </div>
      {!empty && <button type="button" className={ui.btn('outline', 'none', 'self-start min-h-12 px-[18px]')} onClick={onAdd}>{tr('Add income')}</button>}
    </section>
  );
}

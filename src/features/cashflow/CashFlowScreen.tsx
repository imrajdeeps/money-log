import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { Icon } from '../../ui/Icon.tsx';
import * as ui from '../../ui/styles.ts';
import { biggestOutflows, cashFlow, cashFlowSeries } from '../../core/income.ts';
import { groupLookup, monthsEnding } from '../../core/analytics.ts';
import { monthLabel, monthShort, shortDate } from '../../core/format.ts';
import { fmtINR, isoDate, monthOf, shiftMonth } from '../../core/logic.ts';
import { FlowBars } from '../analytics/index.ts';
import { tr } from '../../core/i18n.ts';

const MONTHS_SHOWN = 6;
const whole = (f: number): string => `${Math.round(f * 100)}%`;

function Figure({ label, value, tone }: Readonly<{ label: string; value: string; tone?: 'good' | 'bad' }>) {
  return (
    <div className={ui.groupTile(false)}>
      <h3>{label}</h3>
      <p className={`${ui.bigNum}${tone ? ` text-${tone}` : ''}`}>{value}</p>
    </div>
  );
}

// The month's money in and out: what came in, what went out (savings apart), what is left, where the income came from, the biggest
// outflows and the last six months side by side. Worked out on this phone from the entries already here.
export function CashFlowScreen({ onAdd }: Readonly<{ onAdd: () => void }>) {
  const app = useApp();
  const current = monthOf(isoDate());
  const [month, setMonth] = useState(current);
  const groupOf = useMemo(() => groupLookup(app.categories), [app.categories]);
  const flow = useMemo(() => cashFlow(app.entries, app.me, groupOf, month), [app.entries, app.me, groupOf, month]);
  const series = useMemo(() => cashFlowSeries(app.entries, app.me, groupOf, monthsEnding(month, MONTHS_SHOWN)), [app.entries, app.me, groupOf, month]);
  const biggest = useMemo(() => biggestOutflows(app.entries, app.me, groupOf, month), [app.entries, app.me, groupOf, month]);
  const empty = flow.income === 0 && flow.out === 0 && flow.saved === 0;
  const leftTone = flow.left >= 0 ? 'good' : 'bad';

  return (
    <section aria-label={tr('Monthly cash flow')}>
      <div className="flex items-center justify-between mb-3 [&_h2]:m-0">
        <button type="button" className={ui.btn('ghost', 'sq')} aria-label={tr('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><span className="inline-flex rotate-180"><Icon name="chevron" size={22} /></span></button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <button type="button" className={ui.btn('ghost', 'sq')} aria-label={tr('Next month')} disabled={month >= current} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron" size={22} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <Figure label={tr('Money in')} value={fmtINR(flow.income)} tone={flow.income > 0 ? 'good' : undefined} />
        <Figure label={tr('Money out')} value={fmtINR(flow.out)} />
        <Figure label={tr('Left')} value={fmtINR(flow.left)} tone={empty ? undefined : leftTone} />
        <Figure label={tr('Saved')} value={fmtINR(flow.saved)} />
      </div>

      <p className="text-muted text-[13px] mt-0">
        {flow.kept !== null && flow.left > 0 ? tr('You kept {0} of what came in. ', whole(flow.kept)) : ''}
        {tr('Money out is your spending, with savings counted apart. A friend paying back a shared expense is not income.')}
      </p>

      {empty && (
        <div className={ui.card('notice')}>
          <p>{tr('Nothing logged for this month yet. Add what you received (salary, refunds, cashback) and what you spent, and the month shows here.')}</p>
          <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={onAdd}>{tr('Add income')}</button>
        </div>
      )}

      <div className={ui.card()}>
        <h3 className="text-[16px] m-0 mb-2.5 text-ink">{tr('Money in and out, month by month')}</h3>
        <FlowBars
          label={tr('Money in and out, month by month')}
          inLabel={tr('In')}
          outLabel={tr('Out')}
          items={series.map((p) => ({ key: p.month, label: monthShort(p.month), income: p.income, out: p.out, partial: p.month === current }))}
        />
      </div>

      {flow.incomeBy.length > 0 && (
        <div className={ui.card()}>
          <h3 className="text-[16px] m-0 mb-2.5 text-ink">{tr('Where the money came from')}</h3>
          <ul className={ui.list(true, 'my-0')}>
            {flow.incomeBy.map((c) => (
              <li key={c.category} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                <span>{c.category} <small className="text-muted">{whole(c.amount / flow.income)}</small></span>
                <b className="tabular-nums text-good">{fmtINR(c.amount)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {biggest.length > 0 && (
        <div className={ui.card()}>
          <h3 className="text-[16px] m-0 mb-2.5 text-ink">{tr('Biggest payments this month')}</h3>
          <ul className={ui.list(true, 'my-0')}>
            {biggest.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                <span>{e.category} <small className="text-muted">{shortDate(e.entry_date)}</small></span>
                <b className="tabular-nums">{fmtINR(e.amount)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

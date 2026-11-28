import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { dayBeforeMonth, whyItMoved } from '../../core/accounts.ts';
import type { WhyMoved as Why } from '../../core/accounts.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import { signed } from './accountText.ts';
import type { WorthView } from './useWorth.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Why net worth moved this month (version 2.3, from the design): what was saved, markets, interest and the rest, the money moved between
// your own accounts (which changed nothing), and how much of what came in you kept.

/** This month's "why", for the Plan card and this page. */
export function useWhy(view: WorthView): Why {
  const app = useApp();
  const from = dayBeforeMonth(view.today);
  return useMemo(() => whyItMoved(app.goals, view.entries, app.me, view.summary.net, from, view.today), [app.goals, view.entries, app.me, view.summary.net, from, view.today]);
}

/** "91% from what you saved, 8% markets, 1% everything else", of the parts that raised it. */
function shares(w: Why): string {
  const parts = [{ n: tr('from what you saved'), v: w.saved }, { n: tr('markets'), v: w.markets }, { n: tr('interest'), v: w.interest }, { n: tr('everything else'), v: w.other }].filter((p) => p.v > 0);
  const total = parts.reduce((s, p) => s + p.v, 0);
  return total > 0 ? parts.map((p) => `${Math.round((p.v / total) * 100)}% ${p.n}`).join(', ') : '';
}

export function WhyRows({ w }: Readonly<{ w: Why }>) {
  const rows = [
    { n: tr('You saved'), v: w.saved, show: true },
    { n: tr('Markets'), v: w.markets, show: w.markets !== 0 },
    { n: tr('Interest, estimated'), v: w.interest, show: w.interest !== 0 },
    { n: tr('Everything else'), v: w.other, show: w.change !== null && w.other !== 0 },
  ].filter((r) => r.show);
  return (
    <ul className="list-none m-0 p-0">
      {rows.map((r, i) => (
        <li key={r.n} className={ui.cx('flex justify-between items-center min-h-12', i > 0 && 'border-t border-line')}>
          <span className="text-[15px]">{r.n}</span>
          <span className={ui.cx('text-[15px] font-bold tabular-nums', r.v >= 0 ? 'text-good' : 'text-bad')}>{signed(r.v)}</span>
        </li>
      ))}
    </ul>
  );
}

export function WhyMoved({ view, onDone }: Readonly<{ view: WorthView; onDone: () => void }>) {
  const w = useWhy(view);
  const start = `${view.today.slice(0, 7)}-01`;
  const split = shares(w);
  return (
    <section className="flex flex-col gap-3 bg-card border border-line rounded-card p-4" aria-label={tr('Why your net worth moved')}>
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 text-[20px] font-bold">{tr('Why your net worth moved')}</h3>
        <p className="m-0 text-[13px] text-muted">{tr('{0} to {1}. Money moved between your own accounts does not count as a change.', shortDate(start), shortDate(view.today))}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-muted">{tr('Net worth, {0}', shortDate(view.today))}</span>
        <span className="text-[30px] leading-[36px] font-extrabold tabular-nums">{fmtINR(w.end)}</span>
        {w.change !== null && <span className={ui.cx('text-[14px] font-bold', w.change >= 0 ? 'text-good' : 'text-bad')}>{w.change >= 0 ? `▲ ${tr('Up {0} since {1}', fmtINR(w.change), shortDate(start))}` : `▼ ${tr('Down {0} since {1}', fmtINR(-w.change), shortDate(start))}`}</span>}
        {split && <span className="text-[13px] text-muted">{split}</span>}
      </div>
      <WhyRows w={w} />
      {w.moved.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="m-0 text-[15px] font-[650]">{tr('Moved, not changed')}</h4>
          <ul className="list-none m-0 p-0">
            {w.moved.map((m, i) => <li key={m.name} className={ui.cx('flex justify-between items-center min-h-11 text-[14px]', i > 0 && 'border-t border-line')}><span>{tr('Into {0}', m.name)}</span><span className="font-semibold tabular-nums">{fmtINR(m.amount)}</span></li>)}
          </ul>
        </div>
      )}
      {w.kept !== null && <p className="m-0 text-[14px]">{w.saved >= 0 ? tr('You kept {0}% of what came in this month.', Math.round(w.kept * 100)) : tr('You spent {0} more than came in this month.', fmtINR(-w.saved))}</p>}
      <button type="button" className={ui.btn('outline')} onClick={onDone}>{tr('Back to Plan')}</button>
    </section>
  );
}

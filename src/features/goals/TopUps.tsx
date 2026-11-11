import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { SwipeRow } from '../../ui/SwipeRow.tsx';
import type { Goal, TopUp } from '../../core/goals.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR, isoDate, parseAmount } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// What has been set aside for a goal by hand: add a top-up (an amount and a day), and see or remove the ones made.
// Slide a top-up to the left and tap the trash to remove it.
export function TopUps({ goal, topUps }: Readonly<{ goal: Goal; topUps: TopUp[] }>) {
  const app = useApp();
  const today = isoDate();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');

  async function add(ev: FormEvent) {
    ev.preventDefault();
    const a = parseAmount(amount);
    if (a === null) return setError(tr('Enter an amount above zero, with at most two decimals.'));
    const problem = await app.addTopUp(goal.id, a, date);
    if (problem) return setError(problem);
    app.toast(tr('Added {0} to {1}', fmtINR(a), goal.n));
    setOpen(false);
    setAmount('');
    setDate(today);
    setError('');
  }

  const total = topUps.reduce((n, t) => n + Math.round(t.a * 100), 0) / 100;
  return (
    <div className="topups">
      {open ? (
        <form onSubmit={add} noValidate className="mt-1">
          <div className={ui.btnRow}>
            <label className={ui.fieldHalf}><span>{tr('Amount (₹)')}</span><input inputMode="decimal" value={amount} placeholder="5000" aria-label={tr('Amount to add to {0}', goal.n)} onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
            <label className={ui.fieldHalf}><span>{tr('Day')}</span><input type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value || today); setError(''); }} /></label>
          </div>
          {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
          <div className={ui.btnRow}>
            <button type="submit" className={ui.btn()}>{tr('Add')}</button>
            <button type="button" className={ui.btn('ghost')} onClick={() => { setOpen(false); setError(''); }}>{tr('Cancel')}</button>
          </div>
        </form>
      ) : (
        <button type="button" className={ui.btn('ghost', 'none', 'min-h-10 px-3.5 py-2.5')} onClick={() => setOpen(true)}>{tr('Add to this goal')}</button>
      )}
      {topUps.length > 0 && (
        <details className={ui.finished('mt-2 mb-0')}>
          <summary>{tr('Top-ups ({0}) · {1}', topUps.length, fmtINR(total))}</summary>
          <ul className={ui.list()}>
            {topUps.map((t) => (
              <SwipeRow key={t.id} className="flex items-center px-3 py-2" label={tr('{0} on {1}', fmtINR(t.a), shortDate(t.d))} onDelete={() => { void app.removeTopUp(t.id).then(() => app.toast(tr('Removed {0} from {1}', fmtINR(t.a), goal.n))); }}>
                <span className={ui.rowMain()}><b>{fmtINR(t.a)}</b><small>{shortDate(t.d)}</small></span>
              </SwipeRow>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

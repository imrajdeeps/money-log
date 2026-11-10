import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { SwipeRow } from '../../ui/SwipeRow.tsx';
import type { Goal, TopUp } from '../../core/goals.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR, isoDate, parseAmount } from '../../core/logic.ts';

// What has been set aside for a goal by hand: add a top-up (an amount and a day), and see or remove the ones made.
// Slide a top-up to the left and tap the trash to remove it.
export function TopUps({ goal, topUps }: { goal: Goal; topUps: TopUp[] }) {
  const app = useApp();
  const today = isoDate();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');

  async function add(ev: FormEvent) {
    ev.preventDefault();
    const a = parseAmount(amount);
    if (a === null) return setError('Enter an amount above zero, with at most two decimals.');
    const problem = await app.addTopUp(goal.id, a, date);
    if (problem) return setError(problem);
    app.toast(`Added ${fmtINR(a)} to ${goal.n}`);
    setOpen(false);
    setAmount('');
    setDate(today);
    setError('');
  }

  const total = topUps.reduce((n, t) => n + Math.round(t.a * 100), 0) / 100;
  return (
    <div className="topups">
      {open ? (
        <form onSubmit={add} noValidate className="topupform">
          <div className="btnrow">
            <label className="field half"><span>Amount (₹)</span><input inputMode="decimal" value={amount} placeholder="5000" aria-label={`Amount to add to ${goal.n}`} onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
            <label className="field half"><span>Day</span><input type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value || today); setError(''); }} /></label>
          </div>
          {error && <p className="msg bad" role="alert">{error}</p>}
          <div className="btnrow">
            <button type="submit" className="btn">Add</button>
            <button type="button" className="btn ghost" onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn ghost topupadd" onClick={() => setOpen(true)}>Add to this goal</button>
      )}
      {topUps.length > 0 && (
        <details className="finished">
          <summary>Top-ups ({topUps.length}) · {fmtINR(total)}</summary>
          <ul className="list">
            {topUps.map((t) => (
              <SwipeRow key={t.id} className="topuprow" label={`${fmtINR(t.a)} on ${shortDate(t.d)}`} onDelete={() => { void app.removeTopUp(t.id).then(() => app.toast(`Removed ${fmtINR(t.a)} from ${goal.n}`)); }}>
                <span className="row-main"><b>{fmtINR(t.a)}</b><small>{shortDate(t.d)}</small></span>
              </SwipeRow>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { netNow, netUpdates, parseNetAmount } from '../../core/goals.ts';
import type { NetUpdate } from '../../core/goals.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { SwipeRow } from '../../ui/SwipeRow.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const SPARK_POINTS = 12; // the last updates the little line shows
const W = 300;
const H = 56;
const PAD = 6;

// A small line through the last updates, oldest on the left. One shared scale, so a fall looks like a fall.
function Spark({ values, label }: Readonly<{ values: number[]; label: string }>) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [PAD + (i * (W - PAD * 2)) / Math.max(1, values.length - 1), H - PAD - ((v - lo) / span) * (H - PAD * 2)] as const);
  const last = pts.at(-1)!;
  return (
    <svg className="mt-3 block h-14 w-full text-accent" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <line x1={last[0]} y1={last[1]} x2={last[0] + 0.01} y2={last[1]} stroke="currentColor" strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Change({ by, since }: Readonly<{ by: number; since: string }>) {
  if (by === 0) return <p className="m-0 text-[14px] text-muted">{tr('No change since {0}', since)}</p>;
  return (
    <p className={`m-0 text-[14px] font-semibold ${by > 0 ? 'text-good' : 'text-bad'}`}>
      {by > 0 ? '▲ ' + tr('Up {0} since {1}', fmtINR(by), since) : '▼ ' + tr('Down {0} since {1}', fmtINR(Math.abs(by)), since)}
    </p>
  );
}

// Typing a new figure: the amount (it can be negative: debts can outweigh what you own) and the day it was true.
function UpdateForm({ onDone }: Readonly<{ onDone: () => void }>) {
  const app = useApp();
  const today = isoDate();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const n = parseNetAmount(amount);
    if (n === null) return setError(tr('Enter your net worth as a number, with at most two decimals. It can be negative.'));
    setBusy(true);
    setError('');
    const problem = await app.addNetWorth(n, date);
    setBusy(false);
    if (problem) return setError(problem);
    app.toast(tr('Net worth saved'));
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3.5 border-t border-line pt-1">
      <label className={ui.field}>
        <span>{tr('Net worth now (₹)')}</span>
        <input inputMode="decimal" autoFocus value={amount} placeholder="6,21,302" onChange={(e) => { setAmount(e.target.value); setError(''); }} />
      </label>
      <label className={ui.field}>
        <span>{tr('As of')}</span>
        <input type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value); setError(''); }} />
      </label>
      <p className="mt-2 mb-0 text-[13px] text-muted">{tr('What you own minus what you owe. Use a minus sign if it is below zero.')}</p>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{tr('Save')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}

function History({ updates }: Readonly<{ updates: NetUpdate[] }>) {
  const app = useApp();
  return (
    <details className="mt-3.5 border-t border-line pt-3">
      <summary className="cursor-pointer text-[14px] font-semibold">{tr('Earlier updates ({0})', updates.length)}</summary>
      <ul className={ui.list(true, 'mt-2.5 mb-0')}>
        {updates.map((u, i) => {
          const before = updates[i + 1];
          const by = before ? Math.round((u.a - before.a) * 100) / 100 : null;
          return (
            <SwipeRow key={u.id} label={shortDate(u.d)} className="px-3.5 py-2.5" onDelete={() => { void app.removeNetWorth(u.id).then(() => app.toast(tr('Removed: {0}', shortDate(u.d)))); }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className={ui.rowMain()}><b>{shortDate(u.d)}</b>{by !== null && by !== 0 && <small className={by > 0 ? 'text-good' : 'text-bad'}>{by > 0 ? '▲' : '▼'} {fmtINR(Math.abs(by))}</small>}</span>
                <b className="tabular-nums">{fmtINR(u.a)}</b>
              </div>
            </SwipeRow>
          );
        })}
      </ul>
      <p className="mt-2 mb-0 text-[13px] text-muted">{tr('Slide an update to the left to remove it.')}</p>
    </details>
  );
}

// The net worth card on the Plan page: the latest figure large, how it moved, a little line of the last updates, and a button
// to enter a new figure. Nothing entered yet: an invitation.
export function NetWorthCard() {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const updates = useMemo(() => netUpdates(app.goals), [app.goals]);
  const now = useMemo(() => netNow(app.goals), [app.goals]);
  const spark = useMemo(() => updates.slice(0, SPARK_POINTS).map((u) => u.a).reverse(), [updates]);

  return (
    <section className={ui.card()} aria-label={tr('Net worth')} id="networth">
      <h3 className="m-0 text-[13px] font-semibold uppercase tracking-wide text-muted">{tr('Net worth')}</h3>
      {now ? (
        <>
          <p className="mt-1 mb-1 text-[34px] font-bold leading-tight tabular-nums">{fmtINR(now.value)}</p>
          <p className="m-0 text-[13px] text-muted">{tr('As of {0}', shortDate(now.date))}</p>
          {now.change !== null && now.previous && <div className="mt-1.5"><Change by={now.change} since={shortDate(now.previous.date)} /></div>}
          {spark.length >= 2 && <Spark values={spark} label={tr('Your last {0} net worth updates, oldest first', spark.length)} />}
        </>
      ) : (
        <p className="mt-1.5 mb-0 text-muted">{tr('Add what you own minus what you owe, and update it now and then. The app keeps each update, so you can see it move.')}</p>
      )}
      {editing ? (
        <UpdateForm onDone={() => setEditing(false)} />
      ) : (
        <button type="button" className={ui.btn(now ? 'ghost' : 'solid', 'md', ui.inCard)} onClick={() => setEditing(true)}>{now ? tr('Update net worth') : tr('Add your net worth')}</button>
      )}
      {updates.length > 1 && <History updates={updates} />}
    </section>
  );
}

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { netNow, netUpdates, parseNetAmount } from '../../core/goals.ts';
import { worthItems, worthSummary } from '../../core/worth.ts';
import { WorthPanel } from './WorthPanel.tsx';
import type { WorthMode } from './WorthPanel.tsx';
import { useAutoLines } from './useAutoLines.ts';
import type { NetUpdate } from '../../core/goals.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { SwipeRow } from '../../ui/SwipeRow.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const SPARK_POINTS = 12; // the last updates the little line shows
const W = 300;
const H = 50;
const PAD = 6;

// A small line through the last updates, oldest on the left (lime in the green tile, with a dot at today's end). One shared scale.
function Spark({ values, label }: Readonly<{ values: number[]; label: string }>) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i * W) / Math.max(1, values.length - 1), H - PAD - ((v - lo) / span) * (H - PAD * 2)] as const);
  const last = pts.at(-1)!;
  return (
    <svg className="block h-[50px] w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke="#c9e96a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <line x1={last[0]} y1={last[1]} x2={last[0] - 0.01} y2={last[1]} stroke="#c9e96a" strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// "▲ Up ₹1,40,000 since 24 Sept" as the hero's pill: lime when it went up, pink when down.
function Change({ by, since }: Readonly<{ by: number; since: string }>) {
  if (by === 0) return <span className="self-start px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.12)] text-[13px] font-bold">{tr('No change since {0}', since)}</span>;
  return (
    <span className={ui.cx('self-start px-2.5 py-1 rounded-full text-[13px] font-bold', by > 0 ? 'bg-[rgba(201,233,106,0.16)] text-[#c9e96a]' : 'bg-[rgba(255,180,186,0.18)] text-[#ffc2c7]')}>
      {by > 0 ? '▲ ' + tr('Up {0} since {1}', fmtINR(by), since) : '▼ ' + tr('Down {0} since {1}', fmtINR(Math.abs(by)), since)}
    </span>
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
    <form onSubmit={submit} noValidate className="bg-card border border-line rounded-card p-4">
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
    <details className="text-[14px] text-[#dce9df]">
      <summary className="min-h-9 flex items-center cursor-pointer font-semibold">{tr('Earlier updates ({0})', updates.length)}</summary>
      <ul className="list-none m-0 p-0 pb-1.5 flex flex-col gap-1">
        {updates.map((u) => (
          <SwipeRow key={u.id} label={shortDate(u.d)} onDelete={() => { void app.removeNetWorth(u.id).then(() => app.toast(tr('Removed: {0}', shortDate(u.d)))); }}>
            <span className="tabular-nums">{shortDate(u.d)} · {fmtINR(u.a)}</span>
          </SwipeRow>
        ))}
      </ul>
    </details>
  );
}

const HERO_LIME = 'relative z-[2] flex-1 inline-flex items-center justify-center min-h-12 rounded-xl border-0 bg-primary text-primary-ink text-[16px] font-bold cursor-pointer [font-family:inherit]';
const HERO_OUTLINE = 'relative z-[2] flex-1 inline-flex items-center justify-center min-h-12 rounded-xl border border-[rgba(255,255,255,0.35)] bg-transparent text-[#fff] text-[16px] font-[650] cursor-pointer [font-family:inherit]';

// The net worth part of the Plan page, as on the design: the green tile (the figure, how it moved, a little line of the updates, the
// earlier ones, Check in and Add an item), then what is owned and owed, what moved, where it sits and the automatic lines.
export function NetWorthCard() {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<WorthMode>(null);
  const updates = useMemo(() => netUpdates(app.goals), [app.goals]);
  const now = useMemo(() => netNow(app.goals), [app.goals]);
  // with items, the figure is worked out from them (and the automatic lines) now; without, it is the last number typed
  const auto = useAutoLines();
  const today = isoDate();
  const items = useMemo(() => worthItems(app.goals, today), [app.goals, today]);
  const hasItems = items.assets.length + items.debts.length > 0;
  const live = useMemo(() => (hasItems ? worthSummary(app.goals, today, auto).net : null), [hasItems, app.goals, today, auto]);
  const value = live ?? now?.value ?? null;
  const spark = useMemo(() => updates.slice(0, SPARK_POINTS).map((u) => u.a).reverse(), [updates]);

  return (
    <div className="flex flex-col gap-4">
      <section className="hero flex flex-col gap-2 rounded-card-lg border p-[18px]" aria-label={tr('Net worth')} id="networth">
        <h3 className="m-0 text-[15px] font-[650] text-[#fff]">{tr('Net worth')}</h3>
        {value !== null ? (
          <>
            <span className="text-[40px] leading-[1.05] font-extrabold tabular-nums">{fmtINR(value)}</span>
            {now && now.change !== null && now.previous && <Change by={now.change} since={shortDate(now.previous.date)} />}
            <span className="text-[13px] text-muted">{hasItems ? tr('From what you own and owe, as of today') : tr('As of {0}', shortDate(now!.date))}</span>
            {spark.length >= 2 && <Spark values={spark} label={tr('Your last {0} net worth updates, oldest first', spark.length)} />}
          </>
        ) : (
          <p className="m-0 text-[15px] leading-[22px] text-[#dce9df]">{tr('List what you own and what you owe, and your net worth is worked out for you. A monthly check-in takes a minute.')}</p>
        )}
        {updates.length > 1 && <History updates={updates.slice(1)} />}
        <div className="flex gap-2.5 pt-1">
          {hasItems
            ? <button type="button" className={HERO_LIME} onClick={() => setMode('checkin')}>{tr('Check in')}</button>
            : <button type="button" className={HERO_LIME} onClick={() => setMode('add')}>{tr('Add an item')}</button>}
          {hasItems
            ? <button type="button" className={HERO_OUTLINE} onClick={() => setMode('add')}>{tr('Add an item')}</button>
            : <button type="button" className={HERO_OUTLINE} onClick={() => setEditing(true)}>{now ? tr('Type a new number') : tr('Or just type a number')}</button>}
        </div>
      </section>
      {editing && !hasItems && <UpdateForm onDone={() => setEditing(false)} />}
      <WorthPanel mode={mode} setMode={setMode} />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { localPref } from '../../data/localPref.ts';
import { netUpdates, parseNetAmount } from '../../core/goals.ts';
import type { NetUpdate } from '../../core/goals.ts';
import { axisDays, chartPoints, compactINR, historyRows, inRange, typedCheck } from '../../core/worthHistory.ts';
import { checkText } from './netWorthCheck.ts';
import type { HistoryRange, HistoryRow } from '../../core/worthHistory.ts';
import { longDate, shortDate, shortMonth } from '../../core/format.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { Icon } from '../../ui/Icon.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The net worth history page (version 2.1), as drawn on the design canvas: the chart over a range of time, then every update with how it
// moved, each one changed or deleted (with Undo), and a note on an update that looks like a typo. The owner: "add a way to see the
// net-worth history; also i by mistake type a new number to 0, and there is no way to delete this invalid entry".

// The updates the person said are right ("It is right" on a Looks wrong? note), so the note does not come back. This device only.
const keptOdd = localPref<string[]>('money-log.networth-kept', (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-200) : []), []);

const RANGES: { id: HistoryRange; label: string }[] = [{ id: '6m', label: '6 months' }, { id: '1y', label: '1 year' }, { id: 'all', label: 'All' }];
const HERO_SOFT = 'text-[#c6d9c9]'; // the quiet words in the green tile
const W = 300; // the chart's own units; it stretches to the width, 160 tall on a phone and 220 on a computer
const H = 160;
const CHART_H = 'h-[160px] lg:h-[220px]';
const BIG = 'text-[clamp(28px,9vw,40px)] leading-[1.05] font-extrabold tabular-nums'; // 40px, a little smaller when a long figure would not fit a phone

const sourceText = (u: NetUpdate): string | null => {
  if (u.s === 'c') return tr('Check-in');
  if (u.s === 't') return tr('Typed in');
  return null;
};

function RangeChips({ value, onChange }: Readonly<{ value: HistoryRange; onChange: (r: HistoryRange) => void }>) {
  return (
    <div className={ui.segment(3)} role="group" aria-label={tr('How far back')}>
      {RANGES.map((r) => (
        <button key={r.id} type="button" aria-pressed={value === r.id} onClick={() => onChange(r.id)}
          className={ui.cx('min-h-11 rounded-[10px] border-0 text-[15px] cursor-pointer [font-family:inherit]', value === r.id ? 'bg-card text-ink font-bold shadow-[0_1px_2px_rgba(0,0,0,.12)]' : 'bg-transparent text-muted font-semibold')}>
          {tr(r.label)}
        </button>
      ))}
    </div>
  );
}

// "▲ Up ₹1,40,000 since 24 Sept", lime when up, pink when down.
function pillText(by: number, before: NetUpdate | undefined): string {
  if (!before) return tr('Your first update');
  const since = shortDate(before.d);
  if (by > 0) return '▲ ' + tr('Up {0} since {1}', fmtINR(by), since);
  if (by < 0) return '▼ ' + tr('Down {0} since {1}', fmtINR(-by), since);
  return tr('No change since {0}', since);
}

// Months under the chart; days when the updates are less than three months apart, so the labels do not repeat.
function axisLabels(shown: readonly NetUpdate[]): string[] {
  const days = axisDays(shown);
  const wide = days.length > 1 && Date.parse(days.at(-1)!) - Date.parse(days[0]!) >= 90 * 86_400_000;
  return days.map((d) => (wide ? shortMonth(d) : shortDate(d)));
}

// The chart: the updates of the range, oldest on the left, a dot on each; one that looks wrong is pink.
function Chart({ shown, odd }: Readonly<{ shown: NetUpdate[]; odd: ReadonlySet<string> }>) {
  const c = chartPoints(shown, W, H);
  const labels = axisLabels(shown); // one day only: one label, under the middle where the dots are
  const dot = (p: { x: number; y: number }) => `M${p.x.toFixed(1)} ${p.y.toFixed(1)}h0.01`;
  const label = tr('Net worth at each update, oldest first: {0}', shown.slice().reverse().map((u) => `${shortDate(u.d)} ${fmtINR(u.a)}`).join(', '));
  return (
    <>
      <div className="flex gap-2 pt-1.5">
        <div className={ui.cx('w-9 flex-none flex flex-col justify-between text-[11px] leading-4 text-right', HERO_SOFT, CHART_H)} aria-hidden="true">
          <span>{compactINR(c.hi)}</span><span>{compactINR((c.hi + c.lo) / 2)}</span><span>{compactINR(c.lo)}</span>
        </div>
        <svg className={ui.cx('block flex-1 min-w-0', CHART_H)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
          <path d={`M0 8H${W}M0 ${H / 2}H${W}M0 ${H - 8}H${W}`} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline points={c.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="#c9e96a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={c.pts.filter((p) => !odd.has(p.id)).map(dot).join(' ')} fill="none" stroke="#c9e96a" strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={c.pts.filter((p) => odd.has(p.id)).map(dot).join(' ')} fill="none" stroke="#ffb4ba" strokeWidth="10" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className={ui.cx('flex pl-11 text-[11px]', labels.length === 1 ? 'justify-center' : 'justify-between', HERO_SOFT)} aria-hidden="true">{labels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}</div>
    </>
  );
}

function Hero({ all, shown, odd }: Readonly<{ all: NetUpdate[]; shown: NetUpdate[]; odd: ReadonlySet<string> }>) {
  const [now, before] = all as [NetUpdate, NetUpdate | undefined];
  const by = before ? now.a - before.a : 0;
  const hi = shown.reduce((m, u) => (u.a > m.a ? u : m), shown[0]!);
  const lo = shown.reduce((m, u) => (u.a < m.a ? u : m), shown[0]!);
  return (
    <section className="hero flex flex-col gap-2 rounded-card-lg border p-[18px]" aria-label={tr('Net worth over time')}>
      <span className="text-[15px] font-[650] text-[#fff]">{tr('Net worth now')}</span>
      <span className={BIG}>{fmtINR(now.a)}</span>
      <span className={ui.cx('self-start px-2.5 py-1 rounded-full text-[13px] font-bold', by < 0 ? 'bg-[rgba(255,180,186,0.18)] text-[#ffc2c7]' : 'bg-[rgba(201,233,106,0.16)] text-[#c9e96a]')}>{pillText(by, before)}</span>
      <span className={ui.cx('text-[13px]', HERO_SOFT)}>{all.length > 1 ? tr('As of {0} · {1} updates since {2}', shortDate(now.d), all.length, shortDate(all.at(-1)!.d)) : tr('As of {0}', shortDate(now.d))}</span>
      <Chart shown={shown} odd={odd} />
      <div className="grid grid-cols-2 gap-2.5 pt-2.5 mt-1 border-t border-[rgba(255,255,255,0.14)]">
        <span className="flex flex-col"><span className={ui.cx('text-[12px]', HERO_SOFT)}>{tr('Highest')}</span><span className="text-[16px] font-bold tabular-nums text-[#fff]">{fmtINR(hi.a)} · {shortDate(hi.d)}</span></span>
        <span className="flex flex-col"><span className={ui.cx('text-[12px]', HERO_SOFT)}>{tr('Lowest')}</span><span className={ui.cx('text-[16px] font-bold tabular-nums', odd.has(lo.id) ? 'text-[#ffc2c7]' : 'text-[#fff]')}>{fmtINR(lo.a)} · {shortDate(lo.d)}</span></span>
      </div>
    </section>
  );
}

// Change an update in place: the figure and its day.
// ₹0 after a figure that was not, or one far from the update before it, is asked about once before it is saved (as when typing a new one).
function EditUpdate({ u, before, onDone }: Readonly<{ u: NetUpdate; before: NetUpdate | null; onDone: () => void }>) {
  const app = useApp();
  const [amount, setAmount] = useState(String(u.a));
  const [date, setDate] = useState(u.d);
  const [error, setError] = useState('');
  const [asked, setAsked] = useState(''); // the amount the check was shown for: saving it again goes ahead
  const [busy, setBusy] = useState(false);
  const parsed = parseNetAmount(amount);
  const check = parsed === null || parsed === u.a || !before ? null : typedCheck(parsed, before.a);
  const askNow = check !== null && asked === amount;
  async function save(ev: FormEvent) {
    ev.preventDefault();
    const n = parseNetAmount(amount);
    if (n === null) return setError(tr('Enter your net worth as a number, with at most two decimals. It can be negative.'));
    if (check && !askNow) return setAsked(amount);
    setBusy(true);
    const problem = await app.editNetWorth(u.id, n, date);
    setBusy(false);
    if (problem) return setError(problem);
    app.toast(tr('Net worth saved'));
    onDone();
  }
  return (
    <form onSubmit={save} noValidate className="pb-3" aria-label={tr('Change the update of {0}', shortDate(u.d))}>
      <div className="grid grid-cols-2 gap-2.5">
        <label className={ui.field}><span>{tr('Net worth (₹)')}</span><input inputMode="decimal" value={amount} autoFocus onChange={(e) => { setAmount(e.target.value); setError(''); setAsked(''); }} /></label>
        <label className={ui.field}><span>{tr('As of')}</span><input type="date" value={date} max={isoDate()} onChange={(e) => { setDate(e.target.value); setError(''); }} /></label>
      </div>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      {askNow && before && <p className={ui.msg('bad')} role="alert">{checkText(check, before.a)}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{askNow ? tr('Save anyway') : tr('Save')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}

// The phone's sheet for one update: change it, or delete it.
function UpdateActions({ u, onEdit, onDelete, onClose }: Readonly<{ u: NetUpdate; onEdit: () => void; onDelete: () => void; onClose: () => void }>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const close = () => ref.current?.close();
  const src = sourceText(u);
  return (
    <dialog ref={ref} className="sheet" aria-label={tr('The update of {0}', longDate(u.d))}
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }} onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="flex flex-col gap-1 mt-2.5">
        <span className="text-[13px] text-muted">{src ? `${src} · ${longDate(u.d)}` : longDate(u.d)}</span>
        <span className="text-[28px] leading-[34px] font-extrabold tabular-nums">{fmtINR(u.a)}</span>
      </div>
      <div className="flex flex-col mt-2 border-t border-line">
        <button type="button" className={ui.cx(ui.sheetRow, 'border-b border-line text-ink font-semibold')} onClick={() => { close(); onEdit(); }}><Icon name="edit" size={20} stroke={2} />{tr('Change the amount or date')}</button>
        <button type="button" className={ui.cx(ui.sheetRow, 'text-bad font-[650]')} onClick={() => { close(); onDelete(); }}><Icon name="trash" size={20} stroke={2} />{tr('Delete this update')}</button>
      </div>
      <p className="m-0 pt-2 text-[13px] leading-[19px] text-muted">{tr('Only this point in the history goes. What you own and owe is not touched, and Undo brings it back.')}</p>
      <button type="button" className={ui.btn('outline', 'none', 'w-full mt-2.5 min-h-[52px] text-[16px]')} onClick={close}>{tr('Cancel')}</button>
    </dialog>
  );
}

// "Looks wrong?" under an update that is far from the ones around it.
function OddNote({ u, before, onDelete, onKeep }: Readonly<{ u: NetUpdate; before: NetUpdate; onDelete: () => void; onKeep: () => void }>) {
  const gap = fmtINR(Math.abs(before.a - u.a));
  const text = u.a < before.a ? tr('It is {0} below {1}, the update before it.', gap, shortDate(before.d)) : tr('It is {0} above {1}, the update before it.', gap, shortDate(before.d));
  return (
    <div role="note" className="bg-bad-bg rounded-xl p-3 flex flex-col gap-2.5">
      <span className="text-[14px] leading-5"><strong className="text-bad">{tr('Looks wrong?')}</strong> {text}</span>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={ui.btn('dangerOutline', 'none', 'min-h-11 px-4 text-[15px]')} onClick={onDelete}>{tr('Delete it')}</button>
        <button type="button" className={ui.btn('outline', 'none', 'min-h-11 px-4 text-[15px]')} onClick={onKeep}>{tr('It is right')}</button>
      </div>
    </div>
  );
}

function changeLine(change: number | null): { text: string; tone: string } {
  if (change === null) return { text: tr('first update'), tone: 'text-muted' };
  if (change > 0) return { text: '▲ ' + fmtINR(change), tone: 'text-good' };
  if (change < 0) return { text: '▼ ' + fmtINR(-change), tone: 'text-bad' };
  return { text: tr('no change'), tone: 'text-muted' };
}

function UpdateRow({ row, first, odd, onKeep }: Readonly<{ row: HistoryRow; first: boolean; odd: boolean; onKeep: () => void }>) {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const { u, before } = row;
  const remove = async () => {
    await app.removeNetWorth(u.id);
    app.toast(tr('Deleted the update of {0}', shortDate(u.d)), { label: tr('Undo'), run: () => app.restoreNetWorth(u.id) });
  };
  const ch = changeLine(row.change);
  const src = sourceText(u);
  return (
    <li className={ui.cx('flex flex-col', !first && 'border-t border-line', odd && !editing && 'pb-3.5')}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_44px] lg:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center min-h-16">
        <span className="flex flex-col min-w-0">
          <span className="text-[15px] font-semibold">{shortDate(u.d)}</span>
          <span className="text-[13px]">{src && <span className="text-muted">{src} · </span>}<span className={ui.cx('font-semibold', ch.tone)}>{ch.text}</span></span>
        </span>
        <span className={ui.cx('text-[16px] font-bold tabular-nums', odd && 'text-bad')}>{fmtINR(u.a)}</span>
        <span className="max-lg:hidden flex gap-1">
          <button type="button" className={ui.cx(ROW_BTN, 'text-brand')} aria-label={tr('Edit the update of {0}', shortDate(u.d))} aria-expanded={editing} onClick={() => setEditing(true)}>{tr('Edit')}</button>
          <button type="button" className={ui.cx(ROW_BTN, 'text-bad')} aria-label={tr('Delete the update of {0}', shortDate(u.d))} onClick={() => { void remove(); }}>{tr('Delete')}</button>
        </span>
        <button type="button" className={ui.cx(ui.iconBtn, 'lg:hidden')} aria-label={tr('Change or delete the update of {0}', shortDate(u.d))} onClick={() => setMenu(true)}><Icon name="dotsFill" size={20} /></button>
      </div>
      {editing && <EditUpdate u={u} before={before} onDone={() => setEditing(false)} />}
      {odd && before && !editing && <OddNote u={u} before={before} onDelete={() => { void remove(); }} onKeep={onKeep} />}
      {menu && <UpdateActions u={u} onEdit={() => setEditing(true)} onDelete={() => { void remove(); }} onClose={() => setMenu(false)} />}
    </li>
  );
}
const ROW_BTN = 'min-h-11 px-3 border-0 rounded-[10px] bg-transparent text-[14px] font-[650] cursor-pointer [font-family:inherit]';

export function NetWorthHistory() {
  const app = useApp();
  const [range, setRange] = useState<HistoryRange>('all');
  const kept = keptOdd.use();
  const all = useMemo(() => netUpdates(app.goals), [app.goals]);
  const rows = useMemo(() => historyRows(all), [all]); // flags look at the neighbours across the whole history, not just the range
  const shown = inRange(all, range, isoDate());
  const shownIds = new Set(shown.map((u) => u.id));
  const odd = new Set(rows.filter((r) => r.odd && !kept.includes(r.u.id)).map((r) => r.u.id));
  return (
    <>
      {all.length === 0 ? <p className="m-0 bg-card border border-line rounded-card p-4 text-[15px] text-muted">{tr('No updates yet. Check in or type a figure on Plan, and each one shows here.')}</p> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-7 gap-y-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <RangeChips value={range} onChange={setRange} />
            {shown.length > 0 ? <Hero all={all} shown={shown} odd={odd} /> : <p className="m-0 text-[15px] text-muted">{tr('No updates in this time. Pick a longer one.')}</p>}
          </div>
          <section className="flex flex-col gap-2" aria-labelledby="every-update">
            <div className="flex justify-between items-baseline"><h3 id="every-update" className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Every update')}</h3><span className="text-[14px] text-muted">{shown.length === 1 ? tr('1 update') : tr('{0} updates', shown.length)}</span></div>
            {shown.length > 0 && (
              <ul className="list-none m-0 bg-card border border-line rounded-card pl-4 pr-1 lg:pr-2">
                {rows.filter((r) => shownIds.has(r.u.id)).map((r, i) => <UpdateRow key={r.u.id} row={r} first={i === 0} odd={odd.has(r.u.id)} onKeep={() => keptOdd.save([...kept, r.u.id])} />)}
              </ul>
            )}
            <p className="m-0 text-[13px] leading-[19px] text-muted">{tr('Deleting removes only that point from the history. What you own and owe stays as it is.')}</p>
          </section>
        </div>
      )}
    </>
  );
}

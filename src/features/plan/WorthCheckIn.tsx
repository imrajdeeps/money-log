import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { netNow, parseNetAmount } from '../../core/goals.ts';
import { shortDate } from '../../core/format.ts';
import { PageDialog } from '../../ui/PageDialog.tsx';
import { isEstimated, valueNow, worthItems } from '../../core/worth.ts';
import type { AutoLine, WorthItem } from '../../core/worth.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The monthly check-in: every item with its last value in one list; change what moved and save. One save is one point in the history.
export function WorthCheckIn({ auto, onDone }: Readonly<{ auto: readonly AutoLine[]; onDone: () => void }>) {
  const app = useApp();
  const today = isoDate();
  const { assets, debts } = worthItems(app.goals, today);
  const [typed, setTyped] = useState<Record<string, string>>(() => Object.fromEntries([...assets, ...debts].map((i) => [i.id, valueNow(i, today).toLocaleString('en-IN')])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const values: Record<string, number> = {};
    for (const [id, text] of Object.entries(typed)) {
      const n = parseNetAmount(text.replace(/,/g, ''));
      if (n === null || n < 0) return setError(tr('Every amount must be a number of zero or more, with at most two decimals.'));
      values[id] = n;
    }
    setBusy(true);
    await app.checkInWorth(values, auto);
    setBusy(false);
    app.toast(tr('Net worth saved'));
    onDone();
  }

  const fmt = (n: number) => n.toLocaleString('en-IN');
  const typedNow = (i: WorthItem) => parseNetAmount((typed[i.id] ?? '').replace(/,/g, ''));
  const since = (i: WorthItem) => (i.pd ? shortDate(i.pd) : shortDate(i.d));
  const status = (i: WorthItem): { text: string; changed: boolean } => {
    const n = typedNow(i);
    const was = i.p ?? i.a;
    if (isEstimated(i, today) && (n === null || n === valueNow(i, today))) return { text: tr('Estimated from EMI · was {0}', fmtINR(i.a)), changed: true };
    if (n !== null && n !== valueNow(i, today)) return { text: tr('Was {0} · changed', fmtINR(valueNow(i, today))), changed: true };
    return { text: was !== valueNow(i, today) ? tr('Was {0}', fmtINR(was)) : tr('Same as {0}', since(i)), changed: false };
  };
  // what net worth comes to with the figures as typed (the automatic lines as they are now)
  const net = [...assets, ...debts].reduce((a, i) => a + (typedNow(i) ?? valueNow(i, today)) * (i.s === 'a' ? 1 : -1), 0) + auto.reduce((a, l) => a + l.amount, 0);
  const before = netNow(app.goals);

  const group = (title: string, list: WorthItem[]) => list.length === 0 ? null : (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{title}</h3>
      <ul className="list-none m-0 px-4 bg-card border border-line rounded-card">
        {list.map((i, n) => {
          const st = status(i);
          return (
            <li key={i.id} className={ui.cx('grid grid-cols-[minmax(0,1fr)_140px] gap-3 items-center min-h-[70px] py-2', n > 0 && 'border-t border-line')}>
              <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold truncate">{i.n}</span><span className={ui.cx('text-[12px]', st.changed ? 'text-good font-semibold' : 'text-muted')}>{st.text}</span></span>
              <label className={st.changed ? ui.moneyOn : ui.money}>
                <span className="sr-only">{i.n}</span>
                <span aria-hidden="true">₹</span>
                <input inputMode="decimal" value={typed[i.id] ?? ''} onChange={(e) => { setTyped({ ...typed, [i.id]: e.target.value }); setError(''); }} onBlur={(e) => { const v = parseNetAmount(e.target.value.replace(/,/g, '')); if (v !== null) setTyped({ ...typed, [i.id]: fmt(v) }); }} />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <PageDialog title={tr('Check in')} back={tr('Plan')} onClose={onDone} intro={tr('Every figure is filled in from last time. Change only what moved. What you leave as it is counts as checked today.')}>
      <form className="flex flex-col gap-3.5" onSubmit={(ev) => { void submit(ev); }} noValidate>
        {group(tr('What you own'), assets)}
        {group(tr('What you owe'), debts)}
        <p className="m-0 px-3.5 py-3 rounded-xl bg-press text-[14px] leading-5">
          {tr('New net worth:')} <strong>{fmtINR(Math.round(net * 100) / 100)}</strong>
          {before ? (net >= before.value ? `, ${tr('up {0} since {1}', fmtINR(Math.round((net - before.value) * 100) / 100), shortDate(before.date))}.` : `, ${tr('down {0} since {1}', fmtINR(Math.round((before.value - net) * 100) / 100), shortDate(before.date))}.`) : '.'}
        </p>
        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
        <button type="submit" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')} disabled={busy}>{tr('Save check-in')}</button>
      </form>
    </PageDialog>
  );
}

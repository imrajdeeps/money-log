import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { parseNetAmount } from '../../core/goals.ts';
import { isEstimated, valueNow, worthItems } from '../../core/worth.ts';
import type { AutoLine, WorthItem } from '../../core/worth.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The monthly check-in: every item with its last value in one list; change what moved and save. One save is one point in the history.
export function WorthCheckIn({ auto, onDone }: Readonly<{ auto: readonly AutoLine[]; onDone: () => void }>) {
  const app = useApp();
  const today = isoDate();
  const { assets, debts } = worthItems(app.goals, today);
  const [typed, setTyped] = useState<Record<string, string>>(() => Object.fromEntries([...assets, ...debts].map((i) => [i.id, String(valueNow(i, today))])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const values: Record<string, number> = {};
    for (const [id, text] of Object.entries(typed)) {
      const n = parseNetAmount(text);
      if (n === null || n < 0) return setError(tr('Every amount must be a number of zero or more, with at most two decimals.'));
      values[id] = n;
    }
    setBusy(true);
    await app.checkInWorth(values, auto);
    setBusy(false);
    app.toast(tr('Net worth saved'));
    onDone();
  }

  const group = (title: string, list: WorthItem[]) => list.length === 0 ? null : (
    <>
      <h3 className="mt-4 mb-1 text-[15px]">{title}</h3>
      {list.map((i) => (
        <label key={i.id} className={ui.field}>
          <span>{i.n}{isEstimated(i, today) ? ` · ${tr('estimated {0}', fmtINR(valueNow(i, today)))}` : ''}</span>
          <input inputMode="decimal" value={typed[i.id] ?? ''} onChange={(e) => { setTyped({ ...typed, [i.id]: e.target.value }); setError(''); }} />
        </label>
      ))}
    </>
  );

  return (
    <form className={ui.card()} onSubmit={(ev) => { void submit(ev); }} noValidate>
      <h2>{tr('Check in')}</h2>
      <p className="text-muted text-[13px]">{tr('Change what has moved since last time and save. What you leave as it is counts as checked today.')}</p>
      {group(tr('You own'), assets)}
      {group(tr('You owe'), debts)}
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{tr('Save')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { ask } from '../../ui/confirm.tsx';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { classLabel, classesOf, valueNow } from '../../core/worth.ts';
import { isoDate } from '../../core/logic.ts';
import type { AutoLine, WorthItem, WorthSide } from '../../core/worth.ts';
import { PageDialog } from '../../ui/PageDialog.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// One thing the person owns or owes: which side, what kind, a name and a value; a loan can also have an EMI and a yearly rate, from which
// the app estimates the balance month by month. Removing asks first.
// onWorkOut (2.3): offered for an item kept by hand once net worth is worked out from accounts: set it up to move with payments instead.
export function WorthForm({ item, auto, onDone, onWorkOut }: Readonly<{ item?: WorthItem; auto: readonly AutoLine[]; onDone: () => void; onWorkOut?: () => void }>) {
  const app = useApp();
  const [side, setSide] = useState<WorthSide>(item?.s ?? 'a');
  const [cls, setCls] = useState(item?.c ?? 'liquid');
  const [name, setName] = useState(item?.n ?? '');
  const [amount, setAmount] = useState(item ? String(valueNow(item, isoDate())) : ''); // a loan shows its estimate: saving without a change must not put back the balance typed months ago
  const [emi, setEmi] = useState(item && item.e > 0 ? String(item.e) : '');
  const [rate, setRate] = useState(item && item.r > 0 ? String(item.r) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const loan = side === 'd' && cls === 'loan';

  function pickSide(next: WorthSide) { setSide(next); setCls(next === 'a' ? 'liquid' : 'loan'); setError(''); }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    const input = { name, side, cls, amount, emi, rate };
    const problem = item ? await app.editWorthItem(item.id, input, auto) : await app.addWorthItem(input, auto);
    setBusy(false);
    if (problem) return setError(problem);
    app.toast(item ? tr('Saved') : tr('Added'));
    onDone();
  }

  async function remove() {
    if (!item || !(await ask(tr('Remove {0}? Your history stays.', item.n), tr('Remove')))) return;
    await app.removeWorthItem(item.id, auto);
    app.toast(tr('Removed: {0}', item.n));
    onDone();
  }

  return (
    <PageDialog title={item ? tr('Edit item') : tr('Add an item')} back={tr('Plan')} onClose={onDone}>
      <form className="flex flex-col gap-[18px]" onSubmit={(ev) => { void submit(ev); }} noValidate>
        {!item && (
          <div className={ui.segment(2)} role="radiogroup" aria-label={tr('Which side')}>
            <button type="button" role="radio" className={ui.segBtn} aria-checked={side === 'a'} onClick={() => pickSide('a')}>{tr('I own it')}</button>
            <button type="button" role="radio" className={ui.segBtn} aria-checked={side === 'd'} onClick={() => pickSide('d')}>{tr('I owe it')}</button>
          </div>
        )}
        <fieldset className={ui.chipsBare}>
          <legend>{tr('Kind')}</legend>
          {classesOf(side).map((c) => <button key={c} type="button" className={ui.chipTick} aria-pressed={cls === c} onClick={() => { setCls(c); setError(''); }}>{classLabel(side, c)}</button>)}
        </fieldset>
        <label className={ui.fieldBare}><span>{tr('Name')}</span><input value={name} maxLength={40} placeholder={side === 'a' ? tr('HDFC savings, Gold, Flat') : tr('Home loan, Card')} onChange={(e) => { setName(e.target.value); setError(''); }} /></label>
        <label className={ui.fieldBare}><span>{loan ? tr('Balance still to pay') : tr('Value now')}</span><input inputMode="decimal" placeholder="₹" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
        {loan && (
          <>
            <label className={ui.fieldBare}><span>{tr('EMI each month')}</span><input inputMode="decimal" placeholder="₹" value={emi} onChange={(e) => { setEmi(e.target.value); setError(''); }} /></label>
            <div>
              <label className={ui.fieldBare}><span>{tr('Yearly interest rate')}</span><input inputMode="decimal" placeholder="%" value={rate} onChange={(e) => { setRate(e.target.value); setError(''); }} /></label>
              <p className={ui.hint}>{tr('From your loan papers. Used only to estimate what is left.')}</p>
            </div>
            <p className="m-0 px-3.5 py-3 rounded-xl bg-press text-[14px] leading-5">{tr('With an EMI, the balance is worked out month by month from the day you typed it (interest first, the rest of the EMI reduces it) and marked "estimated" until you check in with the real figure.')}</p>
          </>
        )}
        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
        <div className="flex flex-col gap-3">
          <button type="submit" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')} disabled={busy}>{tr('Save item')}</button>
          {item && onWorkOut && <button type="button" className={ui.btn('outline', 'md')} disabled={busy} onClick={onWorkOut}>{tr('Work it out from payments')}</button>}
          {item && <button type="button" className={ui.btn('dangerOutline', 'md')} disabled={busy} onClick={() => { void remove(); }}>{tr('Remove this item')}</button>}
        </div>
      </form>
    </PageDialog>
  );
}

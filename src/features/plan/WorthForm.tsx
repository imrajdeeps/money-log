import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { classLabel, classesOf, valueNow } from '../../core/worth.ts';
import { isoDate } from '../../core/logic.ts';
import type { AutoLine, WorthItem, WorthSide } from '../../core/worth.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// One thing the person owns or owes: which side, what kind, a name and a value; a loan can also have an EMI and a yearly rate, from which
// the app estimates the balance month by month. Removing asks first.
export function WorthForm({ item, auto, onDone }: Readonly<{ item?: WorthItem; auto: readonly AutoLine[]; onDone: () => void }>) {
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
    if (!item || !window.confirm(tr('Remove {0}? Your history stays.', item.n))) return;
    await app.removeWorthItem(item.id, auto);
    app.toast(tr('Removed: {0}', item.n));
    onDone();
  }

  return (
    <form className={ui.card()} onSubmit={(ev) => { void submit(ev); }} noValidate>
      <h2>{item ? tr('Change item') : tr('Add an item')}</h2>
      {!item && (
        <div className={ui.chips} role="group" aria-label={tr('Which side')}>
          <button type="button" className={ui.chip} aria-pressed={side === 'a'} onClick={() => pickSide('a')}>{tr('I own')}</button>
          <button type="button" className={ui.chip} aria-pressed={side === 'd'} onClick={() => pickSide('d')}>{tr('I owe')}</button>
        </div>
      )}
      <div className={ui.chips} role="group" aria-label={tr('Kind')}>
        {classesOf(side).map((c) => <button key={c} type="button" className={ui.chip} aria-pressed={cls === c} onClick={() => { setCls(c); setError(''); }}>{classLabel(side, c)}</button>)}
      </div>
      <label className={ui.field}><span>{tr('Name')}</span><input value={name} maxLength={40} placeholder={side === 'a' ? tr('HDFC savings, Gold, Flat') : tr('Home loan, Card')} onChange={(e) => { setName(e.target.value); setError(''); }} /></label>
      <label className={ui.field}><span>{loan ? tr('Balance still to pay (₹)') : tr('Value now (₹)')}</span><input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
      {loan && (
        <>
          <label className={ui.field}><span>{tr('EMI per month (₹, optional)')}</span><input inputMode="decimal" value={emi} onChange={(e) => { setEmi(e.target.value); setError(''); }} /></label>
          <label className={ui.field}><span>{tr('Yearly interest rate (%, optional)')}</span><input inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setError(''); }} /></label>
          <p className="text-muted text-[13px]">{tr('With an EMI, the balance is worked out month by month from the day you typed it (interest first, the rest of the EMI reduces it) and shown as an estimate. Type a new balance any time to correct it.')}</p>
        </>
      )}
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{tr('Save')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={onDone}>{tr('Cancel')}</button>
      </div>
      {item && <button type="button" className={ui.btn('danger', 'md', ui.inCard)} disabled={busy} onClick={() => { void remove(); }}>{tr('Remove this item')}</button>}
    </form>
  );
}

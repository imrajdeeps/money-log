import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { isoDate } from '../../core/logic.ts';
import type { UdhaarItem, UdhaarWay } from '../../core/goals.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Money lent or borrowed: which way, with whom, how much, when, and a note. The names already used are offered as the person types.
export function UdhaarForm({ item, onDone }: Readonly<{ item?: UdhaarItem; onDone: () => void }>) {
  const app = useApp();
  const [way, setWay] = useState<UdhaarWay>(item?.w ?? 'gave');
  const [name, setName] = useState(item?.n ?? '');
  const [amount, setAmount] = useState(item ? String(item.a) : '');
  const [date, setDate] = useState(item?.d ?? isoDate());
  const [note, setNote] = useState(item?.m ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const names = [...new Set(app.udhaar.map((u) => u.n))];

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    const input = { name, amount, way, date, note };
    const problem = item ? await app.editUdhaar(item.id, input) : await app.addUdhaar(input);
    setBusy(false);
    if (problem) return setError(problem);
    app.toast(item ? tr('Saved') : tr('Added'));
    onDone();
  }

  return (
    <form className={ui.card()} onSubmit={(ev) => { void submit(ev); }} noValidate>
      <h2>{item ? tr('Change entry') : tr('New entry')}</h2>
      <div className={ui.chips} role="group" aria-label={tr('Which way')}>
        <button type="button" className={ui.chip} aria-pressed={way === 'gave'} onClick={() => setWay('gave')}>{tr('I lent')}</button>
        <button type="button" className={ui.chip} aria-pressed={way === 'took'} onClick={() => setWay('took')}>{tr('I borrowed')}</button>
      </div>
      <label className={ui.field}>
        <span>{way === 'gave' ? tr('Lent to') : tr('Borrowed from')}</span>
        <input value={name} maxLength={40} list="udhaar-names" autoComplete="off" onChange={(e) => { setName(e.target.value); setError(''); }} />
        <datalist id="udhaar-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <label className={ui.field}><span>{tr('Amount (₹)')}</span><input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
      <label className={ui.field}><span>{tr('Date')}</span><input type="date" value={date} max={isoDate()} onChange={(e) => { setDate(e.target.value); setError(''); }} /></label>
      <label className={ui.field}><span>{tr('Note (optional)')}</span><input value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{tr('Save')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}

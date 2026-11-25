import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import type { DueItem } from '../../core/blocks.ts';
import type { DueEntryKind } from '../../core/goals.ts';
import { parseAmount } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

type DueAmount = { ok: true; amount: number } | { ok: false; error: string };

// The amount of a due payment: empty or zero means no amount, anything else must be a proper amount. A to-do has none.
function dueAmount(kind: DueEntryKind, text: string): DueAmount {
  const t = text.trim();
  if (kind !== 'oneoff' || t === '' || /^0+(\.0*)?$/.test(t)) return { ok: true, amount: 0 };
  const n = parseAmount(text);
  return n === null ? { ok: false, error: tr('Enter an amount with at most two decimals, or leave it empty.') } : { ok: true, amount: n };
}

// Making a due item, or changing one: a payment (with an optional amount) or a to-do, and an optional date.
export function DueForm({ item, onDone }: Readonly<{ item?: DueItem; onDone: () => void }>) {
  const app = useApp();
  const [kind, setKind] = useState<DueEntryKind>(item?.kind ?? 'oneoff');
  const [title, setTitle] = useState(item?.title ?? '');
  const [date, setDate] = useState(item?.due ?? '');
  const [amount, setAmount] = useState(item?.amount ? String(item.amount) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // the words that differ between making a due item and changing one
  const words = item ? { head: tr('Change due item'), done: tr('Saved'), go: tr('Save') } : { head: tr('New due item'), done: tr('Added to the due list'), go: tr('Add') };

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const a = dueAmount(kind, amount);
    if (!a.ok) return setError(a.error);
    setBusy(true);
    setError('');
    const input = { kind, title, date, amount: a.amount };
    const problem = item ? await app.editDue(item.k, input) : await app.addDue(input);
    setBusy(false);
    if (problem) return setError(problem);
    app.toast(words.done);
    onDone();
  }

  return (
    <form className={ui.card()} onSubmit={submit} noValidate>
      <h3 className="m-0">{words.head}</h3>
      <label className={ui.field}>
        <span>{tr('What is it')}</span>
        <select value={kind} onChange={(e) => { setKind(e.target.value as DueEntryKind); setError(''); }}>
          <option value="oneoff">{tr('One-off payment')}</option>
          <option value="todo">{tr('To-do')}</option>
        </select>
      </label>
      <label className={ui.field}><span>{tr('Title')}</span><input value={title} maxLength={120} placeholder={tr('Renew passport, annual fee')} onChange={(e) => { setTitle(e.target.value); setError(''); }} /></label>
      <label className={ui.field}><span>{tr('Due date (optional)')}</span><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(''); }} /></label>
      {kind === 'oneoff' && (
        <label className={ui.field}><span>{tr('Amount (₹, optional)')}</span><input inputMode="decimal" value={amount} placeholder="12000" onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
      )}
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{words.go}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import type { DueItem } from '../../core/blocks.ts';
import type { DueEntryKind } from '../../core/goals.ts';
import { parseAmount } from '../../core/logic.ts';
import { PageDialog } from '../../ui/PageDialog.tsx';
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
  const words = item ? { head: tr('Change due item'), done: tr('Saved'), go: tr('Save') } : { head: tr('Add to Due soon'), done: tr('Added to the due list'), go: tr('Save') };

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
    <PageDialog title={words.head} back={tr('Plan')} onClose={onDone}>
      <form className="flex flex-col gap-[18px]" onSubmit={submit} noValidate>
        <div className={ui.segment(2)} role="radiogroup" aria-label={tr('What is it')}>
          <button type="button" role="radio" className={ui.segBtn} aria-checked={kind === 'oneoff'} onClick={() => { setKind('oneoff'); setError(''); }}>{tr('A payment')}</button>
          <button type="button" role="radio" className={ui.segBtn} aria-checked={kind === 'todo'} onClick={() => { setKind('todo'); setError(''); }}>{tr('A to-do')}</button>
        </div>
        <label className={ui.fieldBare}><span>{tr('What')}</span><input value={title} maxLength={120} placeholder={tr('Renew passport, annual fee')} onChange={(e) => { setTitle(e.target.value); setError(''); }} /></label>
        {kind === 'oneoff' && (
          <label className={ui.fieldBare}><span>{tr('Amount (optional)')}</span><input inputMode="decimal" value={amount} placeholder="₹" onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
        )}
        <div>
          <label className={ui.fieldBare}><span>{tr('Due on')}</span><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(''); }} /></label>
          {kind === 'oneoff' && <p className={ui.hint}>{tr('A one-off payment, like an insurance renewal. For something every month, tick Repeat every month when you add the expense.')}</p>}
        </div>
        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
        <button type="submit" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')} disabled={busy}>{words.go}</button>
      </form>
    </PageDialog>
  );
}

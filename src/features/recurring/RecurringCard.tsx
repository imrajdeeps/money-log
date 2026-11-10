import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { CategorySelect } from '../../ui/CategorySelect.tsx';
import { METHODS, fmtINR, parseAmount } from '../../core/logic.ts';
import type { Method } from '../../core/logic.ts';
import { activeRecurring } from '../../core/recurring.ts';
import type { RecurItem } from '../../core/recurring.ts';
import * as ui from '../../ui/styles.ts';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
export const describeRecurring = (it: RecurItem) => [fmtINR(it.a), `on the ${ordinal(it.d)}`, it.m, it.n].filter(Boolean).join(' · ');

interface Draft { id: string | null; category: string; amount: string; day: string; method: Method | ''; note: string }
const EMPTY: Draft = { id: null, category: '', amount: '', day: '1', method: '', note: '' };

// Settings: the payments that repeat every month. Set one here; the Overview then offers it for one-tap logging.
export function RecurringCard() {
  const app = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null); // a removal waits for a second tap
  const items = activeRecurring(app.recurring);
  const set = (patch: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setError(''); };

  function edit(it: RecurItem) {
    setDraft({ id: it.id, category: it.c, amount: String(it.a), day: String(it.d), method: it.m ?? '', note: it.n });
    setError(''); setRemoving(null);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    const amount = parseAmount(draft.amount);
    if (amount === null) { setError(draft.amount.trim() === '' ? 'Enter an amount.' : 'Amount must be a positive number with at most 2 decimals.'); return; }
    const input = { category: draft.category, amount, day: Number(draft.day), method: draft.method === '' ? null : draft.method, note: draft.note };
    const problem = draft.id ? await app.editRecurring(draft.id, input) : await app.addRecurring(input);
    if (problem) { setError(problem); return; }
    app.toast(draft.id ? 'Recurring payment saved' : 'Recurring payment added');
    setDraft(null);
  }

  async function remove(id: string) {
    if (removing !== id) { setRemoving(id); return; }
    setRemoving(null);
    await app.removeRecurring(id);
    app.toast('Recurring payment removed');
  }

  return (
    <div className={ui.card()}>
      <h2>Recurring payments</h2>
      <p className="text-muted text-[13px]">
        Rent, an SIP, a subscription: set it once. Each month the Overview shows it from its day, and one tap logs it on that day
        (you can edit the payment afterwards). A month the app was not opened is not added later. {app.syncEnabled ? 'Your other phones get the list when you sync.' : ''}
      </p>
      {items.length > 0 && (
        <ul className="list recurlist">
          {items.map((it) => (
            <li key={it.id} className="row static">
              <span className={ui.rowMain()}><b>{it.c}</b><small>{describeRecurring(it)}</small></span>
              <button type="button" className={ui.btn('ghost', 'small')} onClick={() => edit(it)}>Edit</button>
              <button type="button" className={ui.btn(removing === it.id ? 'danger' : 'ghost', 'small')} onClick={() => remove(it.id)}>{removing === it.id ? 'Tap to remove' : 'Remove'}</button>
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 && !draft && <p className="text-muted">Nothing set yet.</p>}
      {draft ? (
        <form onSubmit={save} noValidate>
          <label className={ui.field}><span>Category</span><CategorySelect id="rc-cat" value={draft.category} onChange={(v) => set({ category: v })} /></label>
          <div className={ui.btnRow}>
            <label className={ui.fieldHalf}><span>Amount (₹)</span><input inputMode="decimal" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0" /></label>
            <label className={ui.fieldHalf}><span>Day of the month</span>
              <select value={draft.day} onChange={(e) => set({ day: e.target.value })}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
              </select>
            </label>
          </div>
          <label className={ui.field}><span>Method (optional)</span>
            <select value={draft.method} onChange={(e) => set({ method: e.target.value as Method | '' })}>
              <option value="">Not set</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className={ui.field}><span>Note (optional)</span><input value={draft.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} /></label>
          {draft.day === '29' || draft.day === '30' || draft.day === '31' ? <p className="text-muted text-[13px]">In a shorter month it falls on the month's last day.</p> : null}
          {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
          <div className={ui.btnRow}>
            <button type="submit" className={ui.btn()}>{draft.id ? 'Save changes' : 'Add'}</button>
            <button type="button" className={ui.btn('ghost')} onClick={() => { setDraft(null); setError(''); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={() => { setDraft(EMPTY); setError(''); setRemoving(null); }}>Add a recurring payment</button>
      )}
    </div>
  );
}

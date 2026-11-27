import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { CategorySelect } from '../../ui/CategorySelect.tsx';
import { METHODS, fmtINR, isoDate, parseAmount } from '../../core/logic.ts';
import type { Method } from '../../core/logic.ts';
import { activeRecurring, scheduledDate } from '../../core/recurring.ts';
import type { RecurItem } from '../../core/recurring.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';
import { ordinal, shortDate } from '../../core/format.ts';

export const describeRecurring = (it: RecurItem) => [fmtINR(it.a), tr('on the {0}', ordinal(it.d)), it.m, it.n].filter(Boolean).join(' · ');

interface Draft { id: string | null; category: string; amount: string; day: string; method: Method | ''; note: string }
const EMPTY: Draft = { id: null, category: '', amount: '', day: '1', method: '', note: '' };

// Settings: the payments that repeat every month. Set one here; the Overview then offers it for one-tap logging.
export function RecurringCard() {
  const app = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null); // a removal waits for a second tap
  const items = activeRecurring(app.recurring);
  const today = isoDate();
  const set = (patch: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setError(''); };

  function edit(it: RecurItem) {
    setDraft({ id: it.id, category: it.c, amount: String(it.a), day: String(it.d), method: it.m ?? '', note: it.n });
    setError(''); setRemoving(null);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    const amount = parseAmount(draft.amount);
    if (amount === null) { setError(draft.amount.trim() === '' ? tr('Enter an amount.') : tr('Amount must be a positive number with at most 2 decimals.')); return; }
    const input = { category: draft.category, amount, day: Number(draft.day), method: draft.method === '' ? null : draft.method, note: draft.note };
    const problem = draft.id ? await app.editRecurring(draft.id, input) : await app.addRecurring(input);
    if (problem) { setError(problem); return; }
    app.toast(draft.id ? tr('Recurring payment saved') : tr('Recurring payment added'));
    setDraft(null);
  }

  async function remove(id: string) {
    if (removing !== id) { setRemoving(id); return; }
    setRemoving(null);
    await app.removeRecurring(id);
    app.toast(tr('Recurring payment removed'));
  }

  const month = today.slice(0, 7);
  const logged = items.filter((it) => it.l >= month).length;
  const stateOf = (it: RecurItem) => (it.l >= month ? { text: tr('Logged this month'), tone: 'bg-good-bg text-good' } : { text: tr('Due {0}', shortDate(scheduledDate(it, month))), tone: 'bg-press text-ink' });
  return (
    <>
      {items.length > 0 && <div className="bg-card border border-line rounded-card px-4 py-3.5 flex justify-between items-center text-[15px]"><span>{tr('This month')}</span><strong>{tr('{0} logged · {1} due', logged, items.length - logged)}</strong></div>}
      {items.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
          {items.map((it) => {
            const st = stateOf(it);
            return (
              <li key={it.id} className="bg-card border border-line rounded-card px-4 py-3.5 flex flex-col gap-2.5">
                <div className="flex justify-between gap-3 items-start">
                  <span className="flex flex-col min-w-0"><span className="text-[16px] font-[650] [overflow-wrap:anywhere]">{it.n || it.c}</span><span className="text-[13px] text-muted">{[it.c, tr('on the {0}', ordinal(it.d)), it.m].filter(Boolean).join(' · ')}</span></span>
                  <span className="text-[16px] font-bold tabular-nums">{fmtINR(it.a)}</span>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-md ${st.tone}`}>{st.text}</span>
                  <span className="flex-1" />
                  <button type="button" className="min-h-10 px-3 rounded-xl border border-control-line bg-transparent text-brand text-[14px] font-[650] cursor-pointer [font-family:inherit]" onClick={() => edit(it)}>{tr('Change')}</button>
                  <button type="button" className="min-h-10 px-3 rounded-[10px] border-0 bg-transparent text-bad text-[14px] font-[650] cursor-pointer [font-family:inherit]" onClick={() => remove(it.id)}>{removing === it.id ? tr('Tap again to stop') : tr('Stop')}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items.length === 0 && !draft && <p className="m-0 text-[14px] leading-5 text-muted">{tr('Nothing repeats yet.')}</p>}
      {draft && (
        <form onSubmit={save} noValidate className="bg-card border border-line rounded-card p-4 flex flex-col gap-3 [&_label]:m-0">
          <h3 className="m-0 text-[16px] font-[650]">{draft.id ? tr('Change recurring payment') : tr('Add a recurring payment')}</h3>
          <label className={ui.fieldBare}><span>{tr('Category')}</span><CategorySelect id="rc-cat" value={draft.category} onChange={(v) => set({ category: v })} /></label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className={ui.fieldBare}><span>{tr('Amount (₹)')}</span><input inputMode="decimal" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0" /></label>
            <label className={ui.fieldBare}><span>{tr('Day of the month')}</span>
              <select value={draft.day} onChange={(e) => set({ day: e.target.value })}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
              </select>
            </label>
          </div>
          <label className={ui.fieldBare}><span>{tr('Method (optional)')}</span>
            <select value={draft.method} onChange={(e) => set({ method: e.target.value as Method | '' })}>
              <option value="">{tr('Not set')}</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className={ui.fieldBare}><span>{tr('Note (optional)')}</span><input value={draft.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} /></label>
          {draft.day === '29' || draft.day === '30' || draft.day === '31' ? <p className="text-muted text-[13px]">{tr('In a shorter month it falls on the month\'s last day.')}</p> : null}
          {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
          <div className="flex gap-2.5 [&>*]:flex-1">
            <button type="submit" className={ui.btn()}>{draft.id ? tr('Save changes') : tr('Add')}</button>
            <button type="button" className={ui.btn('outline')} onClick={() => { setDraft(null); setError(''); }}>{tr('Cancel')}</button>
          </div>
        </form>
      )}
      <p className="m-0 text-[13px] leading-[18px] text-muted">{tr('To add one, tick Repeat every month when you add an expense. Each comes up on its day to log with one tap; nothing is logged on its own.')} {app.syncEnabled ? tr('Your other devices get the list when you sync.') : ''}</p>
      {!draft && <button type="button" className={ui.btn('outline', 'none', 'min-h-12 text-[15px]')} onClick={() => { setDraft(EMPTY); setError(''); setRemoving(null); }}>{tr('Add one here')}</button>}
    </>
  );
}

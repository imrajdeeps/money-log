import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { activeMembers, computeShares } from '../../core/groups.ts';
import { METHODS, fmtINR, isValidDate, isoDate, parseAmount } from '../../core/logic.ts';
import type { Entry, Method, NewEntryInput } from '../../core/logic.ts';
import { CategorySelect } from '../../ui/CategorySelect.tsx';
import { HistoryList } from './HistoryList.tsx';
import { PhotoStrip } from './PhotoStrip.tsx';
import { MethodChips } from './MethodChips.tsx';
import { SplitEditor, splitFromEntry } from './SplitEditor.tsx';
import type { SplitState } from './SplitEditor.tsx';

export function EditDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState(String(entry.amount));
  const [category, setCategory] = useState(entry.category);
  const [method, setMethod] = useState<Method | null>(entry.method);
  const [note, setNote] = useState(entry.note);
  const [date, setDate] = useState(entry.entry_date);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  // A shared expense: editable only while this account is in the group, and not once someone it names has left, because
  // changing its amount, people or existence would silently change that person's balance.
  const shared = Boolean(entry.group_id);
  const inGroup = shared && app.groups.some((g) => g.id === entry.group_id);
  const people = activeMembers(app.members, entry.group_id ?? '');
  const named = [entry.paid_by, ...Object.keys(entry.shares ?? {})];
  const frozen = shared && named.some((u) => !people.some((m) => m.user_id === u));
  const readOnly = shared && !inGroup;
  const [split, setSplit] = useState<SplitState>(() => splitFromEntry(entry, people));

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const close = () => ref.current?.close();

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const amt = parseAmount(amount);
    if (amt === null) return setError('Amount must be a positive number with at most 2 decimals.');
    if (!category) return setError('Pick a category.');
    if (!isValidDate(date)) return setError('Pick a valid date.');
    if (date > isoDate()) return setError('The date cannot be in the future.');
    const changes: Partial<NewEntryInput> = { category, method, note: note.trim(), date };
    if (!shared) changes.amount = amt;
    else if (!frozen) {
      const r = computeShares(split.mode, amt, people.map((m) => m.user_id), new Set(split.included), split.values);
      if (!r.shares) return setError(r.problem);
      if (split.paidBy !== app.me && !(app.me && app.me in r.shares)) return setError('You can only record an expense that you paid or share in.');
      changes.amount = amt;
      changes.group = { group_id: entry.group_id!, paid_by: split.paidBy, shares: r.shares };
    }
    await app.updateEntry(entry.id, changes);
    app.toast(`Updated ${fmtINR(amt)} · ${category}`);
    close();
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await app.removeEntry(entry.id);
    app.toast('Deleted');
    close();
  }

  return (
    <dialog
      ref={ref}
      // a photo viewer inside this dialog also closes: React passes that close event up, so only our own counts
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
      aria-labelledby="edit-title"
    >
      <form onSubmit={save} noValidate>
        <h2 id="edit-title">{shared ? 'Edit shared expense' : 'Edit payment'}</h2>
        {readOnly && <p className="msg bad" role="status">You are no longer in this group, so this expense can no longer be changed.</p>}
        {frozen && inGroup && <p className="msg" role="status">Someone this expense names has left the group, so its amount, split and deletion are locked. You can still change the category, method, note and date.</p>}
        <label className="field">
          <span>Amount (₹)</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={readOnly || frozen} />
        </label>
        {shared && inGroup && !frozen && app.me && (
          <SplitEditor people={people} me={app.me} total={parseAmount(amount) ?? 0} value={split} onChange={(next) => { setSplit(next); setError(''); }} />
        )}
        <label className="field" htmlFor="edit-cat"><span>Category</span></label>
        <CategorySelect id="edit-cat" value={category} onChange={setCategory} />
        <MethodChips value={method} onChange={setMethod} options={METHODS} />
        <label className="field">
          <span>Note</span>
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <PhotoStrip entryId={entry.id} canEdit={!readOnly} />
        {shared && inGroup && entry.group_id && (
          <div className="photostrip">
            <p className="fieldlabel">History</p>
            <HistoryList entryId={entry.id} groupId={entry.group_id} />
          </div>
        )}
        {error && <p className="msg bad" role="alert">{error}</p>}
        <div className="btnrow">
          <button type="submit" className="btn" disabled={readOnly}>Save</button>
          <button type="button" className="btn ghost" onClick={close}>{readOnly ? 'Close' : 'Cancel'}</button>
        </div>
        {!readOnly && !frozen && (
          <button type="button" className="btn danger" onClick={remove}>
            {confirmDelete ? 'Tap again to delete' : shared ? 'Delete shared expense' : 'Delete payment'}
          </button>
        )}
      </form>
    </dialog>
  );
}

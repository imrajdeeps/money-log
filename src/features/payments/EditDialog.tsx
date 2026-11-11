import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { activeMembers, computeShares } from '../../core/groups.ts';
import { METHODS, fmtINR, isValidDate, isoDate, parseAmount } from '../../core/logic.ts';
import type { Entry, EntryKind, Method, NewEntryInput } from '../../core/logic.ts';
import { KindCategory } from './KindCategory.tsx';
import { KindSwitch } from './KindSwitch.tsx';
import { HistoryList } from './HistoryList.tsx';
import { PhotoStrip } from './PhotoStrip.tsx';
import { MethodChips } from './MethodChips.tsx';
import { SplitEditor, splitFromEntry } from './SplitEditor.tsx';
import type { SplitState } from './SplitEditor.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const updatedText = (kind: EntryKind, amount: number, category: string): string =>
  kind === 'in' ? tr('Updated income {0} · {1}', fmtINR(amount), category) : tr('Updated {0} · {1}', fmtINR(amount), category);

function editTitle(shared: boolean, kind: EntryKind): string {
  if (shared) return tr('Edit shared expense');
  return kind === 'in' ? tr('Edit income') : tr('Edit payment');
}

export function EditDialog({ entry, onClose }: Readonly<{ entry: Entry; onClose: () => void }>) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState(String(entry.amount));
  const [category, setCategory] = useState(entry.category);
  const [kind, setKind] = useState<EntryKind>(entry.kind ?? 'out');
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

  // Switching between Spent and Received starts the category again: each has its own list.
  function pickKind(k: EntryKind) {
    setKind(k);
    setCategory('');
    setError('');
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const amt = parseAmount(amount);
    if (amt === null) return setError(tr('Amount must be a positive number with at most 2 decimals.'));
    if (!category) return setError(tr('Pick a category.'));
    if (!isValidDate(date)) return setError(tr('Pick a valid date.'));
    if (date > isoDate()) return setError(tr('The date cannot be in the future.'));
    const changes: Partial<NewEntryInput> = { category, method, note: note.trim(), date, kind };
    if (!shared) changes.amount = amt;
    else if (!frozen) {
      const r = computeShares(split.mode, amt, people.map((m) => m.user_id), new Set(split.included), split.values);
      if (!r.shares) return setError(r.problem);
      if (split.paidBy !== app.me && !(app.me && app.me in r.shares)) return setError(tr('You can only record an expense that you paid or share in.'));
      changes.amount = amt;
      changes.group = { group_id: entry.group_id!, paid_by: split.paidBy, shares: r.shares };
    }
    const before = entry; // as it was when this dialog opened: what Undo goes back to
    await app.updateEntry(entry.id, changes);
    // Undo is for the person's own payments: a shared expense is also other people's, and the group has rules about changing it afterwards
    app.toast(updatedText(kind, amt, category), shared ? undefined : { label: tr('Undo'), run: async () => { await app.undoEntry(before); app.toast(tr('Back as it was.')); } });
    close();
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    const before = entry;
    // deleting a payment also deletes its receipt photos for good, which Undo cannot bring back: so no Undo for a payment that has some
    const hasPhotos = app.receipts.some((r) => r.entry_id === entry.id && !r.deleted_at);
    await app.removeEntry(entry.id);
    app.toast(tr('Deleted'), shared || hasPhotos ? undefined : { label: tr('Undo'), run: async () => { await app.undoEntry(before); app.toast(tr('Back as it was.')); } });
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
        <h2 id="edit-title">{editTitle(shared, kind)}</h2>
        {readOnly && <p className={ui.msg('bad')} role="status">{tr('You are no longer in this group, so this expense can no longer be changed.')}</p>}
        {frozen && inGroup && <p className={ui.msg()} role="status">{tr('Someone this expense names has left the group, so its amount, split and deletion are locked. You can still change the category, method, note and date.')}</p>}
        {!shared && <KindSwitch value={kind} onChange={pickKind} />}
        <label className={ui.field}>
          <span>{tr('Amount (₹)')}</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={readOnly || frozen} />
        </label>
        {shared && inGroup && !frozen && app.me && (
          <SplitEditor people={people} me={app.me} total={parseAmount(amount) ?? 0} value={split} onChange={(next) => { setSplit(next); setError(''); }} />
        )}
        <label className={ui.field} htmlFor="edit-cat"><span>{tr('Category')}</span></label>
        <KindCategory kind={kind} id="edit-cat" value={category} onChange={setCategory} />
        <MethodChips value={method} onChange={setMethod} options={METHODS} />
        <label className={ui.field}>
          <span>{tr('Note')}</span>
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className={ui.field}>
          <span>{tr('Date')}</span>
          <input type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} />
        </label>
        {kind === 'out' && <PhotoStrip entryId={entry.id} canEdit={!readOnly} />}
        {shared && inGroup && entry.group_id && (
          <div className={ui.photoStrip}>
            <p className={ui.fieldLabel}>{tr('History')}</p>
            <HistoryList entryId={entry.id} groupId={entry.group_id} />
          </div>
        )}
        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
        <div className={ui.btnRow}>
          <button type="submit" className={ui.btn()} disabled={readOnly}>{tr('Save')}</button>
          <button type="button" className={ui.btn('ghost')} onClick={close}>{readOnly ? tr('Close') : tr('Cancel')}</button>
        </div>
        {!readOnly && !frozen && (
          <button type="button" className={ui.btn('danger', 'md', 'w-full')} onClick={remove}>
            {confirmDelete ? tr('Tap again to delete') : shared ? tr('Delete shared expense') : tr('Delete payment')}
          </button>
        )}
      </form>
    </dialog>
  );
}

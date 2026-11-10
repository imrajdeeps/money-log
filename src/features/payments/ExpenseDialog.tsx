import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { memberName } from '../../core/groups.ts';
import type { Group } from '../../core/groups.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR, isoDate, myShare } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import { CategorySelect } from '../../ui/CategorySelect.tsx';
import { HistoryList } from './HistoryList.tsx';
import { PhotoStrip } from './PhotoStrip.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Someone else's shared expense, read-only: what it was, how it is split, its photos and history, and the one thing you
// can do with it: record your own share as a payment of your own, so your Month view and Log export include it.
export function ExpenseDialog({ entry, group, onClose }: { entry: Entry; group: Group; onClose: () => void }) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const share = myShare(entry, app.me);
  const added = app.entries.find((x) => x.share_of === entry.id);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState(tr('{0} (my share, {1})', entry.note || entry.category, group.name));
  const [date, setDate] = useState(entry.entry_date);
  const [error, setError] = useState('');
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const who = (uid: string | null) => (uid === app.me ? tr('You') : memberName(app.members, group.id, uid));

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!category) return setError(tr('Pick a category.'));
    if (date > isoDate()) return setError(tr('The date cannot be in the future.'));
    await app.addEntry({ amount: share, category, method: null, note: note.trim().slice(0, 200), date, shareOf: entry.id });
    app.toast(tr('Added {0} to your budget', fmtINR(share)));
    ref.current?.close();
  }

  return (
    <dialog ref={ref} onClose={(e) => { if (e.target === e.currentTarget) onClose(); }} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-labelledby="exp-title">
      <h2 id="exp-title">{entry.category}</h2>
      <ul className={ui.facts + ' text-[13px]'}>
        <li><b>{tr('Total')}</b>{tr(': {0} on {1}', fmtINR(entry.amount), shortDate(entry.entry_date))}</li>
        <li><b>{tr('Paid by')}</b>: {who(entry.paid_by)}</li>
        {entry.note && <li><b>{tr('Note')}</b>: {entry.note}</li>}
        <li><b>{tr('Split')}</b>: {Object.entries(entry.shares ?? {}).filter(([, v]) => v > 0).map(([uid, v]) => `${who(uid)} ${fmtINR(v)}`).join(', ')}</li>
      </ul>
      <PhotoStrip entryId={entry.id} canEdit={false} />

      {share > 0 && (added ? (
        <p className={ui.msg('good')} role="status">{tr('Added to your budget: {0} under {1} on {2}.', fmtINR(added.amount), added.category, shortDate(added.entry_date))}</p>
      ) : adding ? (
        <form onSubmit={save} noValidate className={ui.settleForm}>
          <h3>{tr('Add my {0} to my budget', fmtINR(share))}</h3>
          <p className="text-muted text-[13px]">{tr('This makes a payment of your own for your share. It does not change the group\'s balances.')}</p>
          <label className={ui.field} htmlFor="share-cat"><span>{tr('Category')}</span></label>
          <CategorySelect id="share-cat" value={category} onChange={(v) => { setCategory(v); setError(''); }} />
          <label className={ui.field}><span>{tr('Note')}</span><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>
          <label className={ui.field}><span>{tr('Date')}</span><input type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></label>
          {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
          <div className={ui.btnRow}><button type="submit" className={ui.btn()}>{tr('Add to my budget')}</button><button type="button" className={ui.btn('ghost')} onClick={() => setAdding(false)}>{tr('Cancel')}</button></div>
        </form>
      ) : (
        <button type="button" className={ui.btn()} onClick={() => setAdding(true)}>{tr('Add my {0} to my budget', fmtINR(share))}</button>
      ))}

      <h3 className="text-[16px] mt-5 mb-2">{tr('History')}</h3>
      <HistoryList entryId={entry.id} groupId={group.id} />
      <button type="button" className={ui.btn('ghost')} onClick={() => ref.current?.close()}>{tr('Close')}</button>
    </dialog>
  );
}

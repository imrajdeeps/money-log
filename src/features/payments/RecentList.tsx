import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../../data/context.tsx';
import { EditDialog } from './EditDialog.tsx';
import { shortDate } from '../../core/format.ts';
import { byRecent, fmtINR, myShare } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// One payment as a tappable row: category, the day, method, note, your share.
export function PaymentRow({ entry: e, onOpen, compact = false }: Readonly<{ entry: Entry; onOpen: (e: Entry) => void; compact?: boolean }>) {
  const app = useApp();
  const groupName = (id: string | null) => app.groups.find((g) => g.id === id)?.name ?? 'a group';
  return (
    <button type="button" className={compact ? ui.rowCompact : ui.row} onClick={() => onOpen(e)}>
      <span className={ui.rowMain()}>
        <b>{e.category}</b>
        <small>{[shortDate(e.entry_date), e.method, e.note, e.group_id ? tr('shared with {0}, total {1}', groupName(e.group_id), fmtINR(e.amount)) : ''].filter(Boolean).join(' · ')}</small>
      </span>
      <span className="font-bold tabular-nums">{fmtINR(myShare(e, app.me))}</span>
      {app.syncEnabled && e.dirty ? <span className={ui.dot} role="img" aria-label={tr('Waiting to sync')} /> : null}
    </button>
  );
}

// The latest payments, newest first; tapping one opens it to edit or delete. The Home tile shows a few without a frame
// (plain), the Recent sheet shows the last 20 in a framed list.
export function RecentList({ limit, plain = false, empty }: Readonly<{ limit: number; plain?: boolean; empty: ReactNode }>) {
  const app = useApp();
  const [editing, setEditing] = useState<Entry | null>(null);
  const recent = useMemo(() => app.entries.slice().sort(byRecent).slice(0, limit), [app.entries, limit]);
  return (
    <>
      {recent.length === 0 ? empty : (
        <ul className={plain ? ui.list(true, 'my-0 -mx-2') : ui.list()}>
          {recent.map((e) => <li key={e.id}><PaymentRow entry={e} onOpen={setEditing} compact={plain} /></li>)}
        </ul>
      )}
      {/* outside the list: deleting the last payment empties the list before the dialog has reported that it closed */}
      {editing && <EditDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

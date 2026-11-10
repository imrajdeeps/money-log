import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { describeHistory } from '../../core/history.ts';
import type { HistoryRow } from '../../core/history.ts';
import { memberName } from '../../core/groups.ts';
import * as ui from '../../ui/styles.ts';

// What changed in a shared expense and who changed it. Needs a connection: the history lives in the cloud, not on the phone.
export function HistoryList({ entryId, groupId }: { entryId: string; groupId: string }) {
  const app = useApp();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const name = (uid: string) => (uid === app.me ? 'You' : memberName(app.members, groupId, uid));

  async function load() {
    setBusy(true);
    setError('');
    try {
      setRows(await app.fetchHistory(entryId));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m === 'No connection' ? 'You are offline. The history is kept in the cloud.' : m);
    } finally {
      setBusy(false);
    }
  }

  if (!rows) {
    return (
      <div>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={() => { void load(); }}>{busy ? 'Loading…' : 'Show history'}</button>
        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      </div>
    );
  }
  if (!rows.length) return <p className="text-muted text-[13px]">No history kept for this expense yet.</p>;
  return (
    <ul className={ui.list(false, 'my-2 mx-0')} aria-label="History">
      {rows.map((r) => (
        <li key={r.id} className={ui.histRow}>
          <p className="text-[13px]"><b>{name(r.changed_by)}</b> · <span className="text-muted">{new Date(r.changed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></p>
          {describeHistory(r, name).map((line, i) => <p key={i} className="text-[13px]">{line}</p>)}
        </li>
      ))}
    </ul>
  );
}

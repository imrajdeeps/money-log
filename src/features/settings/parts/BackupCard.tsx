import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { makeBackup, parseBackup } from '../../../data/backup.ts';
import { readTextFile, saveFile } from '../../../ui/files.ts';
import { stamp } from '../../../core/format.ts';
import { errText } from './shared.ts';

export function BackupCard() {
  const app = useApp();
  const [msg, setMsg] = useState('');

  async function download() {
    const body = JSON.stringify(makeBackup(app.allEntries, app.plan, new Date().toISOString(), { due: app.due, networth: app.net, dueDone: app.doneMap, categories: app.mine, recurring: app.recurring, goals: app.goals }), null, 2);
    const r = await saveFile(`money-log-backup-${stamp()}.json`, body, 'application/json');
    if (r !== 'cancelled') app.toast(r === 'shared' ? 'Backup shared.' : 'Backup downloaded.');
  }

  async function restore(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const r = parseBackup(await readTextFile(f, 20_000_000));
      if (!r.ok) { setMsg(r.error); return; }
      if (!window.confirm(`Restore from this backup? It holds ${r.entries.length} payment${r.entries.length === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} that can't be read will be skipped)` : ''}. Payments already here stay unless the backup copy is newer.`)) return;
      const res = await app.restoreBackup(r);
      setMsg(`Restored: ${res.added} added, ${res.updated} updated${res.blocksReplaced ? `, ${res.blocksReplaced} plan block${res.blocksReplaced === 1 ? '' : 's'} replaced` : ''}.`);
    } catch (e) { setMsg(errText(e)); }
  }

  return (
    <div className="card">
      <h2>Backup</h2>
      <p className="muted small">A file with all your payments and the plan. Keep one somewhere safe (iCloud Drive, for example) from time to time.</p>
      <div className="btnrow">
        <button type="button" className="btn" onClick={download}>Download backup</button>
        <label className="btn ghost filebtn">
          Restore
          <input type="file" accept=".json,application/json" onChange={restore} />
        </label>
      </div>
      {msg && <p className="msg" role="status">{msg}</p>}
    </div>
  );
}

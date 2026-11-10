import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { makeBackup, parseBackup } from '../../../data/backup.ts';
import { readTextFile, saveFile } from '../../../ui/files.ts';
import { stamp } from '../../../core/format.ts';
import { errText } from './shared.ts';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

export function BackupCard() {
  const app = useApp();
  const [msg, setMsg] = useState('');

  async function download() {
    const body = JSON.stringify(makeBackup(app.allEntries, app.plan, new Date().toISOString(), { due: app.due, networth: app.net, dueDone: app.doneMap, categories: app.mine, recurring: app.recurring, goals: app.goals }), null, 2);
    const r = await saveFile(`money-log-backup-${stamp()}.json`, body, 'application/json');
    if (r !== 'cancelled') app.toast(r === 'shared' ? tr('Backup shared.') : tr('Backup downloaded.'));
  }

  async function restore(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const r = parseBackup(await readTextFile(f, 20_000_000));
      if (!r.ok) { setMsg(r.error); return; }
      if (!window.confirm(tr('Restore from this backup? It holds {0} payment{1}{2}. Payments already here stay unless the backup copy is newer.', r.entries.length, r.entries.length === 1 ? '' : 's', r.skipped ? tr(" ({0} that can't be read will be skipped)", r.skipped) : ''))) return;
      const res = await app.restoreBackup(r);
      setMsg(tr('Restored: {0} added, {1} updated{2}.', res.added, res.updated, res.blocksReplaced ? tr(', {0} plan block{1} replaced', res.blocksReplaced, res.blocksReplaced === 1 ? '' : 's') : ''));
    } catch (e) { setMsg(errText(e)); }
  }

  return (
    <div className={ui.card()}>
      <h2>{tr('Backup')}</h2>
      <p className="text-muted text-[13px]">{tr('A file with all your payments and the plan. Keep one somewhere safe (iCloud Drive, for example) from time to time.')}</p>
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn()} onClick={download}>{tr('Download backup')}</button>
        <label className={ui.btn('ghost', 'md', 'mt-0')}>
          {tr('Restore')}
          <input type="file" accept=".json,application/json" onChange={restore} />
        </label>
      </div>
      {msg && <p className={ui.msg()} role="status">{msg}</p>}
    </div>
  );
}

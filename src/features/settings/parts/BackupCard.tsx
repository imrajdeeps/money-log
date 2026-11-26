import { useState } from 'react';
import { ask } from '../../../ui/confirm.tsx';
import type { ChangeEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { saveLastBackup } from '../../../data/backupSeen.ts';
import { makeBackup, parseBackup } from '../../../data/backup.ts';
import { readTextFile, saveFile } from '../../../ui/files.ts';
import { shortDate, stamp } from '../../../core/format.ts';
import { isoDate } from '../../../core/logic.ts';
import { useLastBackup } from '../../../data/useLastBackup.ts';
import * as ps from './partStyles.ts';
import { errText } from './shared.ts';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

// What to ask before restoring: how many payments the file holds, and how many unreadable ones will be skipped.
const restoreQuestion = (r: { entries: readonly unknown[]; skipped: number }): string =>
  tr('Restore from this backup? It holds {0} payment{1}{2}. Payments already here stay unless the backup copy is newer.', r.entries.length, r.entries.length === 1 ? '' : 's', r.skipped ? tr(" ({0} that can't be read will be skipped)", r.skipped) : '');

export function BackupCard() {
  const app = useApp();
  const [msg, setMsg] = useState('');
  const last = useLastBackup();

  async function download() {
    const body = JSON.stringify(makeBackup(app.allEntries, new Date().toISOString(), { categories: app.mine, recurring: app.recurring, goals: app.goals }), null, 2);
    const r = await saveFile(`money-log-backup-${stamp()}.json`, body, 'application/json');
    if (r === 'cancelled') return;
    saveLastBackup(Date.now());
    app.toast(r === 'shared' ? tr('Backup shared.') : tr('Backup downloaded.'));
  }

  async function restore(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const r = parseBackup(await readTextFile(f, 20_000_000));
      if (!r.ok) { setMsg(r.error); return; }
      if (!(await ask(restoreQuestion(r), tr('Restore'), 'go'))) return;
      const res = await app.restoreBackup(r);
      setMsg(tr('Restored: {0} added, {1} updated.', res.added, res.updated));
    } catch (e) { setMsg(errText(e)); }
  }

  return (
    <>
      <div className={ps.card + ' gap-2.5'}>
        <h3 className={ps.title}>{tr('Download a backup')}</h3>
        <p className={ps.note}>{tr('One file with every payment, category and budget, recurring payment, goal, net worth and due item.')} {last ? tr('Last backup: {0}.', shortDate(isoDate(new Date(last)))) : tr('No backup from this phone yet.')} {tr('Photos are not included.')}</p>
        <button type="button" className={ui.btn('solid', 'none', ps.main)} onClick={download}>{tr('Download backup')}</button>
      </div>
      <div className={ps.card + ' gap-2.5'}>
        <h3 className={ps.title}>{tr('Restore from a backup')}</h3>
        <p className={ps.note}>{tr('Adds what is in the file. Payments already on this phone are kept; nothing is saved twice.')}</p>
        <label className={ui.btn('outline', 'none', ps.main)}>
          {tr('Choose a backup file')}
          <input type="file" accept=".json,application/json" onChange={restore} />
        </label>
        {msg && <p className={ui.msg()} role="status">{msg}</p>}
      </div>
    </>
  );
}

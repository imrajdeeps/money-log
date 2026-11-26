import { useState } from 'react';
import { useApp } from '../../../data/context.tsx';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

// Erase everything on this phone, as on the design: what goes, and a word to type before the button works.
export function DangerCard() {
  const app = useApp();
  const [typed, setTyped] = useState('');
  const goals = Object.values(app.goals).filter((g) => g.k === 'g' && !g.x).length;
  const photos = app.receipts.filter((r) => !r.deleted_at).length;
  const waiting = app.sync.pending;
  async function erase() {
    await app.eraseAll();
    app.toast(tr('This phone has been erased.'));
  }
  return (
    <div className="bg-bad-bg rounded-card p-4 flex flex-col gap-2.5">
      <h3 className="m-0 text-[16px] font-bold text-bad">{tr('Erase everything on this phone')}</h3>
      <p className="m-0 text-[15px] leading-[22px] text-ink">{tr('This removes {0} payments, {1} groups, {2} goals, {3} receipt photos and your settings from this phone, and signs you out. Your synced account is not touched. This cannot be undone.', app.entries.length, app.groups.length, goals, photos)}</p>
      {waiting > 0 && <p className="m-0 text-[14px] font-semibold text-bad" role="alert">{tr('{0} change{1} not reached the cloud and will be lost.', waiting, waiting === 1 ? ' has' : 's have')}</p>}
      <label className={ui.fieldBare}><span>{tr('Type ERASE to confirm')}</span><input className="tracking-[0.08em]" value={typed} autoCapitalize="characters" autoComplete="off" onChange={(e) => setTyped(e.target.value)} /></label>
      <button type="button" className={ui.btn('danger', 'none', 'min-h-[52px] text-[16px]')} disabled={typed.trim().toUpperCase() !== 'ERASE'} onClick={() => { void erase(); }}>{tr('Erase everything')}</button>
      <p className="m-0 text-[13px] text-muted">{tr('Download a backup first if you might want this data again.')}</p>
    </div>
  );
}

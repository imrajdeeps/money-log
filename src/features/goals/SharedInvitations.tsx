import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { useProfile } from '../../data/useProfile.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import type { SharedGoal } from '../../core/sharedGoals.ts';
import { useAction } from '../groups/index.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Invitations to shared goals: who asked, what for, and a name to use if you accept. You see nothing else of the goal until you join.
export function SharedInvitations({ invites, onChanged }: Readonly<{ invites: SharedGoal[]; onChanged: () => void }>) {
  const app = useApp();
  const act = useAction();
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  if (invites.length === 0) return null;
  const answer = (g: SharedGoal, accept: boolean) => {
    if (accept && name.trim() === '') { act.setError(tr('Enter the name the others will see you as.')); return; }
    void act.run(() => app.sharedGoals.answer(g.id, accept, name.trim()), accept ? tr('You joined {0}', g.name) : tr('Invitation declined')).then((ok) => { if (ok) onChanged(); });
  };
  return (
    <div className="flex flex-col gap-2">
      {invites.map((g) => (
        <div key={g.id} className="flex flex-col gap-2.5 bg-press rounded-card px-4 py-3.5">
          <p className="m-0 text-[15px] leading-[21px]"><strong>{g.creator_name || tr('Someone')}</strong> {tr('invited you to the shared goal')} <strong>{g.name}</strong> ({fmtINR(g.target)}, {tr('by {0}', shortDate(g.date))}).</p>
          <label className={ui.fieldBare}><span>{tr('Your name, if you join')}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
          <div className="flex gap-2">
            <button type="button" className={ui.btn('solid', 'none', 'min-h-11 px-4 text-[15px]')} disabled={act.busy} onClick={() => answer(g, true)}>{tr('Accept')}</button>
            <button type="button" className={ui.btn('outline', 'none', 'min-h-11 px-4 text-[15px]')} disabled={act.busy} onClick={() => answer(g, false)}>{tr('Decline')}</button>
          </div>
        </div>
      ))}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </div>
  );
}

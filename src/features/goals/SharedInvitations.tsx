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
    <div className={ui.card()}>
      <h3>{tr('Invitations')}</h3>
      <label className={ui.field}><span>{tr('Your name, if you join')}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
      <ul className={ui.list(true)}>
        {invites.map((g) => (
          <li key={g.id} className="py-2">
            <b>{g.name}</b>
            <p className="m-0 text-[13px] text-muted">{tr('{0} asked you to join this goal. Target {1} by {2}.', g.creator_name || tr('Someone'), fmtINR(g.target), shortDate(g.date))}</p>
            <div className={ui.btnRow}>
              <button type="button" className={ui.btn('solid', 'small')} disabled={act.busy} onClick={() => answer(g, true)}>{tr('Join')}</button>
              <button type="button" className={ui.btn('ghost', 'small')} disabled={act.busy} onClick={() => answer(g, false)}>{tr('Decline')}</button>
            </div>
          </li>
        ))}
      </ul>
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </div>
  );
}

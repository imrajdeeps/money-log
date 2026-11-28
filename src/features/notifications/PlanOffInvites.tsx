import { useEffect, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import type { OpenTarget } from '../../core/notifications.ts';
import type { SharedGoal } from '../../core/sharedGoals.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Shared-goal invitations while Plan is off (version 2.2): they live on Plan, so with Plan off they would show nowhere. The bell
// counts them and lists them, with a button that turns Plan on and opens the goals. Asked from the server (invitations are not
// kept on the phone); offline or signed out there are none.

/** The shared-goal invitations waiting while Plan is off (none while it is on). */
export function usePlanOffInvites(): SharedGoal[] {
  const app = useApp();
  const planOff = !app.features.has('plan');
  const signedIn = app.syncEnabled && Boolean(app.me);
  const [invites, setInvites] = useState<SharedGoal[]>([]);
  useEffect(() => {
    if (!planOff || !signedIn) return;
    let live = true;
    app.sharedGoals.load().then((goals) => { if (live) setInvites(goals.filter((g) => g.me === 'invited')); }).catch(() => { /* offline or not set up: nothing to show */ });
    return () => { live = false; };
  }, [planOff, signedIn, app.sharedGoals]);
  return planOff && signedIn ? invites : [];
}

export function PlanOffInvites({ invites, onOpen }: Readonly<{ invites: readonly SharedGoal[]; onOpen: (t: OpenTarget) => void }>) {
  const app = useApp();
  if (invites.length === 0) return null;
  const open = async () => {
    try {
      await app.setFeature('plan', true);
      onOpen({ to: 'plan', part: 'goals' });
    } catch (e) {
      app.toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-2.5" aria-label={tr('Invitations')}>
      {invites.map((g) => (
        <li key={g.id} className="bg-card border border-line rounded-card px-4 py-3.5 grid grid-cols-[10px_minmax(0,1fr)] gap-3">
          <span className="w-2.5 h-2.5 mt-1.5 rounded-full bg-warn" aria-hidden="true" />
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-[15px] font-[650] [overflow-wrap:anywhere]">{tr('{0} invited you to a shared goal: {1}', g.creator_name || tr('Someone'), g.name)}</span>
            <span className="text-[14px] leading-5 text-muted">{tr('Shared goals are in Plan, which is off. Turning it on shows the invitation there, to accept or decline.')}</span>
            <div className="pt-1"><button type="button" className={ui.btn('solid', 'none', 'min-h-10 px-3.5 text-[14px]')} onClick={() => void open()}>{tr('Turn on Plan and open')}</button></div>
          </div>
        </li>
      ))}
    </ul>
  );
}

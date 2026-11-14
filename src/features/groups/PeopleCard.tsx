import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { fromPaise } from '../../core/groups.ts';
import type { Group, Member } from '../../core/groups.ts';
import { fmtINR } from '../../core/logic.ts';
import { PersonRow } from './PersonRow.tsx';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Everyone in one group: their role, your own name here, who an admin can make admin or remove (once that person is settled up),
// and leaving. `bal` is each person's balance in paise.
export function PeopleCard({ group, people, former, bal, isAdmin, onLeft }: Readonly<{
  group: Group; people: Member[]; former: Member[]; bal: Record<string, number>; isAdmin: boolean; onLeft: () => void;
}>) {
  const app = useApp();
  const me = app.me ?? '';
  const act = useAction();
  const [renaming, setRenaming] = useState<string | null>(null);
  const myBalance = bal[me] ?? 0;
  // Until the database has version 1.28 no group has a primary admin: then every admin keeps the old powers.
  const legacy = !app.groups.some((g) => g.primary_admin);
  const iAmPrimary = group.primary_admin === me;
  const powers = { isAdmin, manageAdmins: legacy ? isAdmin : iAmPrimary };
  const primaryHere = people.some((m) => m.user_id === group.primary_admin && m.role === 'admin');
  const oldestAdmin = people.filter((m) => m.role === 'admin').sort((x, y) => x.joined_at.localeCompare(y.joined_at) || x.user_id.localeCompare(y.user_id))[0];
  const canClaim = !legacy && !primaryHere && oldestAdmin?.user_id === me; // the primary admin is gone: the longest-standing admin takes over
  const mustHandOver = !legacy && iAmPrimary && people.length > 1;

  return (
    <div className={ui.card()}>
      <h3>{tr('People')}</h3>
      <ul className={ui.list(true)}>
        {people.map((m) => <PersonRow key={m.user_id} group={group} m={m} balance={bal[m.user_id] ?? 0} powers={powers} act={act} onRename={() => setRenaming(m.display_name)} />)}
      </ul>
      {renaming !== null && (
        <form className={ui.settleForm} onSubmit={(ev) => { ev.preventDefault(); if (renaming.trim()) void act.run(() => app.setDisplayName(group.id, renaming.trim()), 'Name changed').then((ok) => { if (ok) setRenaming(null); }); }}>
          <label className={ui.field}><span>{tr('Your name in this group')}</span><input value={renaming} maxLength={40} onChange={(e) => setRenaming(e.target.value)} /></label>
          <div className={ui.btnRow}><button type="submit" className={ui.btn()} disabled={act.busy}>{tr('Save name')}</button><button type="button" className={ui.btn('ghost')} onClick={() => setRenaming(null)}>{tr('Cancel')}</button></div>
        </form>
      )}
      {former.length > 0 && <p className="text-muted text-[13px]">{tr('Left the group: {0}. Their earlier expenses stay in the list.', former.map((m) => m.display_name).join(', '))}</p>}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
      {canClaim && <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} disabled={act.busy} onClick={() => { if (window.confirm('This group has no primary admin. Take over as primary admin?')) void act.run(() => app.claimPrimaryAdmin(group.id), 'Done'); }}>{tr('Take over as primary admin')}</button>}
      <button type="button" className={ui.btn('danger', 'md', ui.inCard)} disabled={act.busy || myBalance !== 0 || mustHandOver}
        onClick={() => { if (window.confirm(tr('Leave {0}? You will stop seeing it. Expenses you added stay in the group for the others.', group.name))) void act.run(() => app.leaveGroup(group.id), 'You left the group').then((ok) => { if (ok) onLeft(); }); }}>
        {tr('Leave this group')}
      </button>
      {mustHandOver && <p className="text-muted text-[13px]">{tr('You are the primary admin. Make someone else the primary admin before you leave.')}</p>}
      {myBalance !== 0 && <p className="text-muted text-[13px]">{tr('You can leave once you have settled up: your balance here is {0}.', myBalance > 0 ? tr('{0} owed to you', fmtINR(fromPaise(myBalance))) : tr('{0} that you owe', fmtINR(fromPaise(-myBalance))))}</p>}
    </div>
  );
}

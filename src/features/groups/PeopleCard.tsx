import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { fromPaise } from '../../core/groups.ts';
import type { Group, Member } from '../../core/groups.ts';
import { fmtINR } from '../../core/logic.ts';
import { PersonRow } from './PersonRow.tsx';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import * as st from './settingsStyles.ts';
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

  let leaveWhy = tr('You will stop seeing it. Your past expenses stay in the group.');
  if (mustHandOver) leaveWhy = tr('You are the primary admin. Make someone else primary admin first, then you can leave. Your past expenses stay in the group.');
  else if (myBalance !== 0) leaveWhy = tr('You can leave once you have settled up: your balance here is {0}.', myBalance > 0 ? tr('{0} owed to you', fmtINR(fromPaise(myBalance))) : tr('{0} that you owe', fmtINR(fromPaise(-myBalance))));
  const sorted = [...people].sort((a, b) => Number(b.user_id === me) - Number(a.user_id === me));

  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className={st.title}>{tr('People')}</h3>
        <div className="bg-card border border-line rounded-card px-4">
          <ul className="list-none m-0 p-0 [&>li+li]:border-t [&>li+li]:border-line">
            {sorted.map((m) => <PersonRow key={m.user_id} group={group} m={m} balance={bal[m.user_id] ?? 0} powers={powers} act={act} onRename={() => setRenaming(m.display_name)} />)}
          </ul>
          {renaming !== null && (
            <form className="flex flex-col gap-3 border-t border-line py-3.5" onSubmit={(ev) => { ev.preventDefault(); if (renaming.trim()) void act.run(() => app.setDisplayName(group.id, renaming.trim()), 'Name changed').then((ok) => { if (ok) setRenaming(null); }); }}>
              <label className={ui.fieldBare}><span>{tr('Your name in this group')}</span><input value={renaming} maxLength={40} onChange={(e) => setRenaming(e.target.value)} /></label>
              <div className="flex gap-2.5 [&>*]:flex-1"><button type="submit" className={ui.btn()} disabled={act.busy}>{tr('Save name')}</button><button type="button" className={ui.btn('outline')} onClick={() => setRenaming(null)}>{tr('Cancel')}</button></div>
            </form>
          )}
          {former.length > 0 && <p className={st.small + ' border-t border-line py-3'}>{tr('Left the group: {0}. Their earlier expenses stay in the list.', former.map((m) => m.display_name).join(', '))}</p>}
          {canClaim && <button type="button" className={ui.btn('outline', 'none', st.outline44 + ' mb-3.5')} disabled={act.busy} onClick={() => { if (window.confirm('This group has no primary admin. Take over as primary admin?')) void act.run(() => app.claimPrimaryAdmin(group.id), 'Done'); }}>{tr('Take over as primary admin')}</button>}
        </div>
        {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
      </section>
      <section className={st.section}>
        <h3 className={st.title}>{tr('Leave this group')}</h3>
        <p className={st.note}>{leaveWhy}</p>
        <button type="button" className={ui.btn('danger')} disabled={act.busy || myBalance !== 0 || mustHandOver}
          onClick={() => { if (window.confirm(tr('Leave {0}? You will stop seeing it. Expenses you added stay in the group for the others.', group.name))) void act.run(() => app.leaveGroup(group.id), 'You left the group').then((ok) => { if (ok) onLeft(); }); }}>
          {tr('Leave {0}', group.name)}
        </button>
      </section>
    </>
  );
}

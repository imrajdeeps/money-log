import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { fromPaise } from '../../core/groups.ts';
import type { Group, Member } from '../../core/groups.ts';
import { fmtINR } from '../../core/logic.ts';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Why a person cannot be removed yet, in words (a hover tooltip is never seen on a phone).
const settleFirst = (paise: number): string =>
  paise > 0 ? tr('settle up first: they are owed {0}', fmtINR(fromPaise(paise))) : tr('settle up first: they owe {0}', fmtINR(fromPaise(-paise)));

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

  return (
    <div className={ui.card()}>
      <h3>{tr('People')}</h3>
      <ul className={ui.list(true)}>
        {people.map((m) => {
          const b = bal[m.user_id] ?? 0;
          const other = isAdmin && m.user_id !== me;
          return (
            <li key={m.user_id} className={ui.dueRow()}>
              <span className={ui.rowMain(true)}>
                <b>{m.display_name}{m.user_id === me ? ' (you)' : ''}</b>
                <small>{m.role === 'admin' ? tr('Admin') : tr('Member')}{other && b !== 0 ? ` · ${settleFirst(b)}` : ''}</small>
              </span>
              {m.user_id === me && <button type="button" className={ui.btn('ghost', 'small')} onClick={() => setRenaming(m.display_name)}>{tr('Rename')}</button>}
              {other && m.role === 'member' && <button type="button" className={ui.btn('ghost', 'small')} disabled={act.busy} onClick={() => { if (window.confirm(`Make ${m.display_name} an admin? Admins can invite and remove people.`)) void act.run(() => app.makeAdmin(group.id, m.user_id), 'Done'); }}>{tr('Make admin')}</button>}
              {other && <button type="button" className={ui.btn('danger', 'small')} disabled={act.busy || b !== 0} onClick={() => { if (window.confirm(tr('Remove {0} from {1}? The invite code changes too.', m.display_name, group.name))) void act.run(() => app.removeMember(group.id, m.user_id), 'Removed'); }}>{tr('Remove')}</button>}
            </li>
          );
        })}
      </ul>
      {renaming !== null && (
        <form className={ui.settleForm} onSubmit={(ev) => { ev.preventDefault(); if (renaming.trim()) void act.run(() => app.setDisplayName(group.id, renaming.trim()), 'Name changed').then((ok) => { if (ok) setRenaming(null); }); }}>
          <label className={ui.field}><span>{tr('Your name in this group')}</span><input value={renaming} maxLength={40} onChange={(e) => setRenaming(e.target.value)} /></label>
          <div className={ui.btnRow}><button type="submit" className={ui.btn()} disabled={act.busy}>{tr('Save name')}</button><button type="button" className={ui.btn('ghost')} onClick={() => setRenaming(null)}>{tr('Cancel')}</button></div>
        </form>
      )}
      {former.length > 0 && <p className="text-muted text-[13px]">{tr('Left the group: {0}. Their earlier expenses stay in the list.', former.map((m) => m.display_name).join(', '))}</p>}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
      <button type="button" className={ui.btn('danger', 'md', ui.inCard)} disabled={act.busy || myBalance !== 0}
        onClick={() => { if (window.confirm(tr('Leave {0}? You will stop seeing it. Expenses you added stay in the group for the others.', group.name))) void act.run(() => app.leaveGroup(group.id), 'You left the group').then((ok) => { if (ok) onLeft(); }); }}>
        {tr('Leave this group')}
      </button>
      {myBalance !== 0 && <p className="text-muted text-[13px]">{tr('You can leave once you have settled up: your balance here is {0}.', myBalance > 0 ? tr('{0} owed to you', fmtINR(fromPaise(myBalance))) : tr('{0} that you owe', fmtINR(fromPaise(-myBalance))))}</p>}
    </div>
  );
}

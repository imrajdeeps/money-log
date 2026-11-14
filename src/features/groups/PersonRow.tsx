import { useApp } from '../../data/context.tsx';
import { fromPaise } from '../../core/groups.ts';
import type { Group, Member } from '../../core/groups.ts';
import { fmtINR } from '../../core/logic.ts';
import type { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Why a person cannot be removed yet, in words (a hover tooltip is never seen on a phone).
const settleFirst = (paise: number): string =>
  paise > 0 ? tr('settle up first: they are owed {0}', fmtINR(fromPaise(paise))) : tr('settle up first: they owe {0}', fmtINR(fromPaise(-paise)));

const roleLabel = (isPrimary: boolean, role: Member['role']): string => {
  if (isPrimary) return tr('Primary admin');
  return role === 'admin' ? tr('Admin') : tr('Member');
};

export interface Powers {
  isAdmin: boolean; // the person looking is an admin: invite, and remove people who have settled up
  manageAdmins: boolean; // the person looking may make or remove admins and hand the primary role over
}

// One person in a group's list, with what the person looking may do about them.
export function PersonRow({ group, m, balance, powers, act, onRename }: Readonly<{
  group: Group; m: Member; balance: number; powers: Powers; act: ReturnType<typeof useAction>; onRename: () => void;
}>) {
  const app = useApp();
  const mine = m.user_id === app.me;
  const isPrimary = group.primary_admin === m.user_id;
  const other = !mine;
  const run = (fn: () => Promise<unknown>, done: string) => { void act.run(fn, done); };
  const ask = (q: string) => window.confirm(q);
  const canRemove = powers.isAdmin && other && !isPrimary;
  return (
    <li className={ui.dueRow()}>
      <span className={ui.rowMain(true)}>
        <b>{m.display_name}{mine ? ' (you)' : ''}</b>
        <small>{roleLabel(isPrimary, m.role)}{canRemove && balance !== 0 ? ` · ${settleFirst(balance)}` : ''}</small>
      </span>
      {mine && <button type="button" className={ui.btn('ghost', 'small')} onClick={onRename}>{tr('Rename')}</button>}
      {powers.manageAdmins && other && m.role === 'member' && (
        <button type="button" className={ui.btn('ghost', 'small')} disabled={act.busy} onClick={() => { if (ask(`Make ${m.display_name} an admin? Admins can invite and remove people.`)) run(() => app.makeAdmin(group.id, m.user_id), 'Done'); }}>{tr('Make admin')}</button>
      )}
      {powers.manageAdmins && other && m.role === 'admin' && !isPrimary && (
        <button type="button" className={ui.btn('ghost', 'small')} disabled={act.busy} onClick={() => { if (ask(`Take admin rights away from ${m.display_name}?`)) run(() => app.revokeAdmin(group.id, m.user_id), 'Done'); }}>{tr('Remove admin')}</button>
      )}
      {powers.manageAdmins && other && (
        <button type="button" className={ui.btn('ghost', 'small')} disabled={act.busy} onClick={() => { if (ask(`Make ${m.display_name} the primary admin? You stay an admin, but only they can then make or remove admins.`)) run(() => app.makePrimaryAdmin(group.id, m.user_id), 'Done'); }}>{tr('Make primary admin')}</button>
      )}
      {canRemove && (
        <button type="button" className={ui.btn('danger', 'small')} disabled={act.busy || balance !== 0} onClick={() => { if (ask(tr('Remove {0} from {1}? The invite code changes too.', m.display_name, group.name))) run(() => app.removeMember(group.id, m.user_id), 'Removed'); }}>{tr('Remove')}</button>
      )}
    </li>
  );
}

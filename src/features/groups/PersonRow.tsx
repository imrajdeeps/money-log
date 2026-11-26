import { useApp } from '../../data/context.tsx';
import { fromPaise } from '../../core/groups.ts';
import type { Group, Member } from '../../core/groups.ts';
import { allowedFor } from './personPowers.ts';
import type { Allowed, Powers } from './personPowers.ts';
import { fmtINR } from '../../core/logic.ts';
import type { useAction } from './useAction.ts';
import * as st from './settingsStyles.ts';
import { tr } from '../../core/i18n.ts';

// Why a person cannot be removed yet, in words (a hover tooltip is never seen on a phone).
const settleFirst = (paise: number): string =>
  paise > 0 ? tr('settle up first: they are owed {0}', fmtINR(fromPaise(paise))) : tr('settle up first: they owe {0}', fmtINR(fromPaise(-paise)));

const roleLabel = (isPrimary: boolean, role: Member['role']): string => {
  if (isPrimary) return tr('Primary admin');
  return role === 'admin' ? tr('Admin') : tr('Member');
};

// The buttons for one person: only those the person looking may use. Each asks first, and the group's own messages say why a person cannot go yet.
function PersonButtons({ group, m, balance, allowed, act, onRename }: Readonly<{ group: Group; m: Member; balance: number; allowed: Allowed; act: ReturnType<typeof useAction>; onRename: () => void }>) {
  const app = useApp();
  const run = (fn: () => Promise<unknown>, done: string) => { void act.run(fn, done); };
  const ask = (q: string) => window.confirm(q);
  return (
    <div className="flex flex-wrap gap-2 empty:hidden">
      {allowed.rename && <button type="button" className={st.personBtn()} onClick={onRename}>{tr('Rename')}</button>}
      {allowed.makeAdmin && (
        <button type="button" className={st.personBtn()} disabled={act.busy} onClick={() => { if (ask(`Make ${m.display_name} an admin? Admins can invite and remove people.`)) run(() => app.makeAdmin(group.id, m.user_id), 'Done'); }}>{tr('Make admin')}</button>
      )}
      {allowed.revokeAdmin && (
        <button type="button" className={st.personBtn()} disabled={act.busy} onClick={() => { if (ask(`Take admin rights away from ${m.display_name}?`)) run(() => app.revokeAdmin(group.id, m.user_id), 'Done'); }}>{tr('Remove admin')}</button>
      )}
      {allowed.makePrimary && (
        <button type="button" className={st.personBtn()} disabled={act.busy} onClick={() => { if (ask(`Make ${m.display_name} the primary admin? You stay an admin, but only they can then make or remove admins.`)) run(() => app.makePrimaryAdmin(group.id, m.user_id), 'Done'); }}>{tr('Make primary admin')}</button>
      )}
      {allowed.remove && (
        <button type="button" className={st.personBtn('bad')} disabled={act.busy || balance !== 0} onClick={() => { if (ask(tr('Remove {0} from {1}? The invite code changes too.', m.display_name, group.name))) run(() => app.removeMember(group.id, m.user_id), 'Removed'); }}>{tr('Remove')}</button>
      )}
    </div>
  );
}

// One person in a group's list, with what the person looking may do about them.
export function PersonRow({ group, m, balance, powers, act, onRename }: Readonly<{
  group: Group; m: Member; balance: number; powers: Powers; act: ReturnType<typeof useAction>; onRename: () => void;
}>) {
  const app = useApp();
  const isPrimary = group.primary_admin === m.user_id;
  const allowed = allowedFor(group, m, app.me, powers);
  const crowdedNote = allowed.remove && balance !== 0 ? tr('Cannot remove {0} yet: {1}.', m.display_name, settleFirst(balance)) : '';
  return (
    <li className="flex flex-col gap-2 py-3.5">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-[16px] font-[650] min-w-0 [overflow-wrap:anywhere]">{m.display_name}{m.user_id === app.me ? ` ${tr('(you)')}` : ''}</span>
        <span className="text-[13px] text-muted text-right">{roleLabel(isPrimary, m.role)}</span>
      </div>
      <PersonButtons group={group} m={m} balance={balance} allowed={allowed} act={act} onRename={onRename} />
      {crowdedNote && <p className={st.small}>{crowdedNote}</p>}
    </li>
  );
}

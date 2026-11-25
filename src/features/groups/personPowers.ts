import type { Group, Member } from '../../core/groups.ts';

export interface Powers {
  isAdmin: boolean; // the person looking is an admin: invite, and remove people who have settled up
  manageAdmins: boolean; // the person looking may make or remove admins and hand the primary role over
}

export interface Allowed { rename: boolean; makeAdmin: boolean; revokeAdmin: boolean; makePrimary: boolean; remove: boolean }

/** What the person looking may do about one person in a group's list: about themselves only rename, about anyone else what their powers allow. */
export function allowedFor(group: Group, m: Member, me: string | null, powers: Powers): Allowed {
  const mine = m.user_id === me;
  const other = !mine;
  const isPrimary = group.primary_admin === m.user_id;
  return {
    rename: mine,
    makeAdmin: powers.manageAdmins && other && m.role === 'member',
    revokeAdmin: powers.manageAdmins && other && m.role === 'admin' && !isPrimary,
    makePrimary: powers.manageAdmins && other,
    remove: powers.isAdmin && other && !isPrimary && (m.role !== 'admin' || powers.manageAdmins), // only the primary admin removes an admin
  };
}

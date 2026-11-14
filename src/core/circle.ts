// The Circle (version 1.28): the people you can share with. Everyone you share a group with is in it, and so is anyone you linked
// with a code. The server answers who is in it (my_circle); this file cleans the answer and words it. Pure: no DOM, no network.
import { normalizeCode } from './groups.ts';
import { tr } from './i18n.ts';

export interface CircleMember {
  user_id: string;
  name: string; // may be empty: the person has no profile name and no group name to show
  linked: boolean; // linked with a code (otherwise only through a group)
  shared_groups: string[]; // the names of the groups you share, sorted
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One row of my_circle, or null when it is not the shape the server sends. */
export function cleanCircleMember(r: any): CircleMember | null {
  if (!r || typeof r.user_id !== 'string' || !UUID.test(r.user_id)) return null;
  const groups: unknown[] = Array.isArray(r.shared_groups) ? r.shared_groups : [];
  return {
    user_id: r.user_id.toLowerCase(),
    name: typeof r.name === 'string' ? r.name.slice(0, 40) : '',
    linked: r.linked === true,
    shared_groups: groups.filter((g): g is string => typeof g === 'string'),
  };
}

/** What to call someone: their name, or a plain word when they have none. */
export const circleName = (m: CircleMember): string => m.name || tr('Someone');

/** How someone came to be in the Circle, in a line. */
export function circleHow(m: CircleMember): string {
  const parts: string[] = [];
  if (m.linked) parts.push(tr('Added with a code'));
  if (m.shared_groups.length > 0) parts.push(tr('In {0}', m.shared_groups.join(', ')));
  return parts.join(' · ');
}

/** Names first, A to Z; a person with no name last. */
export const sortCircle = (list: readonly CircleMember[]): CircleMember[] =>
  list.slice().sort((a, b) => Number(a.name === '') - Number(b.name === '') || a.name.localeCompare(b.name) || a.user_id.localeCompare(b.user_id));

// The code rides after the #, which browsers never send to a server (as the group invite does).
export function circleLink(pageUrl: string, code: string): string {
  const u = new URL(pageUrl);
  u.search = '';
  u.hash = `circle=${code}`;
  return u.toString();
}

// A Circle code is 20 characters (80 bits), longer than a group's, so it cannot be guessed.
export const CIRCLE_CODE_LENGTH = 20;
export const circleCodeLooksValid = (s: string): boolean => normalizeCode(s).length === CIRCLE_CODE_LENGTH;

export function circleCodeFromHash(hash: string): string | null {
  const m = /^#?circle=([0-9a-fA-F-]{20,30})$/.exec(hash);
  const code = m ? normalizeCode(m[1]!) : '';
  return code.length === CIRCLE_CODE_LENGTH ? code : null;
}

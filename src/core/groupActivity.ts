// "Since you last opened" (version 1.31): what other people added or changed in a group since this phone last looked at it. The time of
// the last look is kept on this phone only (data/groupSeen.ts); this file works out the list. Pure.
import type { Entry } from './logic.ts';
import { fmtINR, parseTs } from './logic.ts';
import type { Settlement } from './groups.ts';
import { tr } from './i18n.ts';

export type ActivityKind = 'added' | 'changed' | 'paid';
export interface Activity { kind: ActivityKind; who: string; text: string; at: string }

const MAX_SHOWN = 5;

/**
 * Changes by others to a group's expenses and payments after `sinceIso`, newest first (at most five; `more` counts the rest).
 * An expense is "added" when it was made after the last look, "changed" when it was only edited; deleted ones are left out
 * (their balance effect shows in the balances). Your own changes are never listed. No last look (null) lists nothing: a first
 * visit does not start with a pile of old news.
 */
export function groupActivity(
  entries: readonly Entry[], settlements: readonly Settlement[], groupId: string, me: string | null, sinceIso: string | null,
  nameOf: (uid: string | null) => string,
): { items: Activity[]; more: number } {
  if (!sinceIso || !me) return { items: [], more: 0 };
  const since = parseTs(sinceIso);
  const all: Activity[] = [];
  for (const e of entries) {
    if (e.group_id !== groupId || e.deleted_at || e.owner_id === me || e.owner_id === null) continue;
    const created = parseTs(e.created_at) > since;
    if (!created && !(parseTs(e.updated_at) > since)) continue;
    const who = nameOf(e.owner_id);
    all.push({
      kind: created ? 'added' : 'changed', who, at: created ? e.created_at : e.updated_at,
      text: created ? tr('{0} added {1} ({2})', who, fmtINR(e.amount), e.note || e.category) : tr('{0} changed {1} ({2})', who, fmtINR(e.amount), e.note || e.category),
    });
  }
  for (const s of settlements) {
    if (s.group_id !== groupId || s.deleted_at || s.created_by === me || !(parseTs(s.created_at) > since)) continue;
    const who = nameOf(s.created_by);
    all.push({ kind: 'paid', who, at: s.created_at, text: tr('{0} recorded that {1} paid {2} {3}', who, nameOf(s.from_user), nameOf(s.to_user), fmtINR(s.amount)) });
  }
  all.sort((a, b) => parseTs(b.at) - parseTs(a.at));
  return { items: all.slice(0, MAX_SHOWN), more: Math.max(0, all.length - MAX_SHOWN) };
}

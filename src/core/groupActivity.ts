// "Since you last opened" (version 1.31): what other people added or changed in a group since this phone last looked at it. What was
// seen is remembered as keys (a row's id and its last change), NOT as a time: the other person's phone sets the times on its rows, so an
// expense made offline and synced later would be older than this phone's last look and never show. The keys are kept on this phone only
// (data/phonePrefs.ts); this file works out the list. Pure.
import type { Entry } from './logic.ts';
import { fmtINR, parseTs } from './logic.ts';
import type { Settlement } from './groups.ts';
import { tr } from './i18n.ts';

export type ActivityKind = 'added' | 'changed' | 'paid';
export interface Activity { kind: ActivityKind; who: string; text: string; at: string }

const MAX_SHOWN = 5;
export const MAX_SEEN = 400; // the newest rows remembered for a group

const entryKey = (e: Pick<Entry, 'id' | 'updated_at'>): string => `${e.id}|${e.updated_at}`;
const settlementKey = (s: Pick<Settlement, 'id' | 'updated_at'>): string => `${s.id}|${s.updated_at}`;

/** The keys of everything in a group right now (the newest MAX_SEEN): what "seen" is made of. */
export function seenKeys(entries: readonly Entry[], settlements: readonly Settlement[], groupId: string): string[] {
  const rows: { key: string; at: number }[] = [];
  for (const e of entries) if (e.group_id === groupId) rows.push({ key: entryKey(e), at: parseTs(e.updated_at) });
  for (const s of settlements) if (s.group_id === groupId) rows.push({ key: settlementKey(s), at: parseTs(s.updated_at) });
  return rows.sort((a, b) => b.at - a.at).slice(0, MAX_SEEN).map((r) => r.key);
}

/**
 * Changes by others to a group's expenses and payments that are not in `seen`, newest first (at most five; `more` counts the rest).
 * An expense is "added" when it was never edited, "changed" when it was; deleted ones are left out (their effect shows in the balances).
 * Your own changes are never listed. No record yet (null) lists nothing: a first visit does not start with a pile of old news.
 */
export function groupActivity(
  entries: readonly Entry[], settlements: readonly Settlement[], groupId: string, me: string | null, seen: readonly string[] | null,
  nameOf: (uid: string | null) => string,
): { items: Activity[]; more: number } {
  if (!seen || !me) return { items: [], more: 0 };
  const known = new Set(seen);
  const all: Activity[] = [];
  for (const e of entries) {
    if (e.group_id !== groupId || e.deleted_at || e.owner_id === me || e.owner_id === null || known.has(entryKey(e))) continue;
    const edited = parseTs(e.updated_at) > parseTs(e.created_at);
    const who = nameOf(e.owner_id);
    const what = e.note || e.category;
    all.push({ kind: edited ? 'changed' : 'added', who, at: e.updated_at, text: edited ? tr('{0} changed {1} ({2})', who, fmtINR(e.amount), what) : tr('{0} added {1} ({2})', who, fmtINR(e.amount), what) });
  }
  for (const s of settlements) {
    if (s.group_id !== groupId || s.deleted_at || s.created_by === me || known.has(settlementKey(s))) continue;
    const who = nameOf(s.created_by);
    all.push({ kind: 'paid', who, at: s.updated_at, text: tr('{0} recorded that {1} paid {2} {3}', who, nameOf(s.from_user), nameOf(s.to_user), fmtINR(s.amount)) });
  }
  all.sort((a, b) => parseTs(b.at) - parseTs(a.at));
  return { items: all.slice(0, MAX_SHOWN), more: Math.max(0, all.length - MAX_SHOWN) };
}

// "Since you last opened" (version 1.31): what other people added or changed in a group since this phone last looked at it. What was
// seen is remembered as keys (a row's id and its last change), NOT as a time: the other person's phone sets the times on its rows, so an
// expense made offline and synced later would be older than this phone's last look and never show. The keys are kept on this phone only
// (data/phonePrefs.ts); this file works out the list. Pure.
import type { Entry } from './logic.ts';
import { fmtINR, parseTs } from './logic.ts';
import type { Group, Settlement } from './groups.ts';
import type { GroupRepeat } from './groupRepeats.ts';
import { monthName } from './format.ts';
import { tr } from './i18n.ts';

export type ActivityKind = 'added' | 'changed' | 'paid' | 'setting';
export interface Activity { kind: ActivityKind; who: string; text: string; at: string }

const MAX_SHOWN = 5;
export const MAX_SEEN = 400; // the newest rows remembered for a group

const entryKey = (e: Pick<Entry, 'id' | 'updated_at'>): string => `${e.id}|${e.updated_at}`;
const settlementKey = (s: Pick<Settlement, 'id' | 'updated_at'>): string => `${s.id}|${s.updated_at}`;
// 2.1: an admin changing Simplify repayments is news for the group too ("the group gets a note when it changes", from the design)
type GroupSetting = Pick<Group, 'simplify' | 'simplify_by' | 'simplify_at'>;
const simplifyKey = (g: GroupSetting): string | null => (g.simplify_at ? `simplify|${g.simplify_at}` : null);
// 2.2: someone setting up, changing, skipping or stopping a repeat is news too ("the other sees a note", from the design)
const repeatKey = (r: Pick<GroupRepeat, 'id' | 'changed_at'>): string => `repeat|${r.id}|${r.changed_at}`;

/** What else a group holds that makes news: its Simplify setting and its repeats. */
export interface ActivityExtra { group?: GroupSetting; repeats?: readonly GroupRepeat[] }

/** The keys of everything in a group right now (the newest MAX_SEEN): what "seen" is made of. */
export function seenKeys(entries: readonly Entry[], settlements: readonly Settlement[], groupId: string, extra: ActivityExtra = {}): string[] {
  const rows: { key: string; at: number }[] = [];
  const { group, repeats = [] } = extra;
  const setting = group ? simplifyKey(group) : null;
  if (setting) rows.push({ key: setting, at: parseTs(group!.simplify_at!) });
  for (const r of repeats) if (r.group_id === groupId) rows.push({ key: repeatKey(r), at: parseTs(r.changed_at) });
  for (const e of entries) if (e.group_id === groupId) rows.push({ key: entryKey(e), at: parseTs(e.updated_at) });
  for (const s of settlements) if (s.group_id === groupId) rows.push({ key: settlementKey(s), at: parseTs(s.updated_at) });
  return rows.sort((a, b) => b.at - a.at).slice(0, MAX_SEEN).map((r) => r.key);
}

/** An admin other than you changed Simplify repayments since you last looked. */
function settingNote(group: GroupSetting, me: string, known: ReadonlySet<string>, nameOf: (uid: string | null) => string): Activity | null {
  const key = simplifyKey(group);
  if (!key || group.simplify_by === me || known.has(key)) return null;
  const who = nameOf(group.simplify_by);
  return { kind: 'setting', who, at: group.simplify_at!, text: group.simplify ? tr('{0} turned on Simplify repayments', who) : tr('{0} turned off Simplify repayments', who) };
}

function repeatNoteText(r: GroupRepeat, who: string): string {
  const what = r.note || r.category;
  if (r.change === 'add') return tr('{0} set up {1} every month ({2})', who, what, fmtINR(r.amount));
  if (r.change === 'edit') return tr('{0} changed {1}, every month, to {2}', who, what, fmtINR(r.amount));
  if (r.change === 'skip' && r.change_month) return tr('{0} skipped {1} for {2}', who, what, monthName(r.change_month));
  return tr('{0} stopped repeating {1}', who, what);
}

/** Someone other than you set up, changed, skipped or stopped a repeat since you last looked. */
function repeatNotes(repeats: readonly GroupRepeat[], groupId: string, me: string, known: ReadonlySet<string>, nameOf: (uid: string | null) => string): Activity[] {
  return repeats
    .filter((r) => r.group_id === groupId && r.changed_by !== null && r.changed_by !== me && !known.has(repeatKey(r)))
    .map((r) => { const who = nameOf(r.changed_by); return { kind: 'setting' as const, who, at: r.changed_at, text: repeatNoteText(r, who) }; });
}

/**
 * Changes by others to a group's expenses and payments that are not in `seen`, newest first (at most five; `more` counts the rest).
 * An expense is "added" when it was never edited, "changed" when it was; deleted ones are left out (their effect shows in the balances).
 * Your own changes are never listed. No record yet (null) lists nothing: a first visit does not start with a pile of old news.
 */
export function groupActivity(
  entries: readonly Entry[], settlements: readonly Settlement[], groupId: string, me: string | null, seen: readonly string[] | null,
  nameOf: (uid: string | null) => string, extra: ActivityExtra = {},
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
  const note = extra.group ? settingNote(extra.group, me, known, nameOf) : null;
  if (note) all.push(note);
  all.push(...repeatNotes(extra.repeats ?? [], groupId, me, known, nameOf));
  all.sort((a, b) => parseTs(b.at) - parseTs(a.at));
  return { items: all.slice(0, MAX_SHOWN), more: Math.max(0, all.length - MAX_SHOWN) };
}

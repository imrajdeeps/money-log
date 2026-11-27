// Counting a friend's group expense in your own Month (version 1.31). Until now a shared expense reached your budget only if you made it
// yourself, or tapped "Add my share to my budget" on someone else's. With the switch on for a group, your share of what others add there
// counts by itself, FROM A DAY ON (the day the switch was turned on, or the day this first ran for a group that counts by default), so no
// past month changes by itself. The rule that keeps it honest: an expense you already added a share of by hand is never counted twice.
// Pure: no DOM, no storage.
import { myShare } from './logic.ts';
import type { Entry } from './logic.ts';
import type { Group } from './groups.ts';
import type { GroupKind } from './groupKinds.ts';

export interface ShareChoice { on: boolean; from: string } // the person's own choice for one group, and the day it applies from
export type ShareSwitches = Record<string, ShareChoice>; // by group id; no entry = the default for the kind

/** Flatmates and couples share the running costs of one home, so their share counts unless switched off; a family or a trip does not. */
export const countsByDefault = (kind: GroupKind): boolean => kind === 'flatmates' || kind === 'couple';

/** The day counting starts for a group, or null when it does not count. `defaultFrom` is the day counting by default began on this phone. */
export function shareFrom(g: Pick<Group, 'id' | 'kind'>, sw: ShareSwitches, defaultFrom: string): string | null {
  const choice = sw[g.id];
  if (choice) return choice.on ? choice.from : null;
  return countsByDefault(g.kind) ? defaultFrom : null;
}

export const countsShare = (g: Pick<Group, 'id' | 'kind'>, sw: ShareSwitches, defaultFrom: string): boolean => shareFrom(g, sw, defaultFrom) !== null;

/** Version 2.1: turning the switch on counts from the start of this month by default, so this month's budget already has the group in it. */
export const monthStart = (todayIso: string): string => `${todayIso.slice(0, 8)}01`;

/** Which of the three choices a day is (Start of this month, Today, or Another day), for the chips on the group's settings. */
export function fromChoice(from: string, todayIso: string): 'month' | 'today' | 'pick' {
  if (from === monthStart(todayIso)) return 'month';
  return from === todayIso ? 'today' : 'pick';
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Anything that is not a map of group id to { on: true/false, from: a day } is no choices at all. */
export function cleanShareSwitches(v: unknown): ShareSwitches {
  const out: ShareSwitches = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
    const x = c as { on?: unknown; from?: unknown } | null;
    if (/^[0-9a-f-]{36}$/i.test(k) && x && typeof x.on === 'boolean' && typeof x.from === 'string' && DAY.test(x.from)) out[k.toLowerCase()] = { on: x.on, from: x.from };
  }
  return out;
}

/**
 * The extra budget entries: for each shared expense that someone else made, dated on or after the day counting started for its group, your
 * share as a private payment of your own (`share:<id>`), unless you already added it by hand (an entry of yours with share_of that id).
 * They exist only for the sums; they are not saved, not listed and not synced.
 */
export function shareEntries(
  groupEntries: readonly Entry[], mine: readonly Entry[], groups: readonly Pick<Group, 'id' | 'kind'>[], sw: ShareSwitches, me: string | null, defaultFrom: string,
): Entry[] {
  if (!me) return [];
  const from = new Map<string, string>();
  for (const g of groups) { const f = shareFrom(g, sw, defaultFrom); if (f !== null) from.set(g.id, f); }
  if (from.size === 0) return [];
  const added = new Set(mine.filter((e) => e.share_of && !e.deleted_at).map((e) => e.share_of));
  const out: Entry[] = [];
  for (const e of groupEntries) {
    const start = e.group_id ? from.get(e.group_id) : undefined;
    if (e.deleted_at || start === undefined || e.entry_date < start || e.owner_id === me || e.owner_id === null || added.has(e.id)) continue;
    const a = myShare(e, me);
    if (a <= 0) continue;
    out.push({ ...e, id: `share:${e.id}`, owner_id: me, group_id: null, paid_by: null, shares: null, amount: a, share_of: e.id, kind: 'out' });
  }
  return out;
}

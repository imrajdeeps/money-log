// Counting a friend's group expense in your own Month (version 1.31). Until now a shared expense reached your budget only if you made it
// yourself, or tapped "Add my share to my budget" on someone else's. With the switch on for a group, your share of what others add there
// counts by itself. The rule that keeps it honest: an expense you already added a share of by hand is never counted twice.
// Pure: no DOM, no storage.
import { myShare } from './logic.ts';
import type { Entry } from './logic.ts';
import type { Group } from './groups.ts';
import type { GroupKind } from './groupKinds.ts';

export type ShareSwitches = Record<string, boolean>; // by group id: the person's own choice; no entry = the default for the kind

/** Flatmates and couples share the running costs of one home, so their share counts unless switched off; a family or a trip does not. */
export const countsByDefault = (kind: GroupKind): boolean => kind === 'flatmates' || kind === 'couple';

export const countsShare = (g: Pick<Group, 'id' | 'kind'>, sw: ShareSwitches): boolean => sw[g.id] ?? countsByDefault(g.kind);

/** Anything that is not a map of group id to true/false is no choices at all. */
export function cleanShareSwitches(v: unknown): ShareSwitches {
  const out: ShareSwitches = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, on] of Object.entries(v as Record<string, unknown>)) if (/^[0-9a-f-]{36}$/i.test(k) && typeof on === 'boolean') out[k.toLowerCase()] = on;
  return out;
}

/**
 * The extra budget entries: for each shared expense that someone else made, in a group where the switch is on, your share as a private
 * payment of your own (`share:<id>`), unless you already added it by hand (an entry of yours with share_of that id). They exist only for
 * the sums; they are not saved, not listed and not synced.
 */
export function shareEntries(groupEntries: readonly Entry[], mine: readonly Entry[], groups: readonly Pick<Group, 'id' | 'kind'>[], sw: ShareSwitches, me: string | null): Entry[] {
  if (!me) return [];
  const on = new Set(groups.filter((g) => countsShare(g, sw)).map((g) => g.id));
  if (on.size === 0) return [];
  const added = new Set(mine.filter((e) => e.share_of && !e.deleted_at).map((e) => e.share_of));
  const out: Entry[] = [];
  for (const e of groupEntries) {
    if (e.deleted_at || !e.group_id || !on.has(e.group_id) || e.owner_id === me || e.owner_id === null || added.has(e.id)) continue;
    const a = myShare(e, me);
    if (a <= 0) continue;
    out.push({ ...e, id: `share:${e.id}`, owner_id: me, group_id: null, paid_by: null, shares: null, amount: a, share_of: e.id, kind: 'out' });
  }
  return out;
}

// The version 1.31 preferences that live on this phone only: which groups count your share in your own Month, your UPI id (and the ones
// typed for people you pay), and when you last looked at each group.
import { cleanShareSwitches } from '../core/groupShares.ts';
import type { ShareSwitches } from '../core/groupShares.ts';
import { cleanUpi } from '../core/upi.ts';
import { localPref } from './localPref.ts';

export const shareSwitches = localPref<ShareSwitches>('money-log.count-shares', cleanShareSwitches, {});

/** The day counting a friend's share began on this phone for groups that count by default (set once, the first time it ran). */
export const sharesFrom = localPref<string>('money-log.shares-from', (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''), '');

/** Which automatic lines the person added to net worth: what friends owe (group balances) and money lent and borrowed (Udhaar). */
export interface WorthAuto { groups: boolean; udhaar: boolean }
export const worthAuto = localPref<WorthAuto>('money-log.worth-auto', (v) => {
  const x = (v ?? {}) as { groups?: unknown; udhaar?: unknown };
  return { groups: x.groups === true, udhaar: x.udhaar === true };
}, { groups: false, udhaar: false });

/** My own UPI id: shared only inside a reminder I send. */
export const myUpi = localPref<string>('money-log.upi', (v) => cleanUpi(v), '');

/** UPI ids typed for people I pay, by their user id (so "Pay" has an id after the first time). */
export const theirUpi = localPref<Record<string, string>>('money-log.upi-of', (v) => {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, id] of Object.entries(v as Record<string, unknown>)) { const c = cleanUpi(id); if (c && /^[0-9a-f-]{36}$/i.test(k)) out[k.toLowerCase()] = c; }
  return out;
}, {});

/** What I had seen in each group at my last look, by group id: the keys of its rows (see core/groupActivity.ts). */
export const groupSeen = localPref<Record<string, string[]>>('money-log.group-seen-keys', (v) => {
  const out: Record<string, string[]> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
      if (/^[0-9a-f-]{36}$/i.test(k) && Array.isArray(list)) out[k.toLowerCase()] = list.filter((x): x is string => typeof x === 'string' && x.length < 100).slice(0, 400);
    }
  }
  return out;
}, {});

// The version 1.31 preferences that live on this phone only: which groups count your share in your own Month, your UPI id (and the ones
// typed for people you pay), and when you last looked at each group.
import { cleanShareSwitches } from '../core/groupShares.ts';
import type { ShareSwitches } from '../core/groupShares.ts';
import { cleanUpi } from '../core/upi.ts';
import { localPref } from './localPref.ts';

export const shareSwitches = localPref<ShareSwitches>('money-log.count-shares', cleanShareSwitches, {});

/** My own UPI id: shared only inside a reminder I send. */
export const myUpi = localPref<string>('money-log.upi', (v) => cleanUpi(v), '');

/** UPI ids typed for people I pay, by their user id (so "Pay" has an id after the first time). */
export const theirUpi = localPref<Record<string, string>>('money-log.upi-of', (v) => {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, id] of Object.entries(v as Record<string, unknown>)) { const c = cleanUpi(id); if (c && /^[0-9a-f-]{36}$/i.test(k)) out[k.toLowerCase()] = c; }
  return out;
}, {});

/** The time of my last look at each group, by group id (an ISO time). */
export const groupSeen = localPref<Record<string, string>>('money-log.group-seen', (v) => {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (/^[0-9a-f-]{36}$/i.test(k) && typeof t === 'string' && Number.isFinite(Date.parse(t))) out[k.toLowerCase()] = t;
  return out;
}, {});

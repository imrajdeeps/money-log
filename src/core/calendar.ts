// Which calendar events to take back out. This phone remembers the events it has put in the calendar (by the files it made); when the
// item behind one is later finished, removed, renamed or gone from the list, the next calendar file cancels it. Pure.
import { icsUid, isDone, isRemoved } from './blocks.ts';
import type { DoneMap, DueItem, DueView, SentEvent } from './blocks.ts';
import { isValidDate } from './logic.ts';

export type SentMap = Record<string, SentEvent>; // by the event's uid
const MAX_SENT = 500;

/** The events to cancel: sent earlier, and now finished, removed, renamed (its uid changed) or gone from the list. A date that has passed is not a reason: that event stays. */
export function toCancel(sent: SentMap, items: readonly DueItem[], map: DoneMap, importedAt: string): SentEvent[] {
  const byKey = new Map(items.map((i) => [i.k, i]));
  return Object.values(sent)
    .filter((e) => {
      const cur = byKey.get(e.k);
      if (!cur) return true; // no longer in the list
      if (icsUid(cur) !== e.uid) return true; // renamed: the new title makes a new event, so the old one goes
      return isRemoved(cur, map, importedAt) || isDone(cur, map, importedAt);
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
}

/** What is in the calendar after a file: what was there, less what the file cancelled, plus what it put in. */
export function afterExport(sent: SentMap, exported: readonly DueView[], cancelled: readonly SentEvent[]): SentMap {
  const out: SentMap = { ...sent };
  for (const c of cancelled) delete out[c.uid];
  for (const i of exported) {
    if (!i.due) continue;
    const uid = icsUid(i);
    out[uid] = { uid, k: i.k, title: i.title, due: i.due, amount: i.amount };
  }
  // keep the nearest dates if it ever grows beyond what is sensible
  const all = Object.values(out);
  return all.length <= MAX_SENT ? out : Object.fromEntries(all.sort((a, b) => b.due.localeCompare(a.due)).slice(0, MAX_SENT).map((e) => [e.uid, e]));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanSent(p: any): SentMap {
  const out: SentMap = {};
  if (!p || typeof p !== 'object') return out;
  for (const [uid, v] of Object.entries(p as Record<string, any>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!v || v.uid !== uid || !/^[0-9a-f]{16}@money-log$/.test(uid)) continue;
    if (typeof v.k !== 'string' || v.k.length > 400 || typeof v.title !== 'string' || !v.title || v.title.length > 200) continue;
    if (typeof v.due !== 'string' || !isValidDate(v.due)) continue;
    if (v.amount !== null && !(typeof v.amount === 'number' && Number.isFinite(v.amount) && v.amount > 0)) continue;
    out[uid] = { uid, k: v.k, title: v.title, due: v.due, amount: v.amount };
    if (Object.keys(out).length >= MAX_SENT) break;
  }
  return out;
}


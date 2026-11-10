// The events this phone has put in calendar files, kept on this phone only (localStorage), so the next file can cancel the ones whose
// item was finished or removed. Reads and writes never throw: without it nothing is cancelled, which is the safe direction.
import { cleanSent } from '../core/calendar.ts';
import type { SentMap } from '../core/calendar.ts';

const KEY = 'money-log.cal-sent';

export function loadSent(): SentMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? cleanSent(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveSent(sent: SentMap): void {
  try { localStorage.setItem(KEY, JSON.stringify(sent)); } catch { /* the next file simply cancels nothing */ }
}

export function clearSent(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}

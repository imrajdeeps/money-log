// The version whose tour this phone has finished or skipped, so the tour is not shown twice. Kept on this phone only.
// Reads and writes never throw: without it the tour is simply offered again.
const KEY = 'money-log.tour';

export function loadTourSeen(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && /^\d+(\.\d+){0,2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveTourSeen(version: string): void {
  try { localStorage.setItem(KEY, version); } catch { /* the tour may be offered again: not a problem */ }
}

export function clearTourSeen(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}

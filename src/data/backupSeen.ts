// When a backup was last downloaded on this phone (localStorage; this phone only), so the notification center can remind the person.
// Reads and writes never throw. A change is announced to the screens that show it, through a window event.
const KEY = 'money-log.backup-at';
const EVENT = 'money-log:backup';

export function loadLastBackup(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveLastBackup(ms: number): void {
  try { localStorage.setItem(KEY, String(Math.round(ms))); } catch { /* the reminder will simply ask again */ }
  window.dispatchEvent(new Event(EVENT));
}

export function clearLastBackup(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeLastBackup(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

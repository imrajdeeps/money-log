// When this phone last had the app open and unlocked, so a refresh inside the chosen time does not ask for the PIN again.
// Kept on this phone only; reads and writes never throw (without it the app simply starts covered, the safe direction).
const KEY = 'money-log.lock-seen';

export function loadLastActive(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveLastActive(ms: number): void {
  try { localStorage.setItem(KEY, String(Math.round(ms))); } catch { /* the app starts covered next time */ }
}

export function clearLastActive(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}

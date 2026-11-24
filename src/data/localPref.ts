// A small preference kept on this phone only (localStorage): read it, change it, and every screen that shows it is drawn again.
// Not synced, not in the backup, no database. Reads and writes never throw: with the store blocked the default applies.
import { useSyncExternalStore } from 'react';

export interface LocalPref<T> { load: () => T; save: (v: T) => void; subscribe: (fn: () => void) => () => void; use: () => T }

export function localPref<T>(key: string, clean: (raw: unknown) => T, fallback: T): LocalPref<T> {
  const listeners = new Set<() => void>();
  let cache: { raw: string | null; value: T } | null = null;
  const read = (): T => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { return fallback; }
    if (cache && cache.raw === raw) return cache.value; // the same object until it changes: React can compare it
    let parsed: unknown = null;
    try { parsed = raw === null ? null : JSON.parse(raw); } catch { parsed = null; }
    cache = { raw, value: raw === null ? fallback : clean(parsed) };
    return cache.value;
  };
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  return {
    load: read,
    save: (v) => {
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* the choice lasts until the page is closed */ cache = { raw: JSON.stringify(v), value: v }; }
      listeners.forEach((f) => f());
    },
    subscribe,
    use: () => useSyncExternalStore(subscribe, read),
  };
}

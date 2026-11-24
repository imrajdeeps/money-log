// A small preference kept on this phone only (localStorage): read it, change it, and every screen that shows it is drawn again.
// Not synced, not in the backup, no database. Reads and writes never throw. When the store is blocked or full, the choice is kept in
// memory instead, so it lasts until the page is closed (as every comment about it promises).
import { useSyncExternalStore } from 'react';

export interface LocalPref<T> { load: () => T; save: (v: T) => void; subscribe: (fn: () => void) => () => void; use: () => T }

export function localPref<T>(key: string, clean: (raw: unknown) => T, fallback: T): LocalPref<T> {
  const listeners = new Set<() => void>();
  let cache: { raw: string | null; value: T } | null = null;
  let held: { value: T } | null = null; // set only when the store would not take the last change
  const read = (): T => {
    if (held) return held.value;
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { return fallback; }
    if (cache && cache.raw === raw) return cache.value; // the same object until it changes: React can compare it
    let parsed: unknown = null;
    let readable = true;
    try { parsed = raw === null ? null : JSON.parse(raw); } catch { readable = false; } // text that is not JSON counts as nothing stored
    cache = { raw, value: raw === null || !readable ? fallback : clean(parsed) };
    return cache.value;
  };
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  return {
    load: read,
    save: (v) => {
      try { localStorage.setItem(key, JSON.stringify(v)); held = null; } catch { held = { value: v }; }
      listeners.forEach((f) => f());
    },
    subscribe,
    use: () => useSyncExternalStore(subscribe, read),
  };
}

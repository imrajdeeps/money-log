// The service worker swaps in a new version of the app's files as soon as it has them, while a page that is already open keeps
// running the old code. When that happens the person is told and chooses when to reload (a half-typed payment would be lost).
// The first time a worker takes over (the very first visit) is not an update. An app left open for days is checked when it is
// opened again, at most once an hour, because the browser only looks for a new version when the page loads.
import { useSyncExternalStore } from 'react';

const CHECK_EVERY_MS = 60 * 60 * 1000;
let ready = false;
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export const useUpdateReady = (): boolean => useSyncExternalStore(subscribe, () => ready);

export function dismissUpdate(): void {
  ready = false;
  listeners.forEach((f) => f());
}

/** Registers the worker (once the page has loaded) and watches for a newer version taking over. */
export function startWorker(url: string): void {
  if (!('serviceWorker' in navigator)) return;
  let controlled = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) { ready = true; listeners.forEach((f) => f()); }
    controlled = true;
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url).then((registration) => {
      let last = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - last < CHECK_EVERY_MS) return;
        last = Date.now();
        registration.update().catch(() => undefined);
      });
    }).catch(() => undefined);
  });
}

// What went wrong in this session, kept in memory only (nothing is stored or sent). The app's own screens, errors nobody caught and
// promises nobody waited for all land here; the banner and the error screen read it, and "Copy report" turns it into text.
import { useSyncExternalStore } from 'react';
import { addCrash, buildReport, describeError, isIgnorable } from '../core/crashReport.ts';
import type { Crash, CrashWhere } from '../core/crashReport.ts';
import { VERSION } from '../core/version.ts';
import { currentLang } from './lang.ts';

let list: readonly Crash[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function recordCrash(e: unknown, where: CrashWhere, source = ''): void {
  const d = describeError(e);
  if (isIgnorable(d, source)) return;
  list = addCrash(list, { ...d, where, at: new Date().toISOString() });
  emit();
}

export function clearCrashes(): void {
  list = [];
  emit();
}

export const useCrashes = (): readonly Crash[] => useSyncExternalStore(subscribe, () => list);

let showing = 0;
/**
 * Called by the crash screen while it is on show: the banner stays away (the screen says it all). When the screen goes (the person went
 * to another page) what made it is forgotten, so the banner is there again for the next thing that goes wrong. The tidy-up waits a
 * moment so that React's own unmount-and-mount in development does not count as the screen going.
 */
export function crashScreenShown(): () => void {
  showing++;
  emit();
  return () => {
    showing--;
    emit();
    queueMicrotask(() => {
      if (showing > 0 || !list.some((c) => c.where === 'screen')) return;
      list = list.filter((c) => c.where !== 'screen');
      emit();
    });
  };
}
export const useCrashScreenShown = (): boolean => useSyncExternalStore(subscribe, () => showing > 0);

/** The report as text, with the facts about this phone's browser as they are now. */
export function crashReportText(): string {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return buildReport(list, { version: VERSION, now: new Date().toISOString(), href: window.location.href, userAgent: navigator.userAgent, lang: currentLang(), online: navigator.onLine, standalone });
}

/** Once, before anything is drawn: errors and promise failures that nothing else caught are recorded instead of vanishing. */
export function installCrashHandlers(): void {
  window.addEventListener('error', (ev) => recordCrash(ev.error ?? ev.message, 'error', ev.filename));
  window.addEventListener('unhandledrejection', (ev) => recordCrash(ev.reason, 'promise'));
}

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

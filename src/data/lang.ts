import { DEFAULT_LANG, LANGS, cleanLang, setLang } from '../core/i18n.ts';
import type { Lang } from '../core/i18n.ts';

// The chosen language, kept on this phone (localStorage). It is read before the first screen is drawn. Reads and writes never
// throw: without storage the app simply starts in English each time.
const KEY = 'money-log.lang';
const listeners = new Set<() => void>();
let current: Lang = DEFAULT_LANG;

function apply(l: Lang) {
  current = l;
  setLang(l);
  try { document.documentElement.lang = LANGS.find((x) => x.id === l)?.html ?? 'en-IN'; } catch { /* no document: nothing to mark */ }
}

/** Once, before anything is drawn. */
export function initLang(): void {
  let stored: unknown = null;
  try { stored = localStorage.getItem(KEY); } catch { /* start in English */ }
  apply(cleanLang(stored));
}

export const currentLang = (): Lang => current;
export const subscribeLang = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function chooseLang(l: Lang): void {
  apply(l);
  try { localStorage.setItem(KEY, l); } catch { /* the choice lasts until the page is closed */ }
  listeners.forEach((fn) => fn());
}

import { DEFAULT_LANG, LANGS, cleanLang, loadDictionary, setLang } from '../core/i18n.ts';
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

/** Fetches a language's text; false when that was not possible (then the app stays as it was). English is always there. */
async function ready(l: Lang): Promise<boolean> {
  try { await loadDictionary(l); return true; } catch { return false; }
}

/** Once, before anything is drawn: the chosen language, with its text fetched first (English without waiting). Stays English if it cannot be fetched. */
export async function initLang(): Promise<void> {
  let stored: unknown = null;
  try { stored = localStorage.getItem(KEY); } catch { /* start in English */ }
  const l = cleanLang(stored);
  apply((await ready(l)) ? l : DEFAULT_LANG);
}

export const currentLang = (): Lang => current;
export const subscribeLang = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Changes the language once its text is here; false (nothing changes) when it could not be fetched. */
export async function chooseLang(l: Lang): Promise<boolean> {
  if (!(await ready(l))) return false;
  apply(l);
  try { localStorage.setItem(KEY, l); } catch { /* the choice lasts until the page is closed */ }
  listeners.forEach((fn) => fn());
  return true;
}

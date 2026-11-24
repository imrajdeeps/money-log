// Languages. Every visible text is written in English in the code, as tr('English text', ...values), and the English text is
// the key: another language has a dictionary from that text to its own, and a text it does not have yet shows in English.
// {0}, {1} ... are filled with the values after the text ("Saved {0} · {1}"); a translation may reorder them or leave one out.
//   en        English
//   hi        Hindi, in Devanagari
//   hinglish  Hindi written in the Roman letters people use on WhatsApp
// The Hindi and Hinglish dictionaries are large, so they are fetched only when a person uses that language (loadDictionary), not with
// every start of the app. Until one is loaded, its texts show in English.

export type Lang = 'en' | 'hi' | 'hinglish';
export const LANGS: readonly { id: Lang; label: string; native: string; html: string }[] = [
  { id: 'en', label: 'English', native: 'English', html: 'en-IN' },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी', html: 'hi-IN' },
  { id: 'hinglish', label: 'Hinglish', native: 'Hinglish', html: 'en-IN' },
];
export const DEFAULT_LANG: Lang = 'en';

export function cleanLang(v: unknown): Lang {
  return LANGS.find((l) => l.id === v)?.id ?? DEFAULT_LANG;
}

type Dictionary = Readonly<Record<string, string>>;
const DICTS: Partial<Record<Exclude<Lang, 'en'>, Dictionary>> = {};

/** Fetches a language's dictionary once (English has none). Rejects when it cannot be fetched; the caller keeps the language it had. */
export async function loadDictionary(l: Lang): Promise<void> {
  if (l === 'en' || DICTS[l]) return;
  DICTS[l] = l === 'hi' ? (await import('./i18n/hi.ts')).HI : (await import('./i18n/hinglish.ts')).HINGLISH;
}

let current: Lang = DEFAULT_LANG;
export const setLang = (l: Lang): void => { current = l; };
export const getLang = (): Lang => current;

/** Fill {0}, {1} ... in a text with the values. A placeholder with no value shows nothing. */
export type Value = string | number | boolean | null | undefined;
export function fill(text: string, args: readonly Value[]): string {
  const show = (v: Value) => (v === undefined || v === null || typeof v === 'boolean' ? '' : String(v)); // false, null: nothing
  return args.length || text.includes('{') ? text.replace(/\{(\d+)\}/g, (_, i: string) => show(args[Number(i)])) : text;
}

/** The text in the chosen language (English when it has no translation yet), with the values filled in. */
export function tr(text: string, ...args: Value[]): string {
  return fill(translation(current, text) ?? text, args);
}

/** A text's translation in a given language, or undefined (for tests and for the missing-text list). */
export function translation(lang: Lang, text: string): string | undefined {
  const dict = lang === 'en' ? undefined : DICTS[lang];
  return dict && Object.hasOwn(dict, text) ? dict[text] : undefined;
}

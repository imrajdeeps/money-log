// The person's profile: a name and an optional Indian WhatsApp number. Pure rules; where it is kept is data/profile.ts.
import { tr } from './i18n.ts';

export interface Profile { name: string; whatsapp: string }
export const MAX_PROFILE_NAME = 40;
export const EMPTY_PROFILE: Profile = { name: '', whatsapp: '' };

export function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PROFILE_NAME) : '';
}

export type NumberResult = { ok: true; value: string } | { ok: false; error: string };

export const COUNTRY_PREFIX = '+91'; // only Indian numbers are accepted: the +91 is fixed and the person types 10 digits
const INDIAN_RE = /^\+91[6-9]\d{9}$/;

/** A saved number that is valid now: +91 and an Indian mobile number (10 digits starting 6 to 9). */
export const isIndianNumber = (v: string): boolean => INDIAN_RE.test(v);

// A WhatsApp number is optional; when there is one it is kept as "+919876543210". The person types the 10 digits (the +91 is
// shown beside the field); a pasted "+91 98765 43210", "91 98765 43210", "0091..." or "098765 43210" is accepted too.
export function normalizeWhatsapp(input: string): NumberResult {
  const t = input.trim();
  if (t === '') return { ok: true, value: '' };
  let s = t.replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+91')) s = s.slice(3);
  else if (/^91\d{10}$/.test(s)) s = s.slice(2);
  else if (/^0\d{10}$/.test(s)) s = s.slice(1);
  if (!/^[6-9]\d{9}$/.test(s)) return { ok: false, error: tr('Enter a 10-digit Indian mobile number that starts with 6, 7, 8 or 9.') };
  return { ok: true, value: `${COUNTRY_PREFIX}${s}` };
}

// What was saved before only Indian numbers were allowed (any country code) is kept as it is until the person saves the profile
// again; anything that is not a number at all is dropped.
export const cleanStoredWhatsapp = (v: unknown): string => (typeof v === 'string' && /^\+[1-9]\d{7,14}$/.test(v) ? v : '');

// For showing: "+91 98765 43210" for an Indian number, "+" and the digits otherwise.
export function formatWhatsapp(v: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(v);
  return m ? `+91 ${m[1]} ${m[2]}` : v;
}

// For the field next to the fixed +91: the 10 digits in two groups, or nothing for a number that is not Indian.
export function localDigits(v: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(v);
  return m ? `${m[1]} ${m[2]}` : '';
}

// One or two letters for the round picture: the first letters of the first two words of the name, else of the email.
export function initials(name: string, email?: string | null): string {
  const words = cleanName(name).split(' ').filter(Boolean);
  if (words.length) return words.slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('');
  const e = (email ?? '').trim();
  return e ? [...e][0]!.toUpperCase() : '?';
}

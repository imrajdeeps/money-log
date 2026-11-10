// The person's profile: a name and an optional WhatsApp number. Pure rules; where it is kept is data/profile.ts.
export interface Profile { name: string; whatsapp: string }
export const MAX_PROFILE_NAME = 40;
export const EMPTY_PROFILE: Profile = { name: '', whatsapp: '' };

export function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PROFILE_NAME) : '';
}

export type NumberResult = { ok: true; value: string } | { ok: false; error: string };

// A WhatsApp number is kept with its country code and nothing else: "+919876543210". Empty is allowed (it is optional).
// A bare Indian mobile number (10 digits starting 6 to 9) gets +91; any other number must start with + or 00.
export function normalizeWhatsapp(input: string): NumberResult {
  const t = input.trim();
  if (t === '') return { ok: true, value: '' };
  let s = t.replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^[6-9]\d{9}$/.test(s)) s = `+91${s}`;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return { ok: false, error: 'Enter the number with its country code, like +91 98765 43210.' };
  return { ok: true, value: s };
}

// For showing: "+91 98765 43210" for an Indian number, "+" and the digits otherwise.
export function formatWhatsapp(v: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(v);
  return m ? `+91 ${m[1]} ${m[2]}` : v;
}

// One or two letters for the round picture: the first letters of the first two words of the name, else of the email.
export function initials(name: string, email?: string | null): string {
  const words = cleanName(name).split(' ').filter(Boolean);
  if (words.length) return words.slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('');
  const e = (email ?? '').trim();
  return e ? [...e][0]!.toUpperCase() : '?';
}

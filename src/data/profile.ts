import { EMPTY_PROFILE, cleanName, normalizeWhatsapp } from '../core/profile.ts';
import type { Profile } from '../core/profile.ts';

// The profile lives on this phone only (localStorage): a name, also used to fill "your name in this group", and an optional
// WhatsApp number that is not verified and not sent anywhere. Reads and writes never throw: a convenience, not data.
const NAME_KEY = 'money-log.name'; // the same key the groups have always used for the remembered name
const WHATSAPP_KEY = 'money-log.whatsapp';

function read(): Profile {
  try {
    const n = normalizeWhatsapp(localStorage.getItem(WHATSAPP_KEY) ?? '');
    return { name: cleanName(localStorage.getItem(NAME_KEY)), whatsapp: n.ok ? n.value : '' };
  } catch {
    return EMPTY_PROFILE;
  }
}

// kept in memory too, so every screen that shows the name changes the moment it is saved or erased
let cache: Profile | null = null;
const listeners = new Set<() => void>();
const publish = (p: Profile) => { cache = p; listeners.forEach((l) => l()); };
export const loadProfile = (): Profile => (cache ??= read());
export const subscribeProfile = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function saveProfile(p: Profile): void {
  publish({ name: cleanName(p.name), whatsapp: p.whatsapp });
  try {
    localStorage.setItem(NAME_KEY, cleanName(p.name));
    if (p.whatsapp) localStorage.setItem(WHATSAPP_KEY, p.whatsapp); else localStorage.removeItem(WHATSAPP_KEY);
  } catch { /* nothing to do: the page works without it */ }
}

export function clearProfile(): void {
  publish(EMPTY_PROFILE);
  try { localStorage.removeItem(NAME_KEY); localStorage.removeItem(WHATSAPP_KEY); } catch { /* nothing to do */ }
}

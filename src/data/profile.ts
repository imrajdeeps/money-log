import { EMPTY_PROFILE, cleanName, cleanStoredWhatsapp } from '../core/profile.ts';
import type { Profile } from '../core/profile.ts';

// The profile as this phone shows it (localStorage, so it is there before anything else has loaded): a name, also used to fill
// "your name in this group", and an optional Indian WhatsApp number that is not verified and not sent to. Signed in, it is also
// kept in the account and follows the person to another phone (the context writes the sync copy when saveProfile tells it to,
// and calls setLocalProfile when a newer copy arrives). Reads and writes never throw: a convenience, not data.
const NAME_KEY = 'money-log.name'; // the same key the groups have always used for the remembered name
const WHATSAPP_KEY = 'money-log.whatsapp';

function read(): Profile {
  try {
    return { name: cleanName(localStorage.getItem(NAME_KEY)), whatsapp: cleanStoredWhatsapp(localStorage.getItem(WHATSAPP_KEY)) };
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

function writeLocal(p: Profile): void {
  const clean = { name: cleanName(p.name), whatsapp: cleanStoredWhatsapp(p.whatsapp) };
  publish(clean);
  try {
    localStorage.setItem(NAME_KEY, clean.name);
    if (clean.whatsapp) localStorage.setItem(WHATSAPP_KEY, clean.whatsapp); else localStorage.removeItem(WHATSAPP_KEY);
  } catch { /* nothing to do: the page works without it */ }
}

// Who is told when the person saves (the app state, which keeps the copy that syncs).
let onSave: ((p: Profile) => void) | null = null;
export function setProfileSaveListener(fn: (p: Profile) => void): () => void {
  onSave = fn;
  return () => { if (onSave === fn) onSave = null; };
}

/** The person saved their profile: keep it here and tell the sync copy. */
export function saveProfile(p: Profile): void {
  writeLocal(p);
  onSave?.(loadProfile());
}

/** A profile that came from the account (another phone saved it later): show it here without telling the sync copy. */
export const setLocalProfile = (p: Profile): void => writeLocal(p);

export function clearProfile(): void {
  publish(EMPTY_PROFILE);
  try { localStorage.removeItem(NAME_KEY); localStorage.removeItem(WHATSAPP_KEY); } catch { /* nothing to do */ }
}

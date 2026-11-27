// Settings is one list of parts, as on the design; tapping one opens just that part. The part is kept in the address
// (/settings/password), so a refresh, the back button and a link all land in the same place.
export const SETTINGS_SECTIONS = [
  { id: 'profile', title: 'Profile', blurb: 'Name, WhatsApp number, UPI id' },
  { id: 'account', title: 'Cloud sync', blurb: 'Sign in, sync, sign out' },
  { id: 'password', title: 'Password and sessions', blurb: 'Change password, devices signed in' },
  { id: 'recurring', title: 'Recurring payments', blurb: 'Rent, SIPs, subscriptions: log with one tap' },
  { id: 'backup', title: 'Backup', blurb: 'Save or restore a copy of your data' },
  { id: 'lock', title: 'App lock', blurb: 'A PIN for this device' },
  { id: 'receipts', title: 'Receipt photos', blurb: 'Storage used on this device' },
  { id: 'appearance', title: 'Appearance, sound and language', blurb: 'Light, dark or match the device; sounds; language' },
  { id: 'features', title: 'Features', blurb: 'Plan, net worth, udhaar, insights: turn on what you use' },
  { id: 'notifications', title: 'Notifications', blurb: 'What the bell tells you about' },
  { id: 'about', title: 'About', blurb: 'Version, install help, the tour' },
  { id: 'erase', title: 'Erase everything on this device', blurb: 'Remove all data from this device' },
] as const satisfies readonly { id: string; title: string; blurb: string }[];

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

/** The heading of an open part (the list's own words are longer for a few). */
export const sectionTitle = (id: SettingsSection): string => (id === 'erase' ? 'Erase everything' : SETTINGS_SECTIONS.find((s) => s.id === id)!.title);

// Anything that is not one of the parts means "show the list": a mistyped or old link is never an error. Language now sits
// with Appearance, so an old link to it opens that part.
export function cleanSection(v: unknown): SettingsSection | undefined {
  if (v === 'language') return 'appearance';
  return SETTINGS_SECTIONS.find((s) => s.id === v)?.id;
}

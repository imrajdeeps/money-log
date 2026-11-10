// Settings is a list of headings in groups; tapping one opens just that part. The part is kept in the address (?s=password),
// so a refresh, the back button and a link all land in the same place.
export const SETTINGS_GROUPS = ['Account', 'Money', 'Privacy and security', 'App', 'Danger zone'] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export const SETTINGS_SECTIONS = [
  { id: 'profile', group: 'Account', title: 'Profile', blurb: 'Your name and WhatsApp number' },
  { id: 'account', group: 'Account', title: 'Cloud sync', blurb: 'Sign in, sync, sign out' },
  { id: 'password', group: 'Account', title: 'Password and sessions', blurb: 'Change it, sign out other devices' },
  { id: 'recurring', group: 'Money', title: 'Recurring payments', blurb: 'Rent, SIPs, subscriptions: log with one tap' },
  { id: 'plan', group: 'Money', title: 'Spreadsheet plan', blurb: 'Import your monthly plan (optional)' },
  { id: 'backup', group: 'Money', title: 'Backup', blurb: 'Save or restore a copy of your data' },
  { id: 'lock', group: 'Privacy and security', title: 'App lock', blurb: 'A PIN for this phone' },
  { id: 'receipts', group: 'Privacy and security', title: 'Receipt photos', blurb: 'Storage used on this phone' },
  { id: 'appearance', group: 'App', title: 'Appearance', blurb: 'Light, dark or match the phone' },
  { id: 'about', group: 'App', title: 'About', blurb: 'Version and how to install' },
  { id: 'erase', group: 'Danger zone', title: 'Erase', blurb: 'Clear everything on this phone' },
] as const satisfies readonly { id: string; group: SettingsGroup; title: string; blurb: string }[];

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

// Anything that is not one of the parts means "show the list": a mistyped or old link is never an error.
export function cleanSection(v: unknown): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.id === v)?.id;
}

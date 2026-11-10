// Settings is a short list of headings; tapping one opens just that part. The part is kept in the address (?s=password),
// so a refresh, the back button and a link all land in the same place.
export const SETTINGS_SECTIONS = [
  { id: 'account', title: 'Cloud sync', blurb: 'Sign in, sync, sign out' },
  { id: 'password', title: 'Password and sessions', blurb: 'Change it, sign out other devices' },
  { id: 'recurring', title: 'Recurring payments', blurb: 'Rent, SIPs, subscriptions: log with one tap' },
  { id: 'appearance', title: 'Appearance', blurb: 'Light, dark or match the phone' },
  { id: 'plan', title: 'Spreadsheet plan', blurb: 'Import your monthly plan (optional)' },
  { id: 'receipts', title: 'Receipt photos', blurb: 'Storage used on this phone' },
  { id: 'lock', title: 'App lock', blurb: 'A PIN for this phone' },
  { id: 'backup', title: 'Backup', blurb: 'Save or restore a copy of your data' },
  { id: 'erase', title: 'Erase', blurb: 'Clear everything on this phone' },
  { id: 'about', title: 'About', blurb: 'Version and how to install' },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

// Anything that is not one of the parts means "show the list": a mistyped or old link is never an error.
export function cleanSection(v: unknown): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.id === v)?.id;
}

// The guided tour: what it says, and who gets which one. Pure rules; the screen is features/tour, where "seen" is kept is data/tour.ts.
//   first  a new person (no data yet): a walk through the whole app
//   news   someone who already uses it: only what is new since the version they last saw
export type TourPage = 'home' | 'month' | 'plan' | 'groups' | 'settings' | 'about';
export type TourKind = 'first' | 'news';

export interface TourStep {
  id: string;
  title: string;
  text: string;
  /** the part of the page to point at: the value of its data-tour attribute (the first one that is showing); none = a card in the middle */
  target?: string;
  /** the page to show behind the card */
  go?: TourPage;
  /** news steps only: the version that brought it */
  since?: string;
}

// The walk through the whole app, in order.
export const FIRST_STEPS: readonly TourStep[] = [
  { id: 'welcome', go: 'home', title: 'Welcome to Money Log', text: 'A quick look round, nine short steps. Your payments stay on this phone, and signing in only adds a cloud copy. You can skip now and take the tour again from Settings, About.' },
  { id: 'home', go: 'home', target: 'home', title: 'Overview', text: 'The first page: this month at a glance. What you spent against your budgets, your goals, what is due, and who owes whom. Tap a tile to open it.' },
  { id: 'add', go: 'home', target: 'add', title: 'Log a payment', text: 'Tap Add to log a payment in a few seconds: the amount, a category, done. You can also paste a bank message and let the form fill itself, and attach a receipt photo.' },
  { id: 'month', go: 'month', target: 'month', title: 'Month', text: 'Every category against its budget. Tap the three dots on a category to set its budget, or to add an expense that already has the category.' },
  { id: 'plan', go: 'plan', target: 'plan', title: 'Plan', text: 'What is due soon (swipe a row to delete it), your net worth, and goals with a monthly plan that says how much to put aside for each.' },
  { id: 'groups', go: 'groups', target: 'groups', title: 'Groups', text: 'Share expenses with family, on a trip, with flatmates or a partner, and see who should pay whom. Groups need you to sign in.' },
  { id: 'export', go: 'home', target: 'export', title: 'Export', text: 'Send your payments to a spreadsheet when you want them there. The Export page keeps track of what is already exported.' },
  { id: 'settings', go: 'settings', target: 'settings', title: 'Settings', text: 'Your profile, cloud sync, recurring payments like rent, a backup, a PIN for this phone, and the look of the app.' },
  { id: 'done', go: 'home', title: 'That is it', text: 'Start by adding your first payment. To see this tour again, open Settings, About.' },
];

// What is new, oldest first. A step belongs to the version that brought it.
export const NEWS_STEPS: readonly TourStep[] = [
  { id: 'news-category', since: '1.13.0', go: 'month', target: 'category-actions', title: 'New: actions on a category', text: 'Tap the three dots on a category to set its budget, or to add an expense with the category already chosen. A budget that came from your spreadsheet can now be changed here too.' },
  { id: 'news-settings', since: '1.13.0', go: 'settings', target: 'settings-profile', title: 'New: Settings in groups, and your Profile', text: 'Settings is now in groups. Profile holds your name and an optional WhatsApp number, and when you are signed in, Sign out and Switch account are at the top.' },
  { id: 'news-tour', since: '1.14.0', go: 'about', target: 'about-tour', title: 'New: this tour', text: 'You can take the full tour, or just see what is new, whenever you like from here.' },
  { id: 'news-language', since: '1.15.0', go: 'settings', target: 'settings-language', title: 'New: your language', text: 'The whole app can now be in English, Hindi or Hinglish. Choose it under Settings, Language, and it changes at once.' },
];

/** a is later than b: positive; earlier: negative; same: 0. Versions are "1.13.0" (missing parts count as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Someone who used the app before there was a tour starts from the version before the first news step.
export const BASELINE = '1.12.0';

export interface Tour { kind: TourKind; steps: readonly TourStep[] }

/** The steps of the news tour: what came after `seen`, up to and including the running version. */
export function newsSince(seen: string, version: string): readonly TourStep[] {
  return NEWS_STEPS.filter((s) => s.since !== undefined && compareVersions(s.since, seen) > 0 && compareVersions(s.since, version) <= 0);
}

/**
 * What to show now, or null for nothing. `seen` is the version whose tour was last finished or skipped (null: never).
 * A new person (no data) gets the full tour; someone with data and no `seen` gets what is new since the baseline.
 */
export function pickTour(seen: string | null, version: string, hasData: boolean): Tour | null {
  if (seen === null) {
    if (!hasData) return { kind: 'first', steps: FIRST_STEPS };
    const steps = newsSince(BASELINE, version);
    return steps.length ? { kind: 'news', steps } : null;
  }
  if (compareVersions(version, seen) <= 0) return null;
  const steps = newsSince(seen, version);
  return steps.length ? { kind: 'news', steps } : null;
}

/** For replaying from Settings: the full tour, or everything that is new since the baseline. */
export function replay(kind: TourKind, version: string): Tour {
  return kind === 'first' ? { kind, steps: FIRST_STEPS } : { kind, steps: newsSince(BASELINE, version) };
}

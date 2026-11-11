// The guided tour: what it says, and who gets which one. Pure rules; the screen is features/tour, where "seen" is kept is data/tour.ts.
//   first  a new person (no data yet): a walk through the whole app
//   news   someone who already uses it: only what is new since the version they last saw
export type TourPage = 'home' | 'month' | 'plan' | 'groups' | 'analytics' | 'settings' | 'about';
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
  { id: 'plan', go: 'plan', target: 'plan', title: 'Plan', text: 'Your net worth and your goals, both typed in here, with a monthly plan that says how much to put aside for each goal; below them, what is due soon (swipe a row to delete it).' },
  { id: 'insights', go: 'analytics', target: 'analytics', title: 'Insights', text: 'Your spending in charts: month by month, by category and by day of the week, and where this month is likely to end. It is all worked out on this phone, and nothing is sent anywhere.' },
  { id: 'groups', go: 'groups', target: 'groups', title: 'Groups', text: 'Share expenses with family, on a trip, with flatmates or a partner, and see who should pay whom. Groups need you to sign in.' },
  { id: 'settings', go: 'settings', target: 'settings', title: 'Settings', text: 'Your profile, cloud sync, recurring payments like rent, a backup, a PIN for this phone, and the look of the app.' },
  { id: 'done', go: 'home', title: 'That is it', text: 'Start by adding your first payment. To see this tour again, open Settings, About.' },
];

// What is new, oldest first. A step belongs to the version that brought it.
export const NEWS_STEPS: readonly TourStep[] = [
  { id: 'news-category', since: '1.13.0', go: 'month', target: 'category-actions', title: 'New: actions on a category', text: 'Tap the three dots on a category to set its budget, or to add an expense with the category already chosen. A budget that came from your spreadsheet can now be changed here too.' },
  { id: 'news-settings', since: '1.13.0', go: 'settings', target: 'settings-profile', title: 'New: Settings in groups, and your Profile', text: 'Settings is now in groups. Profile holds your name and an optional WhatsApp number, and when you are signed in, Sign out and Switch account are at the top.' },
  { id: 'news-tour', since: '1.14.0', go: 'about', target: 'about-tour', title: 'New: this tour', text: 'You can take the full tour, or just see what is new, whenever you like from here.' },
  { id: 'news-language', since: '1.15.0', go: 'settings', target: 'settings-language', title: 'New: your language', text: 'The whole app can now be in English, Hindi or Hinglish. Choose it under Settings, Language, and it changes at once.' },
  { id: 'news-insights', since: '1.16.0', go: 'analytics', target: 'analytics', title: 'New: Insights', text: 'A new page with your spending in charts: month by month, by category, by day of the week, and where this month is likely to end. The Overview also has a smoother chart with a dashed line for the likely month end.' },
  { id: 'news-undo', since: '1.17.0', go: 'home', title: 'New: Undo', text: 'After you edit or delete one of your own payments, a message with an Undo button stays for a few seconds. Tap it and the payment is back as it was. (Shared group expenses and payments with receipt photos cannot be undone.)' },
  { id: 'news-repeat', since: '1.18.0', go: 'home', title: 'New: Repeat every month', text: 'When you add a payment, tick Repeat every month and it is also set up as a monthly payment: it comes up on the same day each month to log with one tap. You can change or remove it under Settings, Recurring payments.' },
  { id: 'news-calendar-cancel', since: '1.19.0', go: 'plan', title: 'New: calendar cancels', text: 'When you finish or remove a dated item, the next calendar file you make from Plan also cancels its event, so your phone\'s calendar drops it when you open the file. It only covers events this phone put in a file earlier.' },
  { id: 'news-networth', since: '1.20.0', go: 'plan', target: 'plan', title: 'New: net worth and goals, in the app', text: 'On Plan you can now type your net worth yourself, update it whenever you like and see how it moves, and add short-term and long-term goals right below it. The spreadsheet net worth import is gone: nothing needs to be pasted any more.' },
  { id: 'news-due', since: '1.21.0', go: 'plan', target: 'plan', title: 'New: the due list is made in the app', text: 'On Plan, tap Add an item to put a payment or a to-do on the due list, tap one to change it, and tick it when it is done. Budgets are set under Month. The spreadsheet plan import is gone; what you had imported has been brought across.' },
  { id: 'news-backup-only', since: '1.22.0', go: 'settings', target: 'settings', title: 'New: one file in and out', text: 'The backup file is now the only file that goes in and out of the app. Export to the spreadsheet is gone, because everything is made in the app. Download a backup from Settings, Backup now and then.' },
  { id: 'news-notifications', since: '1.24.0', go: 'home', target: 'notifications', title: 'New: the notification bell', text: 'The bell at the top shows what needs you now: due items, recurring payments waiting, budgets close to their limit, goals, group balances and reminders for net worth and backups. Tap one to open the right screen, or the cross to hide it. Settings, Notifications chooses what you are told about.' },
  { id: 'news-login-history', since: '1.25.0', go: 'settings', target: 'settings', title: 'New: login history', text: 'Settings, Password and sessions now shows where your account is signed in (device and browser) and what happened to it lately: sign-ins, password changes, sign-outs. A sign-in on another device also shows on the bell. Switch account is gone: Sign out and erase this phone does the same.' },
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

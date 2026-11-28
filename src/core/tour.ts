// The guided tour: what it says, and who gets which one. Pure rules; the screen is features/tour, where "seen" is kept is data/tour.ts.
//   first  the walk through the whole app (a new person gets the short welcome instead; Settings, About replays this)
//   news   someone who already uses it: what is new since the version they last saw, released this month, the newest few
import type { Feature } from './featureKinds.ts';

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
  /** news steps only: the version that brought it, and the day that version was released */
  since?: string;
  on?: string;
  /** the part (Settings, Features) the step is about: left out while that part is off */
  needs?: Feature;
}

// The walk through the whole app, in the order of the bottom bar (version 2.1: Groups first, short, one idea a card; the owner:
// "simple and short and should cover all major feature"). The Plan card shows only while Plan is turned on.
export const FIRST_STEPS: readonly TourStep[] = [
  { id: 'welcome', go: 'home', title: 'Welcome to Hisaab', text: 'Your spending and the money you share, in one place. A few quick cards; skip any time and take the tour again from Settings, About.' },
  { id: 'groups', go: 'groups', target: 'groups', title: 'Groups', text: 'Split rent, trips and bills with the people you share them with. See who owes whom, then Remind or Pay by UPI.' },
  { id: 'add', go: 'home', target: 'add', title: 'Add a payment', text: 'Tap Add: the amount, a category, done. Split it with a group or make it repeat every month from the same form.' },
  { id: 'home', go: 'home', target: 'home', title: 'Overview', text: 'This month at a glance: what is left of your budgets, what is safe to spend each day, and who owes whom.' },
  { id: 'month', go: 'month', target: 'month', title: 'Month', text: 'Every category against its budget. Tap the three dots on one to set its budget.' },
  { id: 'plan', go: 'plan', target: 'plan', needs: 'plan', title: 'Plan', text: 'Your goals and what is due, with a calendar reminder. Net worth can be turned on in Settings, Features.' },
  { id: 'done', go: 'home', title: 'That is it', text: 'Sync, backup, the app lock and Features (where Plan and Net worth are turned on) are in Settings.' },
];

// What is new, oldest first. A step belongs to the version that brought it.
export const NEWS_STEPS: readonly TourStep[] = [
  { id: 'news-category', since: '1.13.0', on: '2026-11-11', go: 'month', target: 'category-actions', title: 'New: actions on a category', text: 'Tap the three dots on a category to set its budget, or to add an expense with the category already chosen. A budget that came from your spreadsheet can now be changed here too.' },
  { id: 'news-settings', since: '1.13.0', on: '2026-11-11', go: 'settings', target: 'settings-profile', title: 'New: Settings in groups, and your Profile', text: 'Settings is now in groups. Profile holds your name and an optional WhatsApp number, and when you are signed in, Sign out and Switch account are at the top.' },
  { id: 'news-tour', since: '1.14.0', on: '2026-11-11', go: 'about', target: 'about-tour', title: 'New: this tour', text: 'You can take the full tour, or just see what is new, whenever you like from here.' },
  { id: 'news-language', since: '1.15.0', on: '2026-11-11', go: 'settings', target: 'settings-language', title: 'New: your language', text: 'The whole app can now be in English, Hindi or Hinglish. Choose it under Settings, Language, and it changes at once.' },
  { id: 'news-insights', needs: 'insights', since: '1.16.0', on: '2026-11-11', go: 'analytics', target: 'analytics', title: 'New: Insights', text: 'A new page with your spending in charts: month by month, by category, by day of the week, and where this month is likely to end. The Overview also has a smoother chart with a dashed line for the likely month end.' },
  { id: 'news-undo', since: '1.17.0', on: '2026-11-11', go: 'home', title: 'New: Undo', text: 'After you edit or delete one of your own payments, a message with an Undo button stays for a few seconds. Tap it and the payment is back as it was. (Shared group expenses and payments with receipt photos cannot be undone.)' },
  { id: 'news-repeat', since: '1.18.0', on: '2026-11-11', go: 'home', title: 'New: Repeat every month', text: 'When you add a payment, tick Repeat every month and it is also set up as a monthly payment: it comes up on the same day each month to log with one tap. You can change or remove it under Settings, Recurring payments.' },
  { id: 'news-calendar-cancel', needs: 'plan', since: '1.19.0', on: '2026-11-11', go: 'plan', title: 'New: calendar cancels', text: 'When you finish or remove a dated item, the next calendar file you make from Plan also cancels its event, so your phone\'s calendar drops it when you open the file. It only covers events this device put in a file earlier.' },
  { id: 'news-networth', needs: 'worth', since: '1.20.0', on: '2026-11-11', go: 'plan', target: 'plan', title: 'New: net worth and goals, in the app', text: 'On Plan you can now type your net worth yourself, update it whenever you like and see how it moves, and add short-term and long-term goals right below it. The spreadsheet net worth import is gone: nothing needs to be pasted any more.' },
  { id: 'news-due', needs: 'plan', since: '1.21.0', on: '2026-11-11', go: 'plan', target: 'plan', title: 'New: the due list is made in the app', text: 'On Plan, tap Add an item to put a payment or a to-do on the due list, tap one to change it, and tick it when it is done. Budgets are set under Month. The spreadsheet plan import is gone; what you had imported has been brought across.' },
  { id: 'news-backup-only', since: '1.22.0', on: '2026-11-11', go: 'settings', target: 'settings', title: 'New: one file in and out', text: 'The backup file is now the only file that goes in and out of the app. Export to the spreadsheet is gone, because everything is made in the app. Download a backup from Settings, Backup now and then.' },
  { id: 'news-notifications', since: '1.24.0', on: '2026-11-11', go: 'home', target: 'notifications', title: 'New: the notification bell', text: 'The bell at the top shows what needs you now: due items, recurring payments waiting, budgets close to their limit, goals, group balances and reminders for net worth and backups. Tap one to open the right screen, or the cross to hide it. Settings, Notifications chooses what you are told about.' },
  { id: 'news-login-history', since: '1.25.0', on: '2026-11-11', go: 'settings', target: 'settings', title: 'New: login history', text: 'Settings, Password and sessions now shows where your account is signed in (device and browser) and what happened to it lately: sign-ins, password changes, sign-outs. A sign-in on another device also shows on the bell. Switch account is gone: Sign out and erase this device does the same.' },
  { id: 'news-income', since: '1.26.0', on: '2026-11-11', go: 'home', title: 'New: income and cash flow', text: 'Add has a Spent / Received switch now: log salary, lent-back money, cashback, refunds and more under Received. The Overview and a new Cash flow page show, month by month, what came in, what went out and what is left, with savings counted apart.' },
  { id: 'news-group-settings', since: '1.27.0', on: '2026-11-14', go: 'home', title: 'New: group settings, goal delete, payment sorting', text: 'Each group page is lighter now: its Group settings button holds Invite people, Usual split, the people and leaving, for that group only. A goal can be deleted from its own screen (it asks first). All payments can be sorted by date, amount, category or last added; the choice stays on this device.' },
  { id: 'news-circle', since: '1.28.0', on: '2026-11-14', go: 'home', title: 'New: your Circle and the primary admin', text: 'Groups has Your Circle now: everyone you share a group with is in it, and you can add anyone else with a code or link. They see only your name. Every group has a primary admin (the person who made it): they cannot be removed, and only they make or remove admins or hand the role on.' },
  { id: 'news-shared-goals', needs: 'plan', since: '1.29.0', on: '2026-11-14', go: 'home', title: 'New: shared goals', text: 'Goals has a Shared goals section now: one target and one date, with people from your Circle. Each person adds their own top-ups, and everyone sees the total and who put in what. People join only when they accept, and a shared goal never counts in your own plan.' },
  { id: 'news-getting-started', since: '1.30.0', on: '2026-11-24', go: 'home', title: 'New: faster logging and a daily reminder', text: 'Add expense shows every category as a button, with Today and Yesterday, and Save and add another. A group page has Add a shared expense, and invitations can be shared on WhatsApp. Settings, Notifications can make a daily reminder in your calendar.' },
  { id: 'news-groups-loop', since: '1.31.0', on: '2026-11-24', go: 'groups', title: 'New: your share counts, remind and pay, and Udhaar', text: 'In flatmate and couple groups your share of what others add now counts in your own Month. Where someone owes you, Remind opens WhatsApp; where you owe, Pay opens your UPI app. A group shows what is new since you last opened it. Udhaar keeps track of money you lent or borrowed.' },
  { id: 'news-less-typing', since: '1.32.0', on: '2026-11-24', go: 'home', title: 'New: less typing', text: 'Add expense has a one-line box: type 450 swiggy upi and press Enter. You can review several bank messages together, the Overview says how much is safe to spend each day and recaps last week on Mondays, and the Month page can set budgets from last month.' },
  { id: 'news-net-worth', needs: 'worth', since: '1.33.0', on: '2026-11-25', go: 'plan', title: 'New: net worth you can keep up', text: 'On the Plan page, list what you own and owe and your net worth is worked out for you. A monthly check-in takes a minute, a loan with an EMI pays itself down as an estimate, and you see what moved, where the money sits and how long your cash and bank would last.' },
  { id: 'news-keep-it-running', since: '1.34.0', on: '2026-11-25', go: 'groups', title: 'New: clearer group history, and a heads-up when something is wrong', text: 'In a group, the history shows green where you are owed and red where you owe, and there is one Record button. If something goes wrong the app says so and can copy a report to send, and it tells you when a new version is ready.' },
  { id: 'news-hisaab', since: '2.0.0', on: '2026-11-26', go: 'home', title: 'New: Hisaab, a new look, and udhaar with your Circle', text: 'Money Log is now Hisaab, with a fresh look in light and dark. In Udhaar, pick someone from your Circle and the entry shows in their Udhaar too once they agree. Toasts and the bell make a soft sound (turn it off under Settings, Appearance), and Profile can read your UPI id from a QR code.' },
  { id: 'news-groups-first', since: '2.1.0', on: '2026-11-27', go: 'groups', target: 'groups', title: 'New: groups first, and parts you turn on', text: 'Groups is the first tab now. Plan and Net worth stay hidden until you turn them on in Settings, Features: nothing was deleted, and turning one on brings everything back. A group can choose Simplify repayments, and In my month asks from which day it counts.' },
  { id: 'news-worth-history', needs: 'worth', since: '2.1.0', on: '2026-11-27', go: 'plan', target: 'plan', title: 'New: every net worth update', text: 'Under Net worth, See every update shows the chart and each figure you saved. Change or delete one, with Undo, and a figure that looks like a typo is pointed out.' },
  { id: 'news-group-repeats', since: '2.2.0', on: '2026-11-27', go: 'groups', target: 'groups', title: 'New: rent that repeats in a group', text: 'When you add a shared expense, tick Repeat every month. It comes up in the group on its day, paid by the same person and split the same way, and the people in it log it with one tap. It counts once, whoever taps first.' },
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

// What is new shows only what was released in the current calendar month, the newest NEWS_MAX cards at most (version 2.1; the owner:
// "What is new -> only show the feature that are released in the current month").
export const NEWS_MAX = 3;

/** today: YYYY-MM-DD; on: the parts that are turned on (Settings, Features), whose cards may show. */
export interface TourContext { today: string; on: ReadonlySet<Feature> }

const forParts = (steps: readonly TourStep[], on: ReadonlySet<Feature>): readonly TourStep[] => steps.filter((s) => !s.needs || on.has(s.needs));

/** The walk through the app, without the cards of parts that are turned off. */
export const firstSteps = (on: ReadonlySet<Feature>): readonly TourStep[] => forParts(FIRST_STEPS, on);

/** The steps of the news tour: what came after `seen`, up to and including the running version, released this month, the newest few. */
export function newsSince(seen: string, version: string, ctx: TourContext): readonly TourStep[] {
  const month = ctx.today.slice(0, 7);
  const steps = NEWS_STEPS.filter((s) => s.since !== undefined && compareVersions(s.since, seen) > 0 && compareVersions(s.since, version) <= 0 && (s.on ?? '').startsWith(month));
  return forParts(steps, ctx.on).slice(-NEWS_MAX);
}

/**
 * What to show now, or null for nothing. `seen` is the version whose tour was last finished or skipped (null: never).
 * A new person (no data) gets the full tour; someone with data and no `seen` gets what is new since the baseline.
 */
export function pickTour(seen: string | null, version: string, hasData: boolean, ctx: TourContext): Tour | null {
  if (seen === null && !hasData) return { kind: 'first', steps: firstSteps(ctx.on) };
  if (seen !== null && compareVersions(version, seen) <= 0) return null;
  const steps = newsSince(seen ?? BASELINE, version, ctx);
  return steps.length ? { kind: 'news', steps } : null;
}

/** For replaying from Settings: the full tour, or what is new this month. */
export function replay(kind: TourKind, version: string, ctx: TourContext): Tour {
  return kind === 'first' ? { kind, steps: firstSteps(ctx.on) } : { kind, steps: newsSince(BASELINE, version, ctx) };
}

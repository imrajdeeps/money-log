// The notification center: what needs the person's attention right now, worked out from data the phone already holds (so it needs no
// server and works offline), plus the dismissals and switches that go with it. Pure, like goals.ts, whose block keeps the dismissals
// (kind 'k') and the switches (kind 's'). The rules are in docs/prd-notifications.md.
import { daysBetween, dueRelative } from './blocks.ts';
import type { DueItem } from './blocks.ts';
import { shortDate } from './format.ts';
import { NOTICE_SETTINGS_ID, noticeId } from './goals.ts';
import type { DismissEntry, Goal, GoalLine, GoalProgress, Goals, NetNow, NoticeSettings } from './goals.ts';
import { NOTICE_KINDS } from './noticeKinds.ts';
import type { NoticeKind } from './noticeKinds.ts';
import { tr } from './i18n.ts';
import { catKey, fmtINR, nearBudget, parseTs } from './logic.ts';
import { agoText, deviceName } from './signins.ts';
import type { SessionInfo } from './signins.ts';
import type { MonthRow } from './logic.ts';
import type { RecurDue } from './recurring.ts';

export type Tone = 'attention' | 'soon' | 'reminder';
export type OpenTarget =
  | { to: 'plan'; part: 'due' | 'goals' | 'networth' }
  | { to: 'month' }
  | { to: 'group'; id: string }
  | { to: 'settings'; part: 'recurring' | 'backup' | 'account' | 'password' };

export interface Notice { key: string; kind: NoticeKind; tone: Tone; title: string; detail: string; open: OpenTarget }

// What the rules look at. The app fills it from its state; the tests fill it by hand.
export interface NoticeInput {
  today: string; // YYYY-MM-DD
  nowMs: number;
  dueItems: DueItem[];
  recurring: RecurDue[]; // this month's, as recurringThisMonth gives them
  budgetRows: MonthRow[]; // this month's categories
  goals: { goal: Goal; progress: GoalProgress; line: GoalLine }[];
  groups: { id: string; name: string; balance: number }[]; // groups with company; balance in rupees: positive = owed to the person
  netWorth: NetNow | null;
  lastBackupMs: number | null; // when a backup was last downloaded on this phone
  hasPayments: boolean;
  sync: { mode: string; pending: number; lastSync: number | null; error: string | null };
  sessions: SessionInfo[] | null; // where the account is signed in now (null: not known: not signed in, offline, or the database has no such function yet)
}

export const DUE_LEAD_DAYS = 3; // a due item shows this many days before its date
export const GOAL_LEAD_DAYS = 30; // a goal shows this many days before its date
export const GOAL_BEHIND = 0.25; // a goal is behind when the share of time gone is this far ahead of the share saved
export const STALE_DAYS = 30; // net worth and backup reminders
export const SIGNIN_DAYS = 7; // a sign-in on another device is news for this many days
const DAY_MS = 86_400_000;

const month = (i: NoticeInput): string => i.today.slice(0, 7);
const plural = (n: number): string => (n === 1 ? '' : 's');

// ---------------------------------------------------------------- the rules, one per kind
type DueStage = 'overdue' | 'today' | 'soon';
const dueStage = (days: number): DueStage => {
  if (days < 0) return 'overdue';
  return days === 0 ? 'today' : 'soon';
};

function dueTitle(item: DueItem, days: number, stage: DueStage): string {
  if (stage === 'overdue') return tr('{0} is overdue by {1} day{2}', item.title, -days, plural(-days));
  if (stage === 'today') return tr('{0} is due today', item.title);
  return tr('{0} is due {1}', item.title, dueRelative(days));
}

function dueNotices(i: NoticeInput): Notice[] {
  const out: Notice[] = [];
  for (const item of i.dueItems) {
    if (item.done || !item.due) continue;
    const days = daysBetween(i.today, item.due);
    if (days > DUE_LEAD_DAYS) continue;
    const stage = dueStage(days);
    const detail = [item.amount ? fmtINR(item.amount) : null, shortDate(item.due)].filter(Boolean).join(' · ');
    out.push({ key: `due:${item.k}:${stage}`, kind: 'due', tone: stage === 'overdue' ? 'attention' : 'soon', title: dueTitle(item, days, stage), detail, open: { to: 'plan', part: 'due' } });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

function recurringNotices(i: NoticeInput): Notice[] {
  return i.recurring.filter((r) => r.state === 'due').map((r): Notice => ({
    key: `rec:${r.item.id}:${month(i)}`, kind: 'recurring', tone: 'soon',
    title: tr('{0} is waiting to be logged', r.item.c),
    detail: `${fmtINR(r.item.a)} · ${shortDate(r.date)}`,
    open: { to: 'settings', part: 'recurring' },
  }));
}

// Saving is left out: for the Saving group the budget is a target to reach, not a limit.
function budgetNotices(i: NoticeInput): Notice[] {
  const out: Notice[] = [];
  for (const r of i.budgetRows) {
    if (r.group === 'Saving' || !r.budgeted || !(r.planned > 0)) continue;
    const over = r.spent > r.planned;
    if (!over && !nearBudget(r.spent, r.planned)) continue;
    const key = `bud:${catKey(r.category)}:${month(i)}:${over ? 'over' : 'near'}`;
    if (over) out.push({ key, kind: 'budget', tone: 'attention', title: tr('{0} is over its budget', r.category), detail: tr('{0} spent of {1}', fmtINR(r.spent), fmtINR(r.planned)), open: { to: 'month' } });
    else out.push({ key, kind: 'budget', tone: 'soon', title: tr('{0} has used {1}% of its budget', r.category, Math.round((r.spent / r.planned) * 100)), detail: tr('{0} left of {1}', fmtINR(r.planned - r.spent), fmtINR(r.planned)), open: { to: 'month' } });
  }
  return out;
}

const share = (part: number, whole: number): number => (whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 1);

// The share of the time between the day the goal was made and its date that has gone by.
const timeGone = (goal: Goal, today: string): number => share(daysBetween(goal.b, today), daysBetween(goal.b, goal.d));

function goalNotice(g: { goal: Goal; progress: GoalProgress; line: GoalLine }, i: NoticeInput): Notice | null {
  const { goal, progress, line } = g;
  if (line.state === 'reached') return null;
  const key = `goal:${goal.id}:${month(i)}`;
  const open: OpenTarget = { to: 'plan', part: 'goals' };
  if (line.state === 'passed') return { key, kind: 'goal', tone: 'attention', title: tr('The date of {0} has passed', goal.n), detail: tr('{0} still to go', fmtINR(progress.remaining)), open };
  const days = daysBetween(i.today, goal.d);
  if (days <= GOAL_LEAD_DAYS) return { key, kind: 'goal', tone: 'soon', title: tr('{0} is due {1}', goal.n, dueRelative(days)), detail: tr('{0} still to go', fmtINR(progress.remaining)), open };
  const gone = timeGone(goal, i.today);
  if (gone - progress.fraction <= GOAL_BEHIND) return null;
  return { key, kind: 'goal', tone: 'soon', title: tr('{0} is behind', goal.n), detail: tr('{0}% saved, {1}% of the time gone', Math.round(progress.fraction * 100), Math.round(gone * 100)), open };
}

function goalNotices(i: NoticeInput): Notice[] {
  return i.goals.map((g) => goalNotice(g, i)).filter((n): n is Notice => n !== null);
}

function groupNotices(i: NoticeInput): Notice[] {
  const out: Notice[] = [];
  for (const g of i.groups) {
    if (g.balance >= 1) out.push({ key: `grp:${g.id}:owed`, kind: 'group', tone: 'reminder', title: tr('{0}: you are owed {1}', g.name, fmtINR(g.balance)), detail: tr('Time to settle up'), open: { to: 'group', id: g.id } });
    else if (g.balance <= -1) out.push({ key: `grp:${g.id}:owe`, kind: 'group', tone: 'reminder', title: tr('{0}: you owe {1}', g.name, fmtINR(-g.balance)), detail: tr('Time to settle up'), open: { to: 'group', id: g.id } });
  }
  return out;
}

function netWorthNotices(i: NoticeInput): Notice[] {
  if (!i.netWorth) return []; // nothing entered yet: the Overview tile already invites
  const days = daysBetween(i.netWorth.date, i.today);
  if (days <= STALE_DAYS) return [];
  return [{ key: `networth:${month(i)}`, kind: 'networth', tone: 'reminder', title: tr('Update your net worth'), detail: tr('Last updated {0} days ago', days), open: { to: 'plan', part: 'networth' } }];
}

function backupNotices(i: NoticeInput): Notice[] {
  if (!i.hasPayments) return [];
  const never = i.lastBackupMs === null;
  const days = never ? 0 : Math.floor((i.nowMs - (i.lastBackupMs ?? 0)) / DAY_MS);
  if (!never && days <= STALE_DAYS) return [];
  const detail = never ? tr('You have not downloaded one yet. The free database plan keeps no backups of its own.') : tr('The last one was {0} days ago.', days);
  return [{ key: `backup:${month(i)}`, kind: 'backup', tone: 'reminder', title: tr('Download a backup'), detail, open: { to: 'settings', part: 'backup' } }];
}

function syncNotices(i: NoticeInput): Notice[] {
  const s = i.sync;
  const key = `sync:${i.today}`;
  const open: OpenTarget = { to: 'settings', part: 'account' };
  if (s.mode === 'error') return [{ key, kind: 'sync', tone: 'attention', title: tr('Sync is not working'), detail: s.error ?? tr('Open Cloud sync to see why.'), open }];
  const stuck = s.pending > 0 && s.lastSync !== null && i.nowMs - s.lastSync > DAY_MS;
  if (!stuck) return [];
  return [{ key, kind: 'sync', tone: 'attention', title: tr('Changes are not reaching the cloud'), detail: tr('{0} change{1} waiting for more than a day.', s.pending, plural(s.pending)), open }];
}

// A session on another device that began recently. This phone's own session never produces one.
function signInNotices(i: NoticeInput): Notice[] {
  return (i.sessions ?? [])
    .filter((s) => !s.isCurrent && i.nowMs - s.createdMs <= SIGNIN_DAYS * DAY_MS)
    .map((s): Notice => ({
      key: `signin:${s.id}`, kind: 'signin', tone: 'attention',
      title: tr('Signed in on another device'),
      detail: `${deviceName(s.userAgent)} · ${agoText(i.nowMs, s.createdMs)}`,
      open: { to: 'settings', part: 'password' },
    }));
}

const RULES: Record<NoticeKind, (i: NoticeInput) => Notice[]> = {
  due: dueNotices, recurring: recurringNotices, budget: budgetNotices, goal: goalNotices,
  group: groupNotices, networth: netWorthNotices, backup: backupNotices, sync: syncNotices, signin: signInNotices,
};

const TONE_RANK: Record<Tone, number> = { attention: 0, soon: 1, reminder: 2 };

/** Everything that needs attention now, from the kinds that are on and not dismissed: needs attention first, then coming up, then reminders. */
export function buildNotices(input: NoticeInput, enabled: ReadonlySet<NoticeKind>, dismissed: ReadonlySet<string>): Notice[] {
  return NOTICE_KINDS.filter((k) => enabled.has(k))
    .flatMap((k) => RULES[k](input))
    .filter((n) => !dismissed.has(n.key))
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

// ---------------------------------------------------------------- dismissals and switches (items of the goals block)
const KEEP_DISMISSALS = 500; // the app keeps the newest ones

export function dismissedKeys(items: Goals): Set<string> {
  return new Set(Object.values(items).filter((x): x is DismissEntry => x.k === 'k' && !x.x).map((x) => x.key));
}

/** Hide a notification for good (until its key changes). The oldest dismissals are dropped beyond 500. */
export function dismissNotice(items: Goals, key: string, nowIso: string): Goals {
  const id = noticeId(key);
  const cur = items[id];
  if (cur?.k === 'k' && !cur.x) return items;
  const out: Goals = { ...items, [id]: { id, k: 'k', key, x: 0, t: nowIso } };
  const all = Object.values(out).filter((x): x is DismissEntry => x.k === 'k');
  if (all.length <= KEEP_DISMISSALS) return out;
  const oldest = all.sort((a, b) => parseTs(a.t) - parseTs(b.t)).slice(0, all.length - KEEP_DISMISSALS);
  for (const d of oldest) delete out[d.id];
  return out;
}

/** Bring every dismissed notification back. */
export function showDismissedAgain(items: Goals, nowIso: string): Goals {
  const out: Goals = { ...items };
  let changed = false;
  for (const x of Object.values(items)) {
    if (x.k !== 'k' || x.x) continue;
    out[x.id] = { ...x, x: 1, t: nowIso };
    changed = true;
  }
  return changed ? out : items;
}

const settingsOf = (items: Goals): NoticeSettings | null => {
  const s = items[NOTICE_SETTINGS_ID];
  return s?.k === 's' ? s : null;
};

/** The kinds that are switched on (all of them until the person switches one off). */
export function enabledKinds(items: Goals): Set<NoticeKind> {
  const off = new Set(settingsOf(items)?.off ?? []);
  return new Set(NOTICE_KINDS.filter((k) => !off.has(k)));
}

export function setNoticeKind(items: Goals, kind: NoticeKind, on: boolean, nowIso: string): Goals {
  const enabled = enabledKinds(items);
  if (enabled.has(kind) === on) return items;
  if (on) enabled.add(kind); else enabled.delete(kind);
  const off = NOTICE_KINDS.filter((k) => !enabled.has(k)).sort((a, b) => a.localeCompare(b));
  return { ...items, [NOTICE_SETTINGS_ID]: { id: NOTICE_SETTINGS_ID, k: 's', off, x: 0, t: nowIso } };
}

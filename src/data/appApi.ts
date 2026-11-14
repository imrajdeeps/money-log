import type { DueItem } from '../core/blocks.ts';
import type { DueInput } from '../core/dueItems.ts';
import type { NoticeKind } from '../core/noticeKinds.ts';
import type { SessionInfo, SignInEvent } from '../core/signins.ts';
import type { BackupParse } from './backup.ts';
import type { AddResult, CategoryInfo, Mine } from '../core/categories.ts';
import type { HistoryRow } from '../core/history.ts';
import type { LockConfig } from './lock.ts';
import type { Receipt } from '../core/receipts.ts';
import type { Group, Invite, Member, NewSettlementInput, Settlement, UsualSplit } from '../core/groups.ts';
import type { GroupKind } from '../core/groupKinds.ts';
import type { CircleMember } from '../core/circle.ts';
import type { SharedGoal } from '../core/sharedGoals.ts';

// Shared goals live on the server: each call asks it and throws when offline (or when the database has no 1.29 yet).
export interface SharedGoalsApi {
  load: () => Promise<SharedGoal[]>;
  create: (name: string, target: number, date: string, displayName: string, invite: string[]) => Promise<string>;
  edit: (goal: string, name: string, target: number, date: string) => Promise<void>; // the creator
  invite: (goal: string, userId: string) => Promise<void>; // the creator, someone in the Circle
  answer: (goal: string, accept: boolean, displayName: string) => Promise<void>;
  leave: (goal: string) => Promise<void>;
  removePerson: (goal: string, userId: string) => Promise<void>; // the creator
  remove: (goal: string) => Promise<void>; // the creator deletes the goal for everyone
  addTopUp: (goal: string, amount: number, date: string) => Promise<void>;
  removeTopUp: (goal: string, id: string) => Promise<void>; // your own
}
import type { Entry, Group as Cat, NewEntryInput } from '../core/logic.ts';
import type { Store } from './store.ts';
import type { GoalInput, Goals } from '../core/goals.ts';
import type { IncomeCatResult } from '../core/income.ts';
import type { RecurInput, Recurring } from '../core/recurring.ts';
import type { Sync, SyncState } from './sync.ts';

export interface Engine { store: Store; sync: Sync }

/** A button that comes with a message: what it says and what it does. */
export interface ToastAction { label: string; run: () => void | Promise<void> }

export interface AppApi {
  ready: boolean;
  storageKind: Store['kind'];
  me: string | null; // this phone's account id once it has signed in
  receipts: Receipt[]; // every photo record this phone holds, mine and other people's, deleted ones included
  lock: LockConfig | null; // the PIN lock, when one is set
  locked: boolean;
  unlock: (pin: string) => Promise<{ ok: true } | { ok: false; waitSec: number }>;
  setPin: (pin: string, timeoutSec: number) => Promise<void>;
  // Changes or removes the lock; the current PIN is needed. Returns an error text, or null when it worked.
  updateLock: (currentPin: string, change: 'remove' | { pin?: string; timeoutSec?: number }) => Promise<string | null>;
  addReceipts: (entryId: string, pictures: Blob[]) => Promise<void>;
  removeReceipt: (id: string) => Promise<void>;
  receiptBlob: (r: Receipt) => Promise<Blob>;
  fetchHistory: (entryId: string) => Promise<HistoryRow[]>;
  loadSessions: () => Promise<SessionInfo[]>; // where the account is signed in now (throws when offline or the database has no such function yet)
  loadSignInLog: (limit?: number) => Promise<SignInEvent[]>; // what happened to the account, newest first
  entries: Entry[]; // this account's own payments, not deleted (shared ones included, at their full amount)
  allEntries: Entry[]; // this account's own payments including deleted ones, for backups
  groupEntries: Entry[]; // every live shared expense this phone holds, whoever made it
  groups: Group[];
  members: Member[];
  invites: Invite[]; // the join codes of the groups this account administers
  settlements: Settlement[];
  joinCode: string | null; // a code that arrived in the link, waiting for the person to confirm
  clearJoinCode: () => void;
  dueItems: DueItem[]; // the due list: payments and to-dos made in the app, removed ones left out (the key is the item's id)
  mine: Mine; // the categories and budgets set in the app
  recurring: Recurring; // payments that repeat every month, removed ones included
  addRecurring: (i: RecurInput, loggedMonth?: string) => Promise<string | null>; // null when it worked, else what to tell the person
  editRecurring: (id: string, i: RecurInput) => Promise<string | null>;
  removeRecurring: (id: string) => Promise<void>;
  logRecurring: (id: string, how: 'log' | 'skip') => Promise<void>;
  goals: Goals; // goals and their top-ups, removed ones included
  addGoal: (i: GoalInput) => Promise<string | null>; // null when it worked, else what to tell the person
  editGoal: (id: string, i: GoalInput) => Promise<string | null>;
  removeGoal: (id: string) => Promise<void>;
  addTopUp: (goalId: string, amount: number, date: string) => Promise<string | null>;
  removeTopUp: (id: string) => Promise<void>;
  addNetWorth: (amount: number, date: string) => Promise<string | null>; // a net worth update; the error text, or null
  removeNetWorth: (id: string) => Promise<void>;
  incomeCats: string[]; // what can be picked for income: built-in, then the person's own
  addIncomeCategory: (name: string) => Promise<IncomeCatResult>;
  removeIncomeCategory: (name: string) => Promise<void>; // one of the person's own only
  sessions: SessionInfo[] | null; // where the account is signed in now (null: not known)
  dismissed: ReadonlySet<string>; // notifications the person dismissed (their keys)
  noticeKinds: ReadonlySet<NoticeKind>; // the kinds of notification that are switched on
  dismissNotice: (key: string) => Promise<void>;
  setNoticeKind: (kind: NoticeKind, on: boolean) => Promise<void>;
  showDismissed: () => Promise<void>; // bring every dismissed notification back
  categories: CategoryInfo[]; // everything that can be picked: built-in, own and the imported plan's, merged
  sync: SyncState;
  syncEnabled: boolean;
  toastMsg: string | null;
  toastAction: ToastAction | null; // a button in the message (Undo)
  toast: (msg: string, action?: ToastAction) => void;
  addEntry: (input: NewEntryInput) => Promise<string>; // the new payment's id
  updateEntry: (id: string, changes: Partial<NewEntryInput>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  undoEntry: (before: Entry) => Promise<void>; // puts a payment back as it was before an edit or a delete
  addDue: (i: DueInput) => Promise<string | null>; // null when it worked, else what to tell the person
  editDue: (id: string, i: DueInput) => Promise<string | null>;
  toggleDone: (id: string, done: boolean) => Promise<void>;
  removeDue: (id: string) => Promise<void>; // take an item off the due list (swipe to delete)
  addCategory: (name: string, group: Cat) => Promise<AddResult>;
  removeCategory: (name: string) => Promise<void>;
  saveBudgets: (budgets: { name: string; amount: number }[]) => Promise<void>;
  addSettlement: (input: NewSettlementInput) => Promise<void>;
  removeSettlement: (id: string) => Promise<void>;
  createGroup: (name: string, kind: GroupKind, displayName: string) => Promise<string>;
  joinGroup: (code: string, displayName: string) => Promise<string>;
  resetInvite: (groupId: string) => Promise<string>;
  leaveGroup: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  makeAdmin: (groupId: string, userId: string) => Promise<void>; // the primary admin only
  revokeAdmin: (groupId: string, userId: string) => Promise<void>; // the primary admin only
  makePrimaryAdmin: (groupId: string, userId: string) => Promise<void>; // the primary admin hands the role over
  claimPrimaryAdmin: (groupId: string) => Promise<void>; // a group with no primary admin: its longest-standing admin takes over
  circle: () => Promise<CircleMember[]>; // who is in the Circle (asks the server; throws when offline or the database has no 1.28 yet)
  newCircleCode: () => Promise<string>;
  joinCircle: (code: string) => Promise<string>; // returns the name of the person whose code it was
  removeFromCircle: (userId: string) => Promise<void>;
  sharedGoals: SharedGoalsApi;
  circleCode: string | null; // a Circle link was opened: the code it carried
  clearCircleCode: () => void;
  setDisplayName: (groupId: string, name: string) => Promise<void>;
  setTripDates: (groupId: string, starts: string | null, ends: string | null) => Promise<void>; // admins, trips
  setGroupClosed: (groupId: string, closed: boolean) => Promise<void>; // admins, trips: close or reopen
  setUsualSplit: (groupId: string, split: UsualSplit | null) => Promise<void>; // admins, flatmates
  restoreBackup: (b: Extract<BackupParse, { ok: true }>) => Promise<{ added: number; updated: number }>;
  syncNow: () => void;
  signUp: (email: string, password: string) => Promise<'signed-in' | 'confirm'>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  recovering: boolean; // the person opened a reset link: signed in, and now choosing a new password
  authNotice: { text: string; bad: boolean } | null; // what a link from an email led to, to be shown in Settings
  dismissAuthNotice: () => void;
  changePassword: (password: string) => Promise<void>;
  signOutOthers: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  signOut: () => Promise<void>;
  eraseAll: () => Promise<void>;
}

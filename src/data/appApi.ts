import type { DoneMap, DueBlock, DueData, NetBlock, NetData } from '../core/blocks.ts';
import type { BackupParse } from './backup.ts';
import type { AddResult, CategoryInfo, Mine } from '../core/categories.ts';
import type { HistoryRow } from '../core/history.ts';
import type { LockConfig } from './lock.ts';
import type { Receipt } from '../core/receipts.ts';
import type { Group, Invite, Member, NewSettlementInput, Settlement } from '../core/groups.ts';
import type { GroupKind } from '../core/groupKinds.ts';
import type { Entry, Group as Cat, NewEntryInput, Plan, PlanData } from '../core/logic.ts';
import type { Store } from './store.ts';
import type { RecurInput, Recurring } from '../core/recurring.ts';
import type { Sync, SyncState } from './sync.ts';
import { syncEnabled } from './context.tsx';

export interface Engine { store: Store; sync: Sync }

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
  entries: Entry[]; // this account's own payments, not deleted (shared ones included, at their full amount)
  allEntries: Entry[]; // this account's own payments including deleted ones, for backups
  groupEntries: Entry[]; // every live shared expense this phone holds, whoever made it
  groups: Group[];
  members: Member[];
  invites: Invite[]; // the join codes of the groups this account administers
  settlements: Settlement[];
  joinCode: string | null; // a code that arrived in the link, waiting for the person to confirm
  clearJoinCode: () => void;
  plan: Plan | null;
  due: DueBlock | null;
  net: NetBlock | null;
  doneMap: DoneMap;
  mine: Mine; // the categories and budgets set in the app
  recurring: Recurring; // payments that repeat every month, removed ones included
  addRecurring: (i: RecurInput) => Promise<string | null>; // null when it worked, else what to tell the person
  editRecurring: (id: string, i: RecurInput) => Promise<string | null>;
  removeRecurring: (id: string) => Promise<void>;
  logRecurring: (id: string, how: 'log' | 'skip') => Promise<void>;
  categories: CategoryInfo[]; // everything that can be picked: built-in, own and the imported plan's, merged
  sync: SyncState;
  syncEnabled: boolean;
  toastMsg: string | null;
  toast: (msg: string) => void;
  addEntry: (input: NewEntryInput) => Promise<string>; // the new payment's id
  updateEntry: (id: string, changes: Partial<NewEntryInput>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  markExported: (ids: string[]) => Promise<void>;
  applyPlan: (data: PlanData) => Promise<void>;
  applyDue: (data: DueData) => Promise<void>;
  applyNet: (data: NetData) => Promise<void>;
  toggleDone: (key: string, done: boolean) => Promise<void>;
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
  makeAdmin: (groupId: string, userId: string) => Promise<void>;
  setDisplayName: (groupId: string, name: string) => Promise<void>;
  restoreBackup: (b: Extract<BackupParse, { ok: true }>) => Promise<{ added: number; updated: number; blocksReplaced: number }>;
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

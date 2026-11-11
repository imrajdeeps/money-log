// What goes to the cloud and what is refused: the shape of each row sent, and which rows this phone may send. Pure.
import { isMine } from '../core/logic.ts';
import type { Entry } from '../core/logic.ts';
import type { Settlement } from '../core/groups.ts';
import type { Receipt } from '../core/receipts.ts';
import { SyncError } from './syncTypes.ts';

// What this phone may send: its own rows, and shared rows only for groups the account is still in (the database would
// refuse the rest, and refused rows would be retried for ever).
export const pushable = (e: { owner_id?: string | null; group_id: string | null }, uid: string | null, active: Set<string> | null): boolean =>
  isMine({ owner_id: e.owner_id ?? null }, uid) && (!e.group_id || active === null || active.has(e.group_id));

export const toRow = (e: Entry, uid: string) => ({
  id: e.id,
  owner_id: uid,
  entry_date: e.entry_date,
  // sent only for income: spending rows stay exactly as before, so a phone whose database has no `kind` column yet keeps syncing
  ...(e.kind === 'in' ? { kind: 'in' as const } : {}),
  category: e.category,
  amount: e.amount,
  note: e.note,
  method: e.method,
  created_at: e.created_at,
  updated_at: e.updated_at,
  deleted_at: e.deleted_at,
  exported_at: e.exported_at,
  group_id: e.group_id,
  paid_by: e.paid_by,
  shares: e.shares,
  share_of: e.share_of,
});

export const toSettlementRow = (x: Settlement, uid: string) => ({
  id: x.id,
  group_id: x.group_id,
  from_user: x.from_user,
  to_user: x.to_user,
  amount: x.amount,
  settle_date: x.settle_date,
  created_by: uid,
  created_at: x.created_at,
  updated_at: x.updated_at,
  deleted_at: x.deleted_at,
});

export const toReceiptRow = (r: Receipt, uid: string) => ({
  id: r.id,
  entry_id: r.entry_id,
  owner_id: uid,
  path: r.path,
  bytes: r.bytes,
  created_at: r.created_at,
  updated_at: r.updated_at,
  uploaded_at: r.uploaded_at,
  deleted_at: r.deleted_at,
  purged_at: r.purged_at,
});

// Statuses that mean "this data was refused", as opposed to "the server is having a bad moment".
export const isRefusal = (e: unknown): e is SyncError => e instanceof SyncError && e.kind === 'http' && [400, 403, 409, 413, 422].includes(e.status);

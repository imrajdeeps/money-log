// Pure helpers for receipt photos (Release 3): the record that describes a photo, limits, quota and image sizing. The
// photo itself is a file in a private Supabase Storage bucket; nothing here touches the DOM, storage or the network.
import { laterThan, newId, parseTs } from './logic.ts';

export const MAX_PHOTOS = 3; // per payment
export const MAX_ACCOUNT_PHOTOS = 300; // per account, whose file may still be stored (the database enforces the same)
export const MAX_BYTES = 1_048_576; // per photo, after shrinking (the bucket enforces the same limit)
export const MAX_SIDE = 1600; // longest side in pixels
export const FREE_STORAGE_BYTES = 1_000_000_000; // Supabase's free plan: "1 GB file storage"
export const WARN_AT = 0.8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Receipt {
  id: string;
  entry_id: string;
  owner_id: string;
  path: string; // <owner id>/<id>.jpg inside the "receipts" bucket
  bytes: number;
  created_at: string;
  updated_at: string;
  uploaded_at: string | null; // the file is in the cloud
  deleted_at: string | null; // the photo is gone (soft delete, so other phones learn of it)
  purged_at: string | null; // ...and its file has been removed from the cloud
  dirty: 0 | 1; // 1 = changed on this phone and not yet sent
}

export const receiptPath = (owner: string, id: string): string => `${owner}/${id}.jpg`;

export function makeReceipt(entryId: string, owner: string, bytes: number, nowIso: string): Receipt {
  const id = newId();
  return { id, entry_id: entryId, owner_id: owner, path: receiptPath(owner, id), bytes, created_at: nowIso, updated_at: nowIso, uploaded_at: null, deleted_at: null, purged_at: null, dirty: 1 };
}

// Strict check for a row that comes from the server.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanReceipt(r: any): Receipt | null {
  if (!r || typeof r.id !== 'string' || !UUID_RE.test(r.id) || typeof r.entry_id !== 'string' || !UUID_RE.test(r.entry_id) || typeof r.owner_id !== 'string' || !UUID_RE.test(r.owner_id)) return null;
  const id = r.id.toLowerCase();
  const owner = r.owner_id.toLowerCase();
  if (r.path !== receiptPath(owner, id)) return null;
  if (!Number.isInteger(r.bytes) || r.bytes < 1 || r.bytes > MAX_BYTES) return null;
  for (const k of ['created_at', 'updated_at']) if (!Number.isFinite(parseTs(r[k]))) return null;
  for (const k of ['uploaded_at', 'deleted_at', 'purged_at']) if (r[k] != null && !Number.isFinite(parseTs(r[k]))) return null;
  return {
    id, entry_id: r.entry_id.toLowerCase(), owner_id: owner, path: r.path, bytes: r.bytes,
    created_at: r.created_at, updated_at: r.updated_at,
    uploaded_at: r.uploaded_at ?? null, deleted_at: r.deleted_at ?? null, purged_at: r.purged_at ?? null,
    dirty: r.dirty ? 1 : 0,
  };
}

// Latest change wins, like payments: a server copy replaces ours only if it is newer.
export function mergeRemoteReceipt(local: Receipt | undefined, remote: Receipt): Receipt {
  if (!local) return { ...remote, dirty: 0 };
  return parseTs(remote.updated_at) > parseTs(local.updated_at) ? { ...remote, dirty: 0 } : local;
}

const touch = (r: Receipt, nowIso: string, patch: Partial<Receipt>): Receipt => ({ ...r, ...patch, updated_at: laterThan(r.updated_at, nowIso), dirty: 1 });
export const markUploaded = (r: Receipt, nowIso: string): Receipt => touch(r, nowIso, { uploaded_at: r.uploaded_at ?? nowIso });
export const markDeleted = (r: Receipt, nowIso: string): Receipt => (r.deleted_at ? r : touch(r, nowIso, { deleted_at: nowIso }));
export const markPurged = (r: Receipt, nowIso: string): Receipt => (r.purged_at ? r : touch(r, nowIso, { purged_at: nowIso }));

export const isLive = (r: Receipt): boolean => !r.deleted_at;

// How many more photos this account may add: its photos whose files may still be stored count, deleted ones too until removed.
export const photoRoom = (all: Receipt[], me: string | null): number => Math.max(0, MAX_ACCOUNT_PHOTOS - all.filter((r) => r.owner_id === me && !r.purged_at).length);
export const liveFor = (all: Receipt[], entryId: string): Receipt[] =>
  all.filter((r) => r.entry_id === entryId && isLive(r)).sort((a, b) => parseTs(a.created_at) - parseTs(b.created_at));

// Mine, still to be uploaded: not deleted and not yet in the cloud.
export const needsUpload = (r: Receipt, me: string | null): boolean => r.owner_id === me && !r.uploaded_at && !r.deleted_at && !r.purged_at;
// Mine, deleted, and its file (if it ever reached the cloud) not yet removed.
export const needsPurge = (r: Receipt, me: string | null): boolean => r.owner_id === me && Boolean(r.deleted_at) && !r.purged_at;

// Bytes that still count against the cloud allowance: every photo whose file may still be stored.
export function usedBytes(all: Receipt[]): number {
  return all.reduce((a, r) => (r.purged_at || (r.deleted_at && !r.uploaded_at) ? a : a + r.bytes), 0);
}

export type Quota = { level: 'ok' | 'warn' | 'full'; used: number; pct: number };
export function quota(used: number): Quota {
  const pct = Math.min(100, (used / FREE_STORAGE_BYTES) * 100);
  return { level: used >= FREE_STORAGE_BYTES ? 'full' : used >= FREE_STORAGE_BYTES * WARN_AT ? 'warn' : 'ok', used, pct };
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The size an image is drawn at: shrunk so its longest side is at most `max`, never enlarged, never zero.
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 1, height: 1 };
  const k = longest > max ? max / longest : 1;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

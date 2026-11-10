// The shapes and constants cloud sync shares: its state, its error, the signed-in session, its options.
import type { Store } from './store.ts';

export interface SyncConfig { supabaseUrl: string; supabaseKey: string }
export type SyncMode = 'local' | 'signedout' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncState {
  mode: SyncMode;
  pending: number; // changes on this phone not yet in the cloud
  lastSync: number | null;
  error: string | null;
  email: string | null;
}

export class SyncError extends Error {
  kind: 'offline' | 'signed-out' | 'http' | 'owner-mismatch';
  status: number;
  constructor(kind: SyncError['kind'], message: string, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface Session { access_token: string; refresh_token: string; expires_at: number; user_id: string; email: string }

export interface SyncOptions {
  store: Store;
  config: SyncConfig;
  fetchFn?: typeof fetch;
  now?: () => number;
  onDataChanged?: () => void;
}

export const PAGE = 1000;
export const PUSH_CHUNK = 200;
export const OVERLAP_MS = 5 * 60 * 1000; // re-read a little before the last cursor so a late-committing write is never missed

// Local storage on the phone: IndexedDB, with an in-memory fallback (also used by the tests).
import type { Settlement } from '../core/groups.ts';
import type { Entry } from '../core/logic.ts';
import type { Receipt } from '../core/receipts.ts';

export interface Store {
  readonly kind: 'indexeddb' | 'memory';
  allEntries(): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | undefined>;
  putEntries(list: Entry[]): Promise<void>;
  // Read, change and write entries in ONE transaction, so an edit made at the same moment is never overwritten by a
  // stale copy. fn returns the entry to store, or undefined to leave that entry alone.
  mutateEntries(ids: string[], fn: (current: Entry | undefined, id: string) => Entry | undefined): Promise<void>;
  deleteEntries(ids: string[]): Promise<void>;
  // Settlements (payments between group members) are kept the same way as entries.
  allSettlements(): Promise<Settlement[]>;
  putSettlements(list: Settlement[]): Promise<void>;
  mutateSettlements(ids: string[], fn: (current: Settlement | undefined, id: string) => Settlement | undefined): Promise<void>;
  deleteSettlements(ids: string[]): Promise<void>;
  // Receipt photos: the records (like entries), and the picture files themselves (this phone's own, and ones fetched to view).
  allReceipts(): Promise<Receipt[]>;
  putReceipts(list: Receipt[]): Promise<void>;
  mutateReceipts(ids: string[], fn: (current: Receipt | undefined, id: string) => Receipt | undefined): Promise<void>;
  deleteReceipts(ids: string[]): Promise<void>;
  getBlob(id: string): Promise<Blob | undefined>;
  putBlob(id: string, blob: Blob): Promise<void>;
  deleteBlobs(ids: string[]): Promise<void>;
  allBlobIds(): Promise<string[]>;
  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  delMeta(key: string): Promise<void>;
  // Read, change and write one meta value in ONE transaction. fn returns the value to store, or undefined to leave it.
  mutateMeta<T>(key: string, fn: (current: T | undefined) => T | undefined): Promise<void>;
  wipe(): Promise<void>;
}

export function memoryStore(): Store {
  const entries = new Map<string, Entry>();
  const settlements = new Map<string, Settlement>();
  const receipts = new Map<string, Receipt>();
  const blobs = new Map<string, Blob>();
  const meta = new Map<string, unknown>();
  return {
    kind: 'memory',
    async allEntries() { return [...entries.values()].map((e) => structuredClone(e)); },
    async getEntry(id) { const e = entries.get(id); return e ? structuredClone(e) : undefined; },
    async putEntries(list) { for (const e of list) entries.set(e.id, structuredClone(e)); },
    async mutateEntries(ids, fn) {
      for (const id of ids) {
        const cur = entries.get(id);
        const next = fn(cur ? structuredClone(cur) : undefined, id);
        if (next) entries.set(id, structuredClone(next));
      }
    },
    async deleteEntries(ids) { for (const id of ids) entries.delete(id); },
    async allSettlements() { return [...settlements.values()].map((x) => structuredClone(x)); },
    async putSettlements(list) { for (const x of list) settlements.set(x.id, structuredClone(x)); },
    async mutateSettlements(ids, fn) {
      for (const id of ids) {
        const cur = settlements.get(id);
        const next = fn(cur ? structuredClone(cur) : undefined, id);
        if (next) settlements.set(id, structuredClone(next));
      }
    },
    async deleteSettlements(ids) { for (const id of ids) settlements.delete(id); },
    async allReceipts() { return [...receipts.values()].map((x) => structuredClone(x)); },
    async putReceipts(list) { for (const x of list) receipts.set(x.id, structuredClone(x)); },
    async mutateReceipts(ids, fn) {
      for (const id of ids) {
        const cur = receipts.get(id);
        const next = fn(cur ? structuredClone(cur) : undefined, id);
        if (next) receipts.set(id, structuredClone(next));
      }
    },
    async deleteReceipts(ids) { for (const id of ids) receipts.delete(id); },
    async getBlob(id) { return blobs.get(id); },
    async putBlob(id, blob) { blobs.set(id, blob); },
    async deleteBlobs(ids) { for (const id of ids) blobs.delete(id); },
    async allBlobIds() { return [...blobs.keys()]; },
    async getMeta<T>(key: string) { return meta.has(key) ? (structuredClone(meta.get(key)) as T) : undefined; },
    async setMeta(key, value) { meta.set(key, structuredClone(value)); },
    async delMeta(key) { meta.delete(key); },
    async mutateMeta<T>(key: string, fn: (current: T | undefined) => T | undefined) {
      const next = fn(meta.has(key) ? (structuredClone(meta.get(key)) as T) : undefined);
      if (next !== undefined) meta.set(key, structuredClone(next));
    },
    async wipe() { entries.clear(); settlements.clear(); receipts.clear(); blobs.clear(); meta.clear(); },
  };
}

const DB_NAME = 'money-log';
const DB_VERSION = 3;

function wrap<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function idbStore(db: IDBDatabase): Store {
  return {
    kind: 'indexeddb',
    async allEntries() {
      return wrap(db.transaction('entries', 'readonly').objectStore('entries').getAll() as IDBRequest<Entry[]>);
    },
    async getEntry(id) {
      return wrap(db.transaction('entries', 'readonly').objectStore('entries').get(id) as IDBRequest<Entry | undefined>);
    },
    async putEntries(list) {
      if (!list.length) return;
      const tx = db.transaction('entries', 'readwrite');
      const os = tx.objectStore('entries');
      for (const e of list) os.put(e);
      await done(tx);
    },
    async mutateEntries(ids, fn) {
      if (!ids.length) return;
      const tx = db.transaction('entries', 'readwrite');
      const os = tx.objectStore('entries');
      for (const id of ids) {
        const get = os.get(id) as IDBRequest<Entry | undefined>;
        get.onsuccess = () => {
          const next = fn(get.result, id);
          if (next) os.put(next);
        };
      }
      await done(tx);
    },
    async deleteEntries(ids) {
      if (!ids.length) return;
      const tx = db.transaction('entries', 'readwrite');
      for (const id of ids) tx.objectStore('entries').delete(id);
      await done(tx);
    },
    async allSettlements() {
      return wrap(db.transaction('settlements', 'readonly').objectStore('settlements').getAll() as IDBRequest<Settlement[]>);
    },
    async putSettlements(list) {
      if (!list.length) return;
      const tx = db.transaction('settlements', 'readwrite');
      const os = tx.objectStore('settlements');
      for (const x of list) os.put(x);
      await done(tx);
    },
    async mutateSettlements(ids, fn) {
      if (!ids.length) return;
      const tx = db.transaction('settlements', 'readwrite');
      const os = tx.objectStore('settlements');
      for (const id of ids) {
        const get = os.get(id) as IDBRequest<Settlement | undefined>;
        get.onsuccess = () => {
          const next = fn(get.result, id);
          if (next) os.put(next);
        };
      }
      await done(tx);
    },
    async deleteSettlements(ids) {
      if (!ids.length) return;
      const tx = db.transaction('settlements', 'readwrite');
      for (const id of ids) tx.objectStore('settlements').delete(id);
      await done(tx);
    },
    async allReceipts() {
      return wrap(db.transaction('receipts', 'readonly').objectStore('receipts').getAll() as IDBRequest<Receipt[]>);
    },
    async putReceipts(list) {
      if (!list.length) return;
      const tx = db.transaction('receipts', 'readwrite');
      const os = tx.objectStore('receipts');
      for (const x of list) os.put(x);
      await done(tx);
    },
    async mutateReceipts(ids, fn) {
      if (!ids.length) return;
      const tx = db.transaction('receipts', 'readwrite');
      const os = tx.objectStore('receipts');
      for (const id of ids) {
        const get = os.get(id) as IDBRequest<Receipt | undefined>;
        get.onsuccess = () => {
          const next = fn(get.result, id);
          if (next) os.put(next);
        };
      }
      await done(tx);
    },
    async deleteReceipts(ids) {
      if (!ids.length) return;
      const tx = db.transaction('receipts', 'readwrite');
      for (const id of ids) tx.objectStore('receipts').delete(id);
      await done(tx);
    },
    async getBlob(id) {
      const row = (await wrap(db.transaction('blobs', 'readonly').objectStore('blobs').get(id))) as { id: string; blob: Blob } | undefined;
      return row?.blob;
    },
    async putBlob(id, blob) {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put({ id, blob });
      await done(tx);
    },
    async deleteBlobs(ids) {
      if (!ids.length) return;
      const tx = db.transaction('blobs', 'readwrite');
      for (const id of ids) tx.objectStore('blobs').delete(id);
      await done(tx);
    },
    async allBlobIds() {
      return (await wrap(db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys())) as string[];
    },
    async getMeta<T>(key: string) {
      const row = (await wrap(db.transaction('meta', 'readonly').objectStore('meta').get(key))) as { key: string; value: T } | undefined;
      return row?.value;
    },
    async setMeta(key, value) {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key, value });
      await done(tx);
    },
    async delMeta(key) {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').delete(key);
      await done(tx);
    },
    async mutateMeta<T>(key: string, fn: (current: T | undefined) => T | undefined) {
      const tx = db.transaction('meta', 'readwrite');
      const os = tx.objectStore('meta');
      const get = os.get(key) as IDBRequest<{ key: string; value: T } | undefined>;
      get.onsuccess = () => {
        const next = fn(get.result?.value);
        if (next !== undefined) os.put({ key, value: next });
      };
      await done(tx);
    },
    async wipe() {
      const tx = db.transaction(['entries', 'settlements', 'receipts', 'blobs', 'meta'], 'readwrite');
      tx.objectStore('entries').clear();
      tx.objectStore('settlements').clear();
      tx.objectStore('receipts').clear();
      tx.objectStore('blobs').clear();
      tx.objectStore('meta').clear();
      await done(tx);
    },
  };
}

// Opens IndexedDB; if the browser refuses (some private modes), falls back to memory so the app still runs.
export async function openStore(): Promise<Store> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        // Version 1 had entries and meta; version 2 added settlements; version 3 adds receipts and their picture files.
        const names = req.result.objectStoreNames;
        if (!names.contains('entries')) req.result.createObjectStore('entries', { keyPath: 'id' });
        if (!names.contains('meta')) req.result.createObjectStore('meta', { keyPath: 'key' });
        if (!names.contains('settlements')) req.result.createObjectStore('settlements', { keyPath: 'id' });
        if (!names.contains('receipts')) req.result.createObjectStore('receipts', { keyPath: 'id' });
        if (!names.contains('blobs')) req.result.createObjectStore('blobs', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is blocked by another tab.'));
    });
    return idbStore(db);
  } catch {
    return memoryStore();
  }
}

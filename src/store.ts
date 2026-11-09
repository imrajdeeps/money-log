// Local storage on the phone: IndexedDB, with an in-memory fallback (also used by the tests).
import type { Entry } from './logic.ts';

export interface Store {
  readonly kind: 'indexeddb' | 'memory';
  allEntries(): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | undefined>;
  putEntries(list: Entry[]): Promise<void>;
  // Read, change and write entries in ONE transaction, so an edit made at the same moment is never overwritten by a
  // stale copy. fn returns the entry to store, or undefined to leave that entry alone.
  mutateEntries(ids: string[], fn: (current: Entry | undefined, id: string) => Entry | undefined): Promise<void>;
  deleteEntries(ids: string[]): Promise<void>;
  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  delMeta(key: string): Promise<void>;
  wipe(): Promise<void>;
}

export function memoryStore(): Store {
  const entries = new Map<string, Entry>();
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
    async getMeta<T>(key: string) { return meta.has(key) ? (structuredClone(meta.get(key)) as T) : undefined; },
    async setMeta(key, value) { meta.set(key, structuredClone(value)); },
    async delMeta(key) { meta.delete(key); },
    async wipe() { entries.clear(); meta.clear(); },
  };
}

const DB_NAME = 'money-log';
const DB_VERSION = 1;

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
    async wipe() {
      const tx = db.transaction(['entries', 'meta'], 'readwrite');
      tx.objectStore('entries').clear();
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
        req.result.createObjectStore('entries', { keyPath: 'id' });
        req.result.createObjectStore('meta', { keyPath: 'key' });
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

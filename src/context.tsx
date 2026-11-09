import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { config } from './config.ts';
import { editEntry, makeEntry, markExportedEntry, parseTs, softDelete } from './logic.ts';
import type { Entry, NewEntryInput, Plan, PlanData } from './logic.ts';
import { openStore } from './store.ts';
import type { Store } from './store.ts';
import { createSync } from './sync.ts';
import type { Sync, SyncState } from './sync.ts';

interface Engine { store: Store; sync: Sync }

export interface AppApi {
  ready: boolean;
  storageKind: Store['kind'];
  entries: Entry[]; // not deleted
  allEntries: Entry[]; // including deleted ones, for backups
  plan: Plan | null;
  sync: SyncState;
  syncEnabled: boolean;
  toastMsg: string | null;
  toast: (msg: string) => void;
  addEntry: (input: NewEntryInput) => Promise<void>;
  updateEntry: (id: string, changes: Partial<NewEntryInput>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  markExported: (ids: string[]) => Promise<void>;
  applyPlan: (data: PlanData) => Promise<void>;
  restoreBackup: (entries: Entry[], plan: (PlanData & { importedAt: string }) | null) => Promise<{ added: number; updated: number; planReplaced: boolean }>;
  syncNow: () => void;
  requestCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  eraseAll: () => Promise<void>;
}

const syncEnabled = Boolean(config.supabaseUrl && config.supabaseKey);
const INITIAL: SyncState = { mode: syncEnabled ? 'signedout' : 'local', pending: 0, lastSync: null, error: null, email: null };

const Ctx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [eng, setEng] = useState<Engine | null>(null);
  const engRef = useRef<Engine | null>(null);
  const [all, setAll] = useState<Entry[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const syncTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    const e = engRef.current;
    if (!e) return;
    const [entries, p] = await Promise.all([e.store.allEntries(), e.store.getMeta<Plan>('plan')]);
    setAll(entries);
    setPlan(p ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = await openStore();
      const sync = createSync({ store, config, onDataChanged: () => { void reload(); } });
      await sync.init();
      if (cancelled) return;
      const e = { store, sync };
      engRef.current = e;
      await reload();
      setEng(e);
      setLoaded(true);
      void navigator.storage?.persist?.().catch(() => undefined); // ask the browser not to clear our data under storage pressure
      void sync.sync();
    })();
    return () => { cancelled = true; };
  }, [reload]);

  // Sync when the app comes back to the front and when the network returns.
  useEffect(() => {
    if (!eng) return;
    const go = () => { void eng.sync.sync(); };
    const onVisible = () => { if (document.visibilityState === 'visible') go(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', go);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', go);
    };
  }, [eng]);

  const subscribe = useMemo(() => (cb: () => void) => (eng ? eng.sync.subscribe(cb) : () => undefined), [eng]);
  const getSnapshot = useMemo(() => () => (eng ? eng.sync.getState() : INITIAL), [eng]);
  const sync = useSyncExternalStore(subscribe, getSnapshot);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const scheduleSync = useCallback(() => {
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => { void engRef.current?.sync.sync(); }, 800);
  }, []);

  const afterChange = useCallback(async () => {
    await engRef.current?.sync.refreshPending();
    await reload();
    scheduleSync();
  }, [reload, scheduleSync]);

  const addEntry = useCallback(async (input: NewEntryInput) => {
    const e = engRef.current;
    if (!e) return;
    await e.store.putEntries([makeEntry(input, new Date().toISOString())]);
    await afterChange();
  }, [afterChange]);

  // Each change reads and writes inside one storage transaction, so a sync running at the same moment cannot
  // overwrite it with an older copy.
  const updateEntry = useCallback(async (id: string, changes: Partial<NewEntryInput>) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateEntries([id], (cur) => (cur ? editEntry(cur, changes, nowIso) : undefined));
    await afterChange();
  }, [afterChange]);

  const removeEntry = useCallback(async (id: string) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateEntries([id], (cur) => (cur ? softDelete(cur, nowIso) : undefined));
    await afterChange();
  }, [afterChange]);

  const markExported = useCallback(async (ids: string[]) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateEntries(ids, (cur) => (cur ? markExportedEntry(cur, nowIso) : undefined));
    await afterChange();
  }, [afterChange]);

  const applyPlan = useCallback(async (data: PlanData) => {
    const e = engRef.current;
    if (!e) return;
    const p: Plan = { ...data, importedAt: new Date().toISOString(), dirty: 1 };
    await e.store.setMeta('plan', p);
    await afterChange();
  }, [afterChange]);

  const restoreBackup = useCallback(async (entries: Entry[], backupPlan: (PlanData & { importedAt: string }) | null) => {
    const e = engRef.current;
    if (!e) return { added: 0, updated: 0, planReplaced: false };
    let added = 0;
    let updated = 0;
    const byId = new Map(entries.map((b) => [b.id, b]));
    await e.store.mutateEntries([...byId.keys()], (cur, id) => {
      const b = byId.get(id)!;
      if (!cur) { added++; return { ...b, dirty: 1 }; }
      if (parseTs(b.updated_at) > parseTs(cur.updated_at)) { updated++; return { ...b, dirty: 1 }; }
      return undefined;
    });
    let planReplaced = false;
    if (backupPlan) {
      const local = await e.store.getMeta<Plan>('plan');
      if (!local || parseTs(backupPlan.importedAt) > parseTs(local.importedAt)) {
        await e.store.setMeta('plan', { ...backupPlan, dirty: 1 } satisfies Plan);
        planReplaced = true;
      }
    }
    await afterChange();
    return { added, updated, planReplaced };
  }, [afterChange]);

  const syncNow = useCallback(() => { void engRef.current?.sync.sync(); }, []);
  const requestCode = useCallback(async (email: string) => { await engRef.current?.sync.requestCode(email); }, []);
  const verifyCode = useCallback(async (email: string, code: string) => {
    await engRef.current?.sync.verifyCode(email, code);
    void engRef.current?.sync.sync();
  }, []);
  const signOut = useCallback(async () => { await engRef.current?.sync.signOut(); }, []);
  const eraseAll = useCallback(async () => {
    await engRef.current?.sync.eraseAll();
    await reload();
  }, [reload]);

  const value = useMemo<AppApi>(() => ({
    ready: loaded,
    storageKind: eng?.store.kind ?? 'memory',
    entries: all.filter((e) => !e.deleted_at),
    allEntries: all,
    plan,
    sync,
    syncEnabled,
    toastMsg,
    toast,
    addEntry, updateEntry, removeEntry, markExported, applyPlan, restoreBackup,
    syncNow, requestCode, verifyCode, signOut, eraseAll,
  }), [loaded, eng, all, plan, sync, toastMsg, toast, addEntry, updateEntry, removeEntry, markExported, applyPlan, restoreBackup, syncNow, requestCode, verifyCode, signOut, eraseAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

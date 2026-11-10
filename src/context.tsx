import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { cleanDoneMap, mergeDone, pruneDone, setDone } from './blocks.ts';
import type { DoneMap, DueBlock, DueData, NetBlock, NetData } from './blocks.ts';
import type { BackupParse } from './backup.ts';
import { config } from './config.ts';
import { joinCodeFromHash, makeSettlement, softDeleteSettlement } from './groups.ts';
import type { Group, Invite, Member, NewSettlementInput, Settlement } from './groups.ts';
import { editEntry, isMine, makeEntry, markExportedEntry, parseTs, softDelete } from './logic.ts';
import type { Entry, NewEntryInput, Plan, PlanData } from './logic.ts';
import { openStore } from './store.ts';
import type { Store } from './store.ts';
import { createSync } from './sync.ts';
import type { DueDone, Sync, SyncState } from './sync.ts';

interface Engine { store: Store; sync: Sync }

export interface AppApi {
  ready: boolean;
  storageKind: Store['kind'];
  me: string | null; // this phone's account id once it has signed in
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
  sync: SyncState;
  syncEnabled: boolean;
  toastMsg: string | null;
  toast: (msg: string) => void;
  addEntry: (input: NewEntryInput) => Promise<void>;
  updateEntry: (id: string, changes: Partial<NewEntryInput>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  markExported: (ids: string[]) => Promise<void>;
  applyPlan: (data: PlanData) => Promise<void>;
  applyDue: (data: DueData) => Promise<void>;
  applyNet: (data: NetData) => Promise<void>;
  toggleDone: (key: string, done: boolean) => Promise<void>;
  addSettlement: (input: NewSettlementInput) => Promise<void>;
  removeSettlement: (id: string) => Promise<void>;
  createGroup: (name: string, kind: 'family' | 'trip', displayName: string) => Promise<string>;
  joinGroup: (code: string, displayName: string) => Promise<string>;
  resetInvite: (groupId: string) => Promise<string>;
  leaveGroup: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  makeAdmin: (groupId: string, userId: string) => Promise<void>;
  setDisplayName: (groupId: string, name: string) => Promise<void>;
  restoreBackup: (b: Extract<BackupParse, { ok: true }>) => Promise<{ added: number; updated: number; blocksReplaced: number }>;
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
  const [due, setDue] = useState<DueBlock | null>(null);
  const [net, setNet] = useState<NetBlock | null>(null);
  const [doneMap, setDoneMap] = useState<DoneMap>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(() => joinCodeFromHash(window.location.hash));
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const syncTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    const e = engRef.current;
    if (!e) return;
    const [entries, p, d, n, dd, g, m, i, st, owner] = await Promise.all([
      e.store.allEntries(),
      e.store.getMeta<Plan>('plan'),
      e.store.getMeta<DueBlock>('block:due'),
      e.store.getMeta<NetBlock>('block:networth'),
      e.store.getMeta<DueDone>('dueDone'),
      e.store.getMeta<Group[]>('groups'),
      e.store.getMeta<Member[]>('members'),
      e.store.getMeta<Invite[]>('invites'),
      e.store.allSettlements(),
      e.store.getMeta<string>('localOwner'),
    ]);
    setAll(entries);
    setGroups(g ?? []);
    setMembers(m ?? []);
    setInvites(i ?? []);
    setSettlements(st);
    setMe(owner ?? null);
    setPlan(p ?? null);
    setDue(d ?? null);
    setNet(n ?? null);
    setDoneMap(dd?.items ?? {});
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

  // A join link opened while the app is already running.
  useEffect(() => {
    const onHash = () => { const c = joinCodeFromHash(window.location.hash); if (c) setJoinCode(c); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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

  const addSettlement = useCallback(async (input: NewSettlementInput) => {
    const e = engRef.current;
    const owner = await e?.store.getMeta<string>('localOwner');
    if (!e || !owner) return;
    await e.store.putSettlements([makeSettlement(input, owner, new Date().toISOString())]);
    await afterChange();
  }, [afterChange]);

  const removeSettlement = useCallback(async (id: string) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateSettlements([id], (cur) => (cur ? softDeleteSettlement(cur, nowIso) : undefined));
    await afterChange();
  }, [afterChange]);

  const clearJoinCode = useCallback(() => {
    setJoinCode(null);
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* the address bar is only cosmetic */ }
  }, []);

  const engine = () => { const e = engRef.current; if (!e) throw new Error('The app is still starting.'); return e.sync; };
  const createGroup = useCallback((name: string, kind: 'family' | 'trip', displayName: string) => engine().createGroup(name, kind, displayName), []);
  const joinGroup = useCallback(async (code: string, displayName: string) => { const id = await engine().joinGroup(code, displayName); clearJoinCode(); return id; }, [clearJoinCode]);
  const resetInvite = useCallback((groupId: string) => engine().resetInvite(groupId), []);
  const leaveGroup = useCallback(async (groupId: string) => { await engine().leaveGroup(groupId); }, []);
  const removeMember = useCallback(async (groupId: string, userId: string) => { await engine().removeMember(groupId, userId); }, []);
  const makeAdmin = useCallback(async (groupId: string, userId: string) => { await engine().makeAdmin(groupId, userId); }, []);
  const setDisplayName = useCallback(async (groupId: string, name: string) => { await engine().setDisplayName(groupId, name); }, []);

  const applyDue = useCallback(async (data: DueData) => {
    const e = engRef.current;
    if (!e) return;
    const importedAt = new Date().toISOString();
    await e.store.setMeta('block:due', { ...data, importedAt, dirty: 1 } satisfies DueBlock);
    // Marks for items that are no longer on the list are dropped; the rest carry over to the new import.
    await e.store.mutateMeta<DueDone>('dueDone', (cur) => (cur ? { items: pruneDone(cur.items, data.items), dirty: 1 } : undefined));
    await afterChange();
  }, [afterChange]);

  const applyNet = useCallback(async (data: NetData) => {
    const e = engRef.current;
    if (!e) return;
    await e.store.setMeta('block:networth', { ...data, importedAt: new Date().toISOString(), dirty: 1 } satisfies NetBlock);
    await afterChange();
  }, [afterChange]);

  const toggleDone = useCallback(async (key: string, done: boolean) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateMeta<DueDone>('dueDone', (cur) => ({ items: setDone(cur?.items ?? {}, key, done, nowIso), dirty: 1 }));
    await afterChange();
  }, [afterChange]);

  const restoreBackup = useCallback(async (b: Extract<BackupParse, { ok: true }>) => {
    const e = engRef.current;
    if (!e) return { added: 0, updated: 0, blocksReplaced: 0 };
    let added = 0;
    let updated = 0;
    const byId = new Map(b.entries.map((x) => [x.id, x]));
    await e.store.mutateEntries([...byId.keys()], (cur, id) => {
      const x = byId.get(id)!;
      if (!cur) { added++; return { ...x, dirty: 1 }; }
      if (parseTs(x.updated_at) > parseTs(cur.updated_at)) { updated++; return { ...x, dirty: 1 }; }
      return undefined;
    });
    // Each block is replaced only if the backup's copy was imported later than the one here.
    let blocksReplaced = 0;
    const newer = async <T extends { importedAt: string }>(key: string, from: (Omit<T, 'dirty'>) | null) => {
      if (!from) return;
      await e.store.mutateMeta<T>(key, (cur) => {
        if (cur && parseTs(from.importedAt) <= parseTs(cur.importedAt)) return undefined;
        blocksReplaced++;
        return { ...from, dirty: 1 } as unknown as T;
      });
    };
    await newer<Plan>('plan', b.plan);
    await newer<DueBlock>('block:due', b.due);
    await newer<NetBlock>('block:networth', b.networth);
    if (Object.keys(b.dueDone).length) {
      await e.store.mutateMeta<DueDone>('dueDone', (cur) => ({ items: mergeDone(cur?.items ?? {}, cleanDoneMap(b.dueDone)), dirty: 1 }));
    }
    await afterChange();
    return { added, updated, blocksReplaced };
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

  const own = useMemo(() => all.filter((e) => isMine(e, me)), [all, me]);
  const value = useMemo<AppApi>(() => ({
    ready: loaded,
    storageKind: eng?.store.kind ?? 'memory',
    me,
    entries: own.filter((e) => !e.deleted_at),
    allEntries: own,
    groupEntries: all.filter((e) => e.group_id && !e.deleted_at),
    groups, members, invites, settlements, joinCode, clearJoinCode,
    plan, due, net, doneMap,
    sync,
    syncEnabled,
    toastMsg,
    toast,
    addEntry, updateEntry, removeEntry, markExported, applyPlan, applyDue, applyNet, toggleDone, restoreBackup,
    addSettlement, removeSettlement, createGroup, joinGroup, resetInvite, leaveGroup, removeMember, makeAdmin, setDisplayName,
    syncNow, requestCode, verifyCode, signOut, eraseAll,
  }), [loaded, eng, all, own, me, groups, members, invites, settlements, joinCode, clearJoinCode, plan, due, net, doneMap, sync, toastMsg, toast, addEntry, updateEntry, removeEntry, markExported, applyPlan, applyDue, applyNet, toggleDone, restoreBackup, addSettlement, removeSettlement, createGroup, joinGroup, resetInvite, leaveGroup, removeMember, makeAdmin, setDisplayName, syncNow, requestCode, verifyCode, signOut, eraseAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

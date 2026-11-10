import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { cleanDoneMap, mergeDone, pruneDone, setDone } from './blocks.ts';
import type { DoneMap, DueBlock, DueData, NetBlock, NetData } from './blocks.ts';
import type { BackupParse } from './backup.ts';
import { addCategory as addCategoryTo, categoryList, mergeMine, removeCategory as removeCategoryFrom, setBudget } from './categories.ts';
import type { AddResult, CategoryInfo, Mine } from './categories.ts';
import { config } from './config.ts';
import type { HistoryRow } from './history.ts';
import { checkPin, cleanLock, makeLock, registerFailure, secondsToWait, shouldLock } from './lock.ts';
import type { LockConfig, LockTries } from './lock.ts';
import { MAX_ACCOUNT_PHOTOS, MAX_PHOTOS, liveFor, makeReceipt, markDeleted, photoRoom } from './receipts.ts';
import type { Receipt } from './receipts.ts';
import { joinCodeFromHash, makeSettlement, softDeleteSettlement } from './groups.ts';
import type { Group, Invite, Member, NewSettlementInput, Settlement } from './groups.ts';
import { editEntry, isMine, makeEntry, markExportedEntry, parseTs, softDelete } from './logic.ts';
import type { Entry, Group as Cat, NewEntryInput, Plan, PlanData } from './logic.ts';
import { openStore } from './store.ts';
import type { Store } from './store.ts';
import { createSync } from './sync.ts';
import type { DueDone, MineBlock, Sync, SyncState } from './sync.ts';

interface Engine { store: Store; sync: Sync }

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
  createGroup: (name: string, kind: 'family' | 'trip', displayName: string) => Promise<string>;
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
  changePassword: (password: string) => Promise<void>;
  signOutOthers: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
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
  const [mine, setMine] = useState<Mine>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [lockCfg, setLockCfg] = useState<LockConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const lockRef = useRef<LockConfig | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(() => joinCodeFromHash(window.location.hash));
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const syncTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    const e = engRef.current;
    if (!e) return;
    const [entries, p, d, n, dd, mn, g, m, i, st, owner, rc, lk] = await Promise.all([
      e.store.allEntries(),
      e.store.getMeta<Plan>('plan'),
      e.store.getMeta<DueBlock>('block:due'),
      e.store.getMeta<NetBlock>('block:networth'),
      e.store.getMeta<DueDone>('dueDone'),
      e.store.getMeta<MineBlock>('mine'),
      e.store.getMeta<Group[]>('groups'),
      e.store.getMeta<Member[]>('members'),
      e.store.getMeta<Invite[]>('invites'),
      e.store.allSettlements(),
      e.store.getMeta<string>('localOwner'),
      e.store.allReceipts(),
      e.store.getMeta<unknown>('lock'),
    ]);
    const cfg = cleanLock(lk);
    lockRef.current = cfg;
    setLockCfg(cfg);
    setReceipts(rc);
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
    setMine(mn?.items ?? {});
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
      if (lockRef.current) setLocked(true); // a PIN is set: the app starts covered
      setEng(e);
      setLoaded(true);
      void navigator.storage?.persist?.().catch(() => undefined); // ask the browser not to clear our data under storage pressure
      void sync.sync();
    })();
    return () => { cancelled = true; };
  }, [reload]);

  // Cover the app again when it was away for the chosen time.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else {
        if (shouldLock(lockRef.current, hiddenAt.current, Date.now())) setLocked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

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

  const addEntry = useCallback(async (input: NewEntryInput): Promise<string> => {
    const e = engRef.current;
    if (!e) return '';
    const entry = makeEntry(input, new Date().toISOString());
    await e.store.putEntries([entry]);
    await afterChange();
    return entry.id;
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
    // deleting a payment deletes its photos (their files are removed from the cloud on the next sync)
    const photos = (await e.store.allReceipts()).filter((r) => r.entry_id === id && !r.deleted_at).map((r) => r.id);
    await e.store.mutateReceipts(photos, (cur) => (cur ? markDeleted(cur, nowIso) : undefined));
    await e.store.deleteBlobs(photos);
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

  const addReceipts = useCallback(async (entryId: string, pictures: Blob[]) => {
    const e = engRef.current;
    const owner = await e?.store.getMeta<string>('localOwner');
    if (!e) return;
    if (!owner) throw new Error('Sign in to attach receipt photos.');
    const all = await e.store.allReceipts();
    if (liveFor(all, entryId).length + pictures.length > MAX_PHOTOS) throw new Error(`A payment can carry ${MAX_PHOTOS} photos.`);
    if (pictures.length > photoRoom(all, owner)) throw new Error(`An account can keep ${MAX_ACCOUNT_PHOTOS} photos. Delete some old ones to add more.`);
    const nowIso = new Date().toISOString();
    for (const blob of pictures) {
      const r = makeReceipt(entryId, owner, blob.size, nowIso);
      await e.store.putBlob(r.id, blob);
      await e.store.putReceipts([r]);
    }
    await afterChange();
  }, [afterChange]);

  const removeReceipt = useCallback(async (id: string) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateReceipts([id], (cur) => (cur ? markDeleted(cur, nowIso) : undefined));
    await e.store.deleteBlobs([id]);
    await afterChange();
  }, [afterChange]);

  const receiptBlob = useCallback((r: Receipt) => engine().receiptBlob(r), []);
  const fetchHistory = useCallback((entryId: string) => engine().fetchHistory(entryId), []);

  const setPin = useCallback(async (pin: string, timeoutSec: number) => {
    const e = engRef.current;
    if (!e) return;
    await e.store.setMeta('lock', await makeLock(pin, timeoutSec));
    await e.store.setMeta('lockTries', { fails: 0, until: 0 } satisfies LockTries);
    await reload();
  }, [reload]);

  // The PIN is checked the same careful way as at the lock screen: after several wrong tries it makes you wait.
  const checkCurrent = useCallback(async (pin: string): Promise<string | null> => {
    const e = engRef.current;
    const cfg = lockRef.current;
    if (!e || !cfg) return 'No PIN is set.';
    const tries = (await e.store.getMeta<LockTries>('lockTries')) ?? { fails: 0, until: 0 };
    const wait = secondsToWait(tries, Date.now());
    if (wait > 0) return `Too many wrong tries. Wait ${wait} seconds.`;
    if (await checkPin(cfg, pin)) { await e.store.setMeta('lockTries', { fails: 0, until: 0 }); return null; }
    await e.store.setMeta('lockTries', registerFailure(tries, Date.now()));
    return 'That PIN is not right.';
  }, []);

  const updateLock = useCallback(async (currentPin: string, change: 'remove' | { pin?: string; timeoutSec?: number }): Promise<string | null> => {
    const e = engRef.current;
    const cfg = lockRef.current;
    if (!e || !cfg) return 'No PIN is set.';
    const bad = await checkCurrent(currentPin);
    if (bad) return bad;
    if (change === 'remove') await e.store.delMeta('lock');
    else await e.store.setMeta('lock', change.pin ? await makeLock(change.pin, change.timeoutSec ?? cfg.timeoutSec) : { ...cfg, timeoutSec: change.timeoutSec ?? cfg.timeoutSec });
    await reload();
    return null;
  }, [checkCurrent, reload]);

  const unlock = useCallback(async (pin: string): Promise<{ ok: true } | { ok: false; waitSec: number }> => {
    const e = engRef.current;
    if (!e) return { ok: false, waitSec: 0 };
    const tries = (await e.store.getMeta<LockTries>('lockTries')) ?? { fails: 0, until: 0 };
    const wait = secondsToWait(tries, Date.now());
    if (wait > 0) return { ok: false, waitSec: wait };
    const cfg = lockRef.current;
    if (!cfg || (await checkPin(cfg, pin))) {
      await e.store.setMeta('lockTries', { fails: 0, until: 0 });
      setLocked(false);
      return { ok: true };
    }
    const next = registerFailure(tries, Date.now());
    await e.store.setMeta('lockTries', next);
    return { ok: false, waitSec: secondsToWait(next, Date.now()) };
  }, []);

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

  // Changes to the categories and budgets are read-modify-write on the stored map, so two quick taps never lose one.
  const changeMine = useCallback(async (f: (m: Mine, list: CategoryInfo[], nowIso: string) => Mine) => {
    const e = engRef.current;
    if (!e) return;
    const plan = (await e.store.getMeta<Plan>('plan')) ?? null;
    const nowIso = new Date().toISOString();
    await e.store.mutateMeta<MineBlock>('mine', (cur) => {
      const before = cur?.items ?? {};
      const next = f(before, categoryList(plan, before), nowIso);
      return next === before ? undefined : { items: next, dirty: 1 };
    });
    await afterChange();
  }, [afterChange]);

  const addCategory = useCallback(async (name: string, group: Cat): Promise<AddResult> => {
    let result: AddResult = { ok: false, error: 'The app is still starting.' };
    await changeMine((m, list, nowIso) => {
      result = addCategoryTo(m, list, name, group, nowIso);
      return result.ok ? result.mine : m;
    });
    return result;
  }, [changeMine]);

  const removeCategory = useCallback((name: string) => changeMine((m, list, nowIso) => {
    const info = list.find((c) => c.name === name && c.source !== 'plan');
    return info ? removeCategoryFrom(m, info, nowIso) : m;
  }), [changeMine]);

  const saveBudgets = useCallback((budgets: { name: string; amount: number }[]) => changeMine((m, list, nowIso) => {
    let next = m;
    for (const b of budgets) {
      const info = list.find((c) => c.name === b.name);
      if (info) next = setBudget(next, info, b.amount, nowIso);
    }
    return next;
  }), [changeMine]);

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
    if (Object.keys(b.categories).length) {
      await e.store.mutateMeta<MineBlock>('mine', (cur) => ({ items: mergeMine(cur?.items ?? {}, b.categories), dirty: 1 }));
    }
    await afterChange();
    return { added, updated, blocksReplaced };
  }, [afterChange]);

  const syncNow = useCallback(() => { void engRef.current?.sync.sync(); }, []);
  const signUp = useCallback(async (email: string, password: string) => {
    const r = await engine().signUp(email, password);
    if (r === 'signed-in') void engRef.current?.sync.sync();
    return r;
  }, []);
  const signInWithPassword = useCallback(async (email: string, password: string) => {
    await engine().signInWithPassword(email, password);
    void engRef.current?.sync.sync();
  }, []);
  const changePassword = useCallback((password: string) => engine().changePassword(password), []);
  const signOutOthers = useCallback(() => engine().signOutOthers(), []);
  const signOutEverywhere = useCallback(() => engine().signOutEverywhere(), []);
  const signOut = useCallback(async () => { await engRef.current?.sync.signOut(); }, []);
  const eraseAll = useCallback(async () => {
    await engRef.current?.sync.eraseAll();
    await reload();
    setLocked(false); // everything, the PIN included, is gone
  }, [reload]);

  const own = useMemo(() => all.filter((e) => isMine(e, me)), [all, me]);
  const categories = useMemo(() => categoryList(plan, mine), [plan, mine]);
  const value = useMemo<AppApi>(() => ({
    ready: loaded,
    storageKind: eng?.store.kind ?? 'memory',
    me, receipts, lock: lockCfg, locked, unlock, setPin, updateLock,
    addReceipts, removeReceipt, receiptBlob, fetchHistory,
    entries: own.filter((e) => !e.deleted_at),
    allEntries: own,
    groupEntries: all.filter((e) => e.group_id && !e.deleted_at),
    groups, members, invites, settlements, joinCode, clearJoinCode,
    plan, due, net, doneMap, mine, categories,
    sync,
    syncEnabled,
    toastMsg,
    toast,
    addEntry, updateEntry, removeEntry, markExported, applyPlan, applyDue, applyNet, toggleDone, restoreBackup, addCategory, removeCategory, saveBudgets,
    addSettlement, removeSettlement, createGroup, joinGroup, resetInvite, leaveGroup, removeMember, makeAdmin, setDisplayName,
    syncNow, signUp, signInWithPassword, changePassword, signOutOthers, signOutEverywhere, signOut, eraseAll,
  }), [loaded, eng, all, own, me, receipts, lockCfg, locked, unlock, setPin, updateLock, addReceipts, removeReceipt, receiptBlob, fetchHistory, groups, members, invites, settlements, joinCode, clearJoinCode, plan, due, net, doneMap, mine, categories, sync, toastMsg, toast, addEntry, updateEntry, removeEntry, markExported, applyPlan, applyDue, applyNet, toggleDone, restoreBackup, addCategory, removeCategory, saveBudgets, addSettlement, removeSettlement, createGroup, joinGroup, resetInvite, leaveGroup, removeMember, makeAdmin, setDisplayName, syncNow, signUp, signInWithPassword, changePassword, signOutOthers, signOutEverywhere, signOut, eraseAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

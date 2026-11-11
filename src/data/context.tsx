import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { DueItem } from '../core/blocks.ts';
import { addDueItem, dueItemsOf, editDueItem, migrateDue, removeDueItem, setDueItemDone } from '../core/dueItems.ts';
import type { DueInput } from '../core/dueItems.ts';
import { parseAuthHash } from './authlink.ts';
import type { AuthLink } from './authlink.ts';
import type { BackupParse } from './backup.ts';
import { addCategory as addCategoryTo, categoryList, mergeMine, migratePlan, removeCategory as removeCategoryFrom, setBudget } from '../core/categories.ts';
import type { AddResult, CategoryInfo, Mine } from '../core/categories.ts';
import { config } from './config.ts';
import { checkPin, cleanLock, coverAtStart, makeLock, registerFailure, secondsToWait, shouldLock } from './lock.ts';
import { clearLastActive, loadLastActive, saveLastActive } from './lockSeen.ts';
import type { LockConfig, LockTries } from './lock.ts';
import { MAX_ACCOUNT_PHOTOS, MAX_PHOTOS, liveFor, makeReceipt, markDeleted, photoRoom } from '../core/receipts.ts';
import type { Receipt } from '../core/receipts.ts';
import { joinCodeFromHash, makeSettlement, softDeleteSettlement } from '../core/groups.ts';
import type { Group, Invite, Member, NewSettlementInput, Settlement, UsualSplit } from '../core/groups.ts';
import type { GroupKind } from '../core/groupKinds.ts';
import { editEntry, isMine, isoDate, makeEntry, monthOf, parseTs, restoreEntry, softDelete } from '../core/logic.ts';
import type { Entry, Group as Cat, NewEntryInput } from '../core/logic.ts';
import { openStore } from './store.ts';
import { BASEPATH, appRootUrl } from '../core/paths.ts';
import { addRecurring as addRecurringTo, editRecurring as editRecurringIn, markHandled, mergeRecurring, removeRecurring as removeRecurringFrom, scheduledDate } from '../core/recurring.ts';
import type { RecurInput, Recurring } from '../core/recurring.ts';
import { addGoal as addGoalTo, addNetUpdate as addNetUpdateTo, addTopUp as addTopUpTo, editGoal as editGoalIn, mergeGoals, removeGoal as removeGoalFrom, removeNetUpdate as removeNetUpdateFrom, removeTopUp as removeTopUpFrom } from '../core/goals.ts';
import type { GoalInput, Goals } from '../core/goals.ts';
import { createSync } from './sync.ts';
import type { GoalsBlock, MineBlock, ProfileBlock, RecurBlock, Sync, SyncState } from './sync.ts';
import { migrateLegacy } from './legacy.ts';
import type { AppApi, Engine, ToastAction } from './appApi.ts';
import { clearProfile, loadProfile, setLocalProfile, setProfileSaveListener } from './profile.ts';
import { clearSent } from './calendar.ts';
import { tr } from '../core/i18n.ts';
export type { AppApi } from './appApi.ts';

// A link from a Supabase email brings its answer in the address bar. Read it once, when the page loads, and take it out of
// the address at once so the tokens are not left in the browser history or read again at the next start.
function takeAuthLink(): AuthLink | null {
  if (typeof window === 'undefined') return null;
  const link = parseAuthHash(window.location.hash);
  if (link) {
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* the address bar is only cosmetic */ }
  }
  return link;
}

const startupLink = takeAuthLink();

export const syncEnabled = Boolean(config.supabaseUrl && config.supabaseKey);

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
  const [mine, setMine] = useState<Mine>({});
  const [recurring, setRecurring] = useState<Recurring>({});
  const [goals, setGoals] = useState<Goals>({});
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
  const [recovering, setRecovering] = useState(false);
  const [authNotice, setAuthNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const linkHandled = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const syncTimer = useRef<number | undefined>(undefined);

  // The profile shown on screen (localStorage) and its copy that syncs (the store) are kept the same: a copy that arrived from the
  // account is shown; a profile saved before it had a copy is given one, to go up on the next sync.
  const reconcileProfile = useCallback(async (store: Engine['store']) => {
    const copy = await store.getMeta<ProfileBlock>('profile');
    const shown = loadProfile();
    if (copy) {
      if (copy.name !== shown.name || copy.whatsapp !== shown.whatsapp) setLocalProfile({ name: copy.name, whatsapp: copy.whatsapp });
    } else if (shown.name || shown.whatsapp) {
      await store.setMeta('profile', { ...shown, t: new Date().toISOString(), dirty: 1 } satisfies ProfileBlock);
    }
  }, []);

  const reload = useCallback(async () => {
    const e = engRef.current;
    if (!e) return;
    const [entries, mn, rcr, gl, g, m, i, st, owner, rc, lk] = await Promise.all([
      e.store.allEntries(),
      e.store.getMeta<MineBlock>('mine'),
      e.store.getMeta<RecurBlock>('recurring'),
      e.store.getMeta<GoalsBlock>('goals'),
      e.store.getMeta<Group[]>('groups'),
      e.store.getMeta<Member[]>('members'),
      e.store.getMeta<Invite[]>('invites'),
      e.store.allSettlements(),
      e.store.getMeta<string>('localOwner'),
      e.store.allReceipts(),
      e.store.getMeta<unknown>('lock'),
    ]);
    await reconcileProfile(e.store);
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
    setMine(mn?.items ?? {});
    setRecurring(rcr?.items ?? {});
    setGoals(gl?.items ?? {});
  }, [reconcileProfile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = await openStore();
      const sync = createSync({ store, config, onDataChanged: () => { void reload(); } });
      await sync.init();
      if (cancelled) return;
      const e = { store, sync };
      engRef.current = e;
      await migrateLegacy(store, isoDate()).catch(() => undefined); // an old imported plan or due list becomes the app's own, once
      await reload();
      if (lockRef.current) setLocked(coverAtStart(lockRef.current, loadLastActive(), Date.now())); // a PIN is set: the app starts covered, unless it was in use a moment ago
      setEng(e);
      setLoaded(true);
      void navigator.storage?.persist?.().catch(() => undefined); // ask the browser not to clear our data under storage pressure
      void sync.sync();
    })();
    return () => { cancelled = true; };
  }, [reload]);

  // A link from one of Supabase's emails: the reset link, or a link that failed. Used when the page opens with one, and when one
  // is opened in a tab where the app is already running (then only the # part of the address changes and nothing reloads).
  const handleAuthLink = useCallback(async (link: AuthLink) => {
    const e = engRef.current;
    if (!e) return;
    if (link.kind === 'recovery') {
      try {
        await e.sync.signInWithRecovery(link);
        setRecovering(true);
        setAuthNotice(null);
        void e.sync.sync();
      } catch (err) {
        setAuthNotice({ text: err instanceof Error ? err.message : String(err), bad: true });
      }
    } else if (link.kind === 'error') {
      setAuthNotice({ text: link.message, bad: true });
    } else {
      setAuthNotice({ text: tr('That link is not one this app uses. Sign in with your email and password.'), bad: true });
    }
  }, []);

  useEffect(() => {
    if (!eng || !startupLink || linkHandled.current) return;
    linkHandled.current = true;
    void handleAuthLink(startupLink);
  }, [eng, handleAuthLink]);

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

  // While the app is open and unlocked, note the time now and then (and when it is left), so a refresh within the chosen time
  // does not ask for the PIN again. The lock screen itself never counts as use.
  useEffect(() => {
    if (!lockCfg || locked) return undefined;
    const note = () => saveLastActive(Date.now());
    note();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') note(); }, 10_000);
    document.addEventListener('visibilitychange', note);
    window.addEventListener('pagehide', note);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', note);
      window.removeEventListener('pagehide', note);
    };
  }, [lockCfg, locked]);

  // A join link opened while the app is already running.
  useEffect(() => {
    const onHash = () => {
      const c = joinCodeFromHash(window.location.hash);
      if (c) setJoinCode(c);
      const link = takeAuthLink();
      if (link) void handleAuthLink(link);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [handleAuthLink]);

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

  // A message stays 3 seconds; one with a button (Undo) stays long enough to reach it.
  const toast = useCallback((msg: string, action?: ToastAction) => {
    setToastMsg(msg);
    setToastAction(action ?? null);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => { setToastMsg(null); setToastAction(null); }, action ? 8000 : 3200);
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

  // Saving the profile (on its own screen or when a group remembers the name) also keeps the copy that syncs.
  useEffect(() => setProfileSaveListener((p) => {
    const e = engRef.current;
    if (!e) return;
    void e.store.setMeta('profile', { name: p.name, whatsapp: p.whatsapp, t: new Date().toISOString(), dirty: 1 } satisfies ProfileBlock).then(afterChange);
  }), [afterChange]);

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

  const undoEntry = useCallback(async (before: Entry) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateEntries([before.id], (cur) => (cur ? restoreEntry(cur, before, nowIso) : undefined));
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

  const engine = () => { const e = engRef.current; if (!e) throw new Error(tr('The app is still starting.')); return e.sync; };
  const createGroup = useCallback((name: string, kind: GroupKind, displayName: string) => engine().createGroup(name, kind, displayName), []);
  const joinGroup = useCallback(async (code: string, displayName: string) => { const id = await engine().joinGroup(code, displayName); clearJoinCode(); return id; }, [clearJoinCode]);
  const resetInvite = useCallback((groupId: string) => engine().resetInvite(groupId), []);
  const leaveGroup = useCallback(async (groupId: string) => { await engine().leaveGroup(groupId); }, []);
  const removeMember = useCallback(async (groupId: string, userId: string) => { await engine().removeMember(groupId, userId); }, []);
  const makeAdmin = useCallback(async (groupId: string, userId: string) => { await engine().makeAdmin(groupId, userId); }, []);
  const setDisplayName = useCallback(async (groupId: string, name: string) => { await engine().setDisplayName(groupId, name); }, []);
  const setTripDates = useCallback(async (groupId: string, starts: string | null, ends: string | null) => { await engine().setTripDates(groupId, starts, ends); }, []);
  const setGroupClosed = useCallback(async (groupId: string, closed: boolean) => { await engine().setGroupClosed(groupId, closed); }, []);
  const setUsualSplit = useCallback(async (groupId: string, split: UsualSplit | null) => { await engine().setUsualSplit(groupId, split); }, []);

  const addReceipts = useCallback(async (entryId: string, pictures: Blob[]) => {
    const e = engRef.current;
    const owner = await e?.store.getMeta<string>('localOwner');
    if (!e) return;
    if (!owner) throw new Error(tr('Sign in to attach receipt photos.'));
    const all = await e.store.allReceipts();
    if (liveFor(all, entryId).length + pictures.length > MAX_PHOTOS) throw new Error(tr('A payment can carry {0} photos.', MAX_PHOTOS));
    if (pictures.length > photoRoom(all, owner)) throw new Error(tr('An account can keep {0} photos. Delete some old ones to add more.', MAX_ACCOUNT_PHOTOS));
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
    if (!e || !cfg) return tr('No PIN is set.');
    const tries = (await e.store.getMeta<LockTries>('lockTries')) ?? { fails: 0, until: 0 };
    const wait = secondsToWait(tries, Date.now());
    if (wait > 0) return tr('Too many wrong tries. Wait {0} seconds.', wait);
    if (await checkPin(cfg, pin)) { await e.store.setMeta('lockTries', { fails: 0, until: 0 }); return null; }
    await e.store.setMeta('lockTries', registerFailure(tries, Date.now()));
    return tr('That PIN is not right.');
  }, []);

  const updateLock = useCallback(async (currentPin: string, change: 'remove' | { pin?: string; timeoutSec?: number }): Promise<string | null> => {
    const e = engRef.current;
    const cfg = lockRef.current;
    if (!e || !cfg) return tr('No PIN is set.');
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
      // A PIN set before 1.23 does not know its length yet: remember it now, so the lock screen can submit by itself next time.
      if (cfg && cfg.len === undefined) { await e.store.setMeta('lock', { ...cfg, len: pin.length }); await reload(); }
      saveLastActive(Date.now());
      setLocked(false);
      return { ok: true };
    }
    const next = registerFailure(tries, Date.now());
    await e.store.setMeta('lockTries', next);
    return { ok: false, waitSec: secondsToWait(next, Date.now()) };
  }, [reload]);

  // Changes to the categories and budgets are read-modify-write on the stored map, so two quick taps never lose one.
  const changeMine = useCallback(async (f: (m: Mine, list: CategoryInfo[], nowIso: string) => Mine) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateMeta<MineBlock>('mine', (cur) => {
      const before = cur?.items ?? {};
      const next = f(before, categoryList(before), nowIso);
      return next === before ? undefined : { items: next, dirty: 1 };
    });
    await afterChange();
  }, [afterChange]);

  const addCategory = useCallback(async (name: string, group: Cat): Promise<AddResult> => {
    let result: AddResult = { ok: false, error: tr('The app is still starting.') };
    await changeMine((m, list, nowIso) => {
      result = addCategoryTo(m, list, name, group, nowIso);
      return result.ok ? result.mine : m;
    });
    return result;
  }, [changeMine]);

  const removeCategory = useCallback((name: string) => changeMine((m, list, nowIso) => {
    const info = list.find((c) => c.name === name);
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

  // Same read-modify-write as the categories: two quick taps never lose one.
  const changeRecurring = useCallback(async (f: (items: Recurring, nowIso: string) => Recurring) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateMeta<RecurBlock>('recurring', (cur) => {
      const before = cur?.items ?? {};
      const next = f(before, nowIso);
      return next === before ? undefined : { items: next, dirty: 1 };
    });
    await afterChange();
  }, [afterChange]);

  const addRecurring = useCallback(async (i: RecurInput, loggedMonth?: string): Promise<string | null> => {
    let error: string | null = null;
    await changeRecurring((items, nowIso) => {
      const r = addRecurringTo(items, i, nowIso, undefined, loggedMonth);
      if (!r.ok) { error = r.error; return items; }
      return r.items;
    });
    return error;
  }, [changeRecurring]);

  const editRecurring = useCallback(async (id: string, i: RecurInput): Promise<string | null> => {
    let error: string | null = null;
    await changeRecurring((items, nowIso) => {
      const r = editRecurringIn(items, id, i, nowIso);
      if (!r.ok) { error = r.error; return items; }
      return r.items;
    });
    return error;
  }, [changeRecurring]);

  // Goals and their top-ups: the same read-modify-write, so two quick taps never lose one.
  const changeGoals = useCallback(async (f: (items: Goals, nowIso: string) => Goals) => {
    const e = engRef.current;
    if (!e) return;
    const nowIso = new Date().toISOString();
    await e.store.mutateMeta<GoalsBlock>('goals', (cur) => {
      const before = cur?.items ?? {};
      const next = f(before, nowIso);
      return next === before ? undefined : { items: next, dirty: 1 };
    });
    await afterChange();
  }, [afterChange]);

  const runGoals = useCallback(async (f: (items: Goals, nowIso: string) => { ok: true; items: Goals } | { ok: false; error: string }): Promise<string | null> => {
    let error: string | null = null;
    await changeGoals((items, nowIso) => {
      const r = f(items, nowIso);
      if (!r.ok) { error = r.error; return items; }
      return r.items;
    });
    return error;
  }, [changeGoals]);

  const addGoal = useCallback((i: GoalInput) => runGoals((items, nowIso) => addGoalTo(items, i, isoDate(), nowIso)), [runGoals]);
  const editGoal = useCallback((id: string, i: GoalInput) => runGoals((items, nowIso) => editGoalIn(items, id, i, nowIso)), [runGoals]);
  const removeGoal = useCallback((id: string) => changeGoals((items, nowIso) => removeGoalFrom(items, id, nowIso)), [changeGoals]);
  const addTopUp = useCallback((goalId: string, amount: number, date: string) => runGoals((items, nowIso) => addTopUpTo(items, goalId, amount, date, isoDate(), nowIso)), [runGoals]);
  const removeTopUp = useCallback((id: string) => changeGoals((items, nowIso) => removeTopUpFrom(items, id, nowIso)), [changeGoals]);
  const addNetWorth = useCallback((amount: number, date: string) => runGoals((items, nowIso) => addNetUpdateTo(items, amount, date, isoDate(), nowIso)), [runGoals]);
  const removeNetWorth = useCallback((id: string) => changeGoals((items, nowIso) => removeNetUpdateFrom(items, id, nowIso)), [changeGoals]);

  // The due list lives in the goals block (kind 'd'): the same read-modify-write as goals, so two quick taps never lose one.
  const addDue = useCallback((i: DueInput) => runGoals((items, nowIso) => addDueItem(items, i, nowIso)), [runGoals]);
  const editDue = useCallback((id: string, i: DueInput) => runGoals((items, nowIso) => editDueItem(items, id, i, nowIso)), [runGoals]);
  const toggleDone = useCallback((id: string, done: boolean) => changeGoals((items, nowIso) => setDueItemDone(items, id, done, nowIso)), [changeGoals]);
  const removeDue = useCallback((id: string) => changeGoals((items, nowIso) => removeDueItem(items, id, nowIso)), [changeGoals]);

  const removeRecurring = useCallback((id: string) => changeRecurring((items, nowIso) => removeRecurringFrom(items, id, nowIso)), [changeRecurring]);

  // One tap on the Overview: mark this month handled first (so a double tap cannot log twice), then add the payment on its
  // scheduled day. If adding fails, the mark is undone.
  const logRecurring = useCallback(async (id: string, how: 'log' | 'skip') => {
    const e = engRef.current;
    if (!e) return;
    const now = new Date();
    const nowIso = now.toISOString();
    const month = isoDate(now).slice(0, 7);
    const claimed: { item: Recurring[string] | null; before: string } = { item: null, before: '' };
    await e.store.mutateMeta<RecurBlock>('recurring', (cur) => {
      const it = cur?.items[id];
      if (!cur || !it || it.x || it.l >= month) return undefined;
      claimed.item = it;
      claimed.before = it.l;
      return { items: markHandled(cur.items, id, month, nowIso), dirty: 1 };
    });
    const it = claimed.item;
    if (it && how === 'log') {
      try {
        await e.store.putEntries([makeEntry({ date: scheduledDate(it, month), category: it.c, amount: it.a, method: it.m, note: it.n }, nowIso)]);
      } catch (err) {
        await e.store.mutateMeta<RecurBlock>('recurring', (cur) => (cur?.items[id] ? { items: { ...cur.items, [id]: { ...cur.items[id]!, l: claimed.before } }, dirty: 1 } : undefined));
        await afterChange();
        throw err;
      }
    }
    await afterChange();
  }, [afterChange]);

  const restoreBackup = useCallback(async (b: Extract<BackupParse, { ok: true }>) => {
    const e = engRef.current;
    if (!e) return { added: 0, updated: 0 };
    let added = 0;
    let updated = 0;
    const byId = new Map(b.entries.map((x) => [x.id, x]));
    await e.store.mutateEntries([...byId.keys()], (cur, id) => {
      const x = byId.get(id)!;
      if (!cur) { added++; return { ...x, dirty: 1 }; }
      if (parseTs(x.updated_at) > parseTs(cur.updated_at)) { updated++; return { ...x, dirty: 1 }; }
      return undefined;
    });
    // An older backup may still hold the spreadsheet plan and the imported due list: they are brought across like the stored ones.
    if (b.due) await e.store.mutateMeta<GoalsBlock>('goals', (cur) => { const r = migrateDue(b.due, b.dueDone, cur?.items ?? {}); return r.added ? { items: r.items, dirty: 1 } : undefined; });
    if (b.plan) await e.store.mutateMeta<MineBlock>('mine', (cur) => { const r = migratePlan(b.plan, cur?.items ?? {}, monthOf(isoDate())); return r.added ? { items: r.mine, dirty: 1 } : undefined; });
    if (Object.keys(b.categories).length) {
      await e.store.mutateMeta<MineBlock>('mine', (cur) => ({ items: mergeMine(cur?.items ?? {}, b.categories), dirty: 1 }));
    }
    if (Object.keys(b.recurring).length) {
      await e.store.mutateMeta<RecurBlock>('recurring', (cur) => ({ items: mergeRecurring(cur?.items ?? {}, b.recurring), dirty: 1 }));
    }
    if (Object.keys(b.goals).length) {
      await e.store.mutateMeta<GoalsBlock>('goals', (cur) => ({ items: mergeGoals(cur?.items ?? {}, b.goals), dirty: 1 }));
    }
    await afterChange();
    return { added, updated };
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
  const requestPasswordReset = useCallback((email: string) => engine().requestPasswordReset(email, appRootUrl(window.location.href, BASEPATH)), []);
  const dismissAuthNotice = useCallback(() => setAuthNotice(null), []);
  const changePassword = useCallback(async (password: string) => { await engine().changePassword(password); setRecovering(false); }, []);
  const signOutOthers = useCallback(() => engine().signOutOthers(), []);
  const signOutEverywhere = useCallback(() => engine().signOutEverywhere(), []);
  const signOut = useCallback(async () => { await engRef.current?.sync.signOut(); setRecovering(false); }, []);
  const eraseAll = useCallback(async () => {
    await engRef.current?.sync.eraseAll();
    clearProfile(); // the name and the WhatsApp number are on this phone too
    clearSent(); // so is the memory of what went into calendar files
    clearLastActive(); // and when the app was last in use
    await reload();
    setLocked(false); // everything, the PIN included, is gone
  }, [reload]);

  const own = useMemo(() => all.filter((e) => isMine(e, me)), [all, me]);
  const categories = useMemo(() => categoryList(mine), [mine]);
  const dueItems = useMemo<DueItem[]>(() => dueItemsOf(goals), [goals]);
  const value = useMemo<AppApi>(() => ({
    ready: loaded,
    storageKind: eng?.store.kind ?? 'memory',
    me, receipts, lock: lockCfg, locked, unlock, setPin, updateLock,
    addReceipts, removeReceipt, receiptBlob, fetchHistory,
    entries: own.filter((e) => !e.deleted_at),
    allEntries: own,
    groupEntries: all.filter((e) => e.group_id && !e.deleted_at),
    groups, members, invites, settlements, joinCode, clearJoinCode,
    dueItems, mine, categories, recurring, addRecurring, editRecurring, removeRecurring, logRecurring,
    goals, addGoal, editGoal, removeGoal, addTopUp, removeTopUp, addNetWorth, removeNetWorth,
    sync,
    syncEnabled,
    toastMsg,
    toastAction,
    toast,
    addEntry, updateEntry, removeEntry, undoEntry, addDue, editDue, toggleDone, removeDue, restoreBackup, addCategory, removeCategory, saveBudgets,
    addSettlement, removeSettlement, createGroup, joinGroup, resetInvite, leaveGroup, removeMember, makeAdmin, setDisplayName, setTripDates, setGroupClosed, setUsualSplit,
    syncNow, signUp, signInWithPassword, requestPasswordReset, recovering, authNotice, dismissAuthNotice, changePassword, signOutOthers, signOutEverywhere, signOut, eraseAll,
  }), [loaded, eng, all, own, me, receipts, lockCfg, locked, unlock, setPin, updateLock, addReceipts, removeReceipt, receiptBlob, fetchHistory, groups, members, invites, settlements, joinCode, clearJoinCode, dueItems, mine, categories, recurring, addRecurring, editRecurring, removeRecurring, logRecurring, goals, addGoal, editGoal, removeGoal, addTopUp, removeTopUp, addNetWorth, removeNetWorth, sync, toastMsg, toastAction, toast, addEntry, updateEntry, removeEntry, undoEntry, addDue, editDue, toggleDone, removeDue, restoreBackup, addCategory, removeCategory, saveBudgets, addSettlement, removeSettlement, createGroup, joinGroup, resetInvite, leaveGroup, removeMember, makeAdmin, setDisplayName, setTripDates, setGroupClosed, setUsualSplit, syncNow, signUp, signInWithPassword, requestPasswordReset, recovering, authNotice, dismissAuthNotice, changePassword, signOutOthers, signOutEverywhere, signOut, eraseAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Net worth worked out from the person's accounts (version 2.3, docs/prd-2.3.md). An account is a net worth item with settings (kept in
// the item's `w`, which 2.2.1 carries unchanged): which ways of paying take money from it, whether money received lands in it, which
// categories move money into it (or pay it off, for a card), a yearly interest rate (FD, RD, PPF) and whether its value is a market
// value (mutual funds, stocks). Its balance is worked out, never stored: the figure confirmed on its day, plus the payments logged since,
// plus interest. A check-in confirms new figures. Items without settings (loans, everything else) keep their typed value or estimate.
// Pure: no DOM, no storage, no network.
import type { Goals, UdhaarItem, WorthItem } from './goals.ts';
import { netUpdates } from './goals.ts';
import type { Settlement } from './groups.ts';
import { checkInWorth, valueNow } from './worth.ts';
import { METHODS, catKey, daysInMonth, isoDate, laterThan, normName, parseTs, round2, shiftMonth } from './logic.ts';
import type { Entry, Method } from './logic.ts';
import { tr } from './i18n.ts';

export interface AccountSettings {
  pay: Method[]; // the ways of paying that take money from it (a credit card: 'Card'); each way pays from one account only
  inc: boolean; // money logged as received lands here (one account)
  cat: string[]; // categories whose payments move money into it (saving into FD or mutual funds) or pay it off (a card bill)
  ir: number; // yearly interest rate, deposits only (0: none)
  mk: boolean; // a market value (mutual funds, stocks): asked at the check-in
  at: string | null; // when its figure was confirmed: a payment logged later that same day still counts
}

export const NO_SETTINGS: AccountSettings = { pay: [], inc: false, cat: [], ir: 0, mk: false, at: null };
const MAX_CATS = 12;

const all = (items: Goals): WorthItem[] => Object.values(items).filter((v): v is WorthItem => v.k === 'w' && !v.x);

/** The settings of an item that is worked out from payments, or null for one kept by hand (anything malformed counts as none). */
export function settingsOf(it: WorthItem): AccountSettings | null {
  const w = it.w;
  if (!w || w.on !== 1) return null;
  const pay = Array.isArray(w.pay) ? [...new Set(w.pay.filter((m): m is Method => (METHODS as readonly unknown[]).includes(m)))] : [];
  const cat = Array.isArray(w.cat) ? [...new Set(w.cat.filter((c): c is string => typeof c === 'string' && normName(c) !== '' && c.length <= 80).map(normName))].slice(0, MAX_CATS) : [];
  const ir = typeof w.ir === 'number' && Number.isFinite(w.ir) && w.ir > 0 && w.ir <= 30 && it.s === 'a' ? round2(w.ir) : 0;
  const at = typeof w.at === 'string' && Number.isFinite(parseTs(w.at)) ? w.at : null;
  return { pay, inc: w.inc === 1 && it.s === 'a', cat, ir, mk: w.mk === 1 && it.s === 'a', at };
}

/** What is stored in the item's `w` for these settings (null: kept by hand again). */
export function settingsField(s: AccountSettings | null): Record<string, unknown> | undefined {
  if (!s) return undefined;
  return { on: 1, pay: s.pay, ...(s.inc ? { inc: 1 } : {}), cat: s.cat.slice(0, MAX_CATS), ...(s.ir > 0 ? { ir: s.ir } : {}), ...(s.mk ? { mk: 1 } : {}), ...(s.at ? { at: s.at } : {}) };
}

/** Whether net worth is worked out from accounts: at least one item has settings. */
export const isWorkedOut = (items: Goals): boolean => all(items).some((i) => settingsOf(i) !== null);

/** Set or clear an item's settings as they are. A way of paying, or money received, moves to this account from any other that had it. */
export function setSettings(items: Goals, id: string, s: AccountSettings | null, nowIso: string): Goals {
  const cur = items[id];
  if (cur?.k !== 'w' || cur.x) return items;
  const out: Goals = { ...items };
  if (s) {
    for (const other of all(items)) {
      const os = other.id === id ? null : settingsOf(other);
      if (!os) continue;
      const pay = os.pay.filter((m) => !s.pay.includes(m));
      const inc = os.inc && !s.inc;
      if (pay.length !== os.pay.length || inc !== os.inc) out[other.id] = { ...other, w: settingsField({ ...os, pay, inc }), t: laterThan(other.t, nowIso) };
    }
  }
  const { w: _old, ...rest } = cur;
  const w = settingsField(s);
  out[id] = { ...rest, ...(w ? { w } : {}), t: laterThan(cur.t, nowIso) };
  return out;
}

// ---------------------------------------------------------------- what moves an account
export type FlowKind = 'in' | 'spent' | 'moved-in' | 'moved-out' | 'settled';
/** One payment's effect on one account: amount is the change of the account's own figure (a card: what you owe). */
export interface Flow { entry: string; date: string; label: string; kind: FlowKind; amount: number; with: string | null } // with: the other account of a move
export interface Worked { id: string; value: number; base: number; since: string; at: string | null; inflow: number; outflow: number; interest: number; flows: Flow[] }

/**
 * Money that moved between the person and friends without being spending: a settle-up in a group (paid back, or got back) and Udhaar
 * (lent, borrowed, and settled). amount above zero came into their own money. It moves an account; the group and Udhaar lines move the
 * other way, so net worth stays the same.
 */
export interface CashMove { id: string; date: string; at: string | null; label: string; amount: number }

export function cashMoves(settlements: readonly Settlement[], items: Goals, me: string | null): CashMove[] {
  const out: CashMove[] = [];
  for (const s of settlements) {
    if (s.deleted_at || !me) continue;
    if (s.to_user === me) out.push({ id: s.id, date: s.settle_date, at: s.created_at, label: tr('Paid back to you'), amount: s.amount });
    else if (s.from_user === me) out.push({ id: s.id, date: s.settle_date, at: s.created_at, label: tr('You paid back'), amount: -s.amount });
  }
  for (const u of Object.values(items)) {
    if (u.k !== 'u' || u.x) continue;
    const sign = (u as UdhaarItem).w === 'gave' ? -1 : 1;
    out.push({ id: u.id, date: u.d, at: null, label: tr('Udhaar: {0}', u.n), amount: sign * u.a });
    if (u.s) out.push({ id: `${u.id}:settled`, date: isoDate(new Date(parseTs(u.t))), at: u.t, label: tr('Udhaar settled: {0}', u.n), amount: -sign * u.a });
  }
  return out;
}

/** The payments that can move the person's accounts or count in their month: their own, and group expenses they paid or share in. */
export function accountEntries(own: readonly Entry[], groupEntries: readonly Entry[], me: string | null): Entry[] {
  const seen = new Set(own.map((e) => e.id));
  return [...own, ...groupEntries.filter((e) => !seen.has(e.id) && me !== null && (e.paid_by === me || Boolean(e.shares && Object.hasOwn(e.shares, me))))];
}

/** Whether a payment left the person's own money: their own private payment, or a group expense they paid (a share someone else paid is in the group line). */
const paidByMe = (e: Entry, me: string | null): boolean => {
  if (e.deleted_at || e.share_of) return false;
  if (e.group_id) return e.paid_by !== null && e.paid_by === me;
  return e.owner_id === null || e.owner_id === me;
};

interface Routes { byMethod: Map<Method, string>; fallback: string | null; income: string | null; byCat: Map<string, string> }

/** Which account each way of paying, money received and each category goes to. */
function routes(items: Goals): Routes {
  const r: Routes = { byMethod: new Map(), fallback: null, income: null, byCat: new Map() };
  const owned = new Set<string>();
  for (const it of all(items).sort((a, b) => a.id.localeCompare(b.id))) {
    const s = settingsOf(it);
    if (!s) continue;
    addRoutes(r, it.id, s);
    if (it.s === 'a') owned.add(it.id);
  }
  r.fallback = fallbackOf(r, owned);
  return r;
}

// The first account to claim a way of paying, a category or money received keeps it (accounts in id order, so every device agrees).
function addRoutes(r: Routes, id: string, s: AccountSettings): void {
  for (const m of s.pay) if (!r.byMethod.has(m)) r.byMethod.set(m, id);
  for (const c of s.cat) if (!r.byCat.has(catKey(c))) r.byCat.set(catKey(c), id);
  if (s.inc && r.income === null) r.income = id;
}

// A payment with no way of paying (and a settle-up or Udhaar) comes from money you own: the UPI account, else one you pay from, else the salary one.
function fallbackOf(r: Routes, owned: ReadonlySet<string>): string | null {
  const upi = r.byMethod.get('UPI');
  if (upi && owned.has(upi)) return upi;
  return [...r.byMethod.values()].find((id) => owned.has(id)) ?? r.income;
}

/** The account a payment comes from: its way of paying's, or with none (or Other, not set) the fallback. A way of paying not tracked: none. */
function sourceOf(e: Entry, r: Routes): string | null {
  const mapped = e.method ? r.byMethod.get(e.method) : undefined;
  if (mapped) return mapped;
  return e.method === null || e.method === 'Other' ? r.fallback : null;
}

const monthsBetween = (from: string, to: string): number => {
  const [y1 = 0, m1 = 1, d1 = 1] = from.split('-').map(Number);
  const [y2 = 0, m2 = 1, d2 = 1] = to.split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
};

/** Interest on a deposit, estimated: compounded monthly on the confirmed figure, for each whole month since its day. */
export function interestOn(base: number, ratePct: number, from: string, to: string): number {
  if (ratePct <= 0 || base <= 0) return 0;
  const months = Math.min(monthsBetween(from, to), 600);
  return round2(base * ((1 + ratePct / 1200) ** months - 1));
}

type Push = (id: string, f: Omit<Flow, 'amount'>, raise: number, at: string | null) => void;

// One payment, sent to the accounts it moves: received money in, spending out, and a move between two accounts when its category goes to one.
function routeEntry(e: Entry, r: Routes, push: Push): void {
  const label = e.note ? e.note.split(' · ')[0]! : e.category;
  if (e.kind === 'in') {
    if (r.income) push(r.income, { entry: e.id, date: e.entry_date, label, kind: 'in', with: null }, e.amount, e.created_at);
    return;
  }
  const from = sourceOf(e, r);
  const to = r.byCat.get(catKey(e.category)) ?? null;
  if (from && to && from === to) return;
  if (from) push(from, { entry: e.id, date: e.entry_date, label, kind: to ? 'moved-out' : 'spent', with: to }, -e.amount, e.created_at);
  if (to) push(to, { entry: e.id, date: e.entry_date, label, kind: 'moved-in', with: from }, e.amount, e.created_at);
}

/** Whether something dated `date` (made at `at`) moves an account confirmed on `since` (at `confirmed`): after that day, or later that same day. */
const counts = (date: string, at: string | null, since: string, confirmed: string | null, todayIso: string): boolean => {
  if (date > todayIso) return false;
  if (date > since) return true;
  return date === since && confirmed !== null && at !== null && parseTs(at) > parseTs(confirmed);
};

/**
 * Every account's balance today: the figure confirmed on its day, plus what moved it after (payments, settle-ups, Udhaar), plus interest.
 * For an asset a payment out lowers it; for a card it raises what you owe, and a move into it pays it off.
 */
export function workAccounts(items: Goals, entries: readonly Entry[], me: string | null, todayIso: string, cash: readonly CashMove[] = []): Record<string, Worked> {
  const r = routes(items);
  const out: Record<string, Worked> = {};
  const accounts = all(items).filter((i) => settingsOf(i) !== null);
  for (const it of accounts) out[it.id] = { id: it.id, value: it.a, base: it.a, since: it.d, at: settingsOf(it)!.at, inflow: 0, outflow: 0, interest: 0, flows: [] };
  const sideOf = new Map(accounts.map((i) => [i.id, i.s]));
  const push: Push = (id, f, raise, at) => {
    const w = out[id];
    if (!w || !counts(f.date, at, w.since, w.at, todayIso)) return;
    const amount = sideOf.get(id) === 'd' ? -raise : raise; // a card: spending raises what you owe, a payment into it lowers it
    w.flows.push({ ...f, amount });
    if (amount >= 0) w.inflow = round2(w.inflow + amount); else w.outflow = round2(w.outflow - amount);
  };
  for (const e of entries) if (paidByMe(e, me)) routeEntry(e, r, push);
  if (r.fallback) for (const c of cash) push(r.fallback, { entry: c.id, date: c.date, label: c.label, kind: 'settled', with: null }, c.amount, c.at);
  for (const it of accounts) {
    const w = out[it.id]!;
    const s = settingsOf(it)!;
    w.interest = s.ir > 0 && !s.mk ? interestOn(it.a, s.ir, it.d, todayIso) : 0;
    w.value = round2(it.a + w.inflow - w.outflow + w.interest);
    w.flows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.label.localeCompare(b.label)));
  }
  return out;
}

/** An item's figure today: worked out for an account, typed (or a loan's estimate) for the rest. */
export const figureOf = (it: WorthItem, worked: Readonly<Record<string, Worked>>, todayIso: string): number => worked[it.id]?.value ?? valueNow(it, todayIso);

const withAt = (it: WorthItem, nowIso: string): Record<string, unknown> | undefined => {
  const s = settingsOf(it);
  return s ? settingsField({ ...s, at: nowIso }) : it.w;
};

/**
 * Change what moves an account (or set it up, or keep it by hand again) from today on. Every account is first confirmed at today's
 * worked-out figure, so the new routing does not reach back into payments already counted; an item set up now starts from its figure today.
 */
export function changeAccount(items: Goals, id: string, s: AccountSettings | null, worked: Readonly<Record<string, Worked>>, todayIso: string, nowIso: string): Goals {
  const cur = items[id];
  if (cur?.k !== 'w' || cur.x) return items;
  const out: Goals = { ...items };
  for (const it of all(items)) {
    if (!settingsOf(it) && it.id !== id) continue;
    const value = Math.max(0, round2(figureOf(it, worked, todayIso)));
    out[it.id] = { ...it, a: value, d: todayIso, w: withAt(it, nowIso), t: laterThan(it.t, nowIso) };
  }
  return setSettings(out, id, s ? { ...s, at: nowIso } : null, nowIso);
}

// ---------------------------------------------------------------- the check-in
export type AskKind = 'market' | 'bank' | 'kept';
/** What the check-in asks: a market value, a bank balance to confirm, or an item kept by hand. expected: what the app works out now. */
export interface Ask { id: string; kind: AskKind; name: string; side: WorthItem['s']; expected: number; put: number }

/** The figures the app cannot know, in that order: market values, bank balances, then the items kept by hand (loans, everything else). */
export function checkInAsks(items: Goals, worked: Readonly<Record<string, Worked>>, todayIso: string): Ask[] {
  const order: Record<AskKind, number> = { market: 0, bank: 1, kept: 2 };
  const asks: Ask[] = [];
  for (const it of all(items)) {
    const s = settingsOf(it);
    const expected = figureOf(it, worked, todayIso);
    if (!s) asks.push({ id: it.id, kind: 'kept', name: it.n, side: it.s, expected, put: 0 });
    else if (s.mk) asks.push({ id: it.id, kind: 'market', name: it.n, side: it.s, expected, put: worked[it.id]?.inflow ?? 0 });
    else if (it.s === 'a' && it.c === 'liquid') asks.push({ id: it.id, kind: 'bank', name: it.n, side: it.s, expected, put: 0 });
  }
  return asks.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

/** The accounts worked out for you at a check-in (deposits, cards, anything not asked), with their figure. */
export function workedForYou(items: Goals, worked: Readonly<Record<string, Worked>>, todayIso: string): { id: string; name: string; side: WorthItem['s']; value: number }[] {
  const asked = new Set(checkInAsks(items, worked, todayIso).map((a) => a.id));
  return all(items).filter((i) => settingsOf(i) !== null && !asked.has(i.id)).map((i) => ({ id: i.id, name: i.n, side: i.s, value: figureOf(i, worked, todayIso) }));
}

const validFigure = (n: number | undefined): n is number => n !== undefined && n >= 0 && round2(n) === n && n < 1e12;

/**
 * Save a check-in (or confirm one account). Only the accounts answered are confirmed at the figure given, today; the rest keep counting
 * from their own day. p keeps what the app expected (never below zero), adding up over the month: so with two check-ins in a month, a
 * market value's move is the sum of both surprises. Items kept by hand go through the usual check-in (a loan left at its estimate is
 * only confirmed).
 */
export function applyCheckIn(items: Goals, answers: Readonly<Record<string, number>>, worked: Readonly<Record<string, Worked>>, todayIso: string, nowIso: string): Goals {
  const accounts = all(items).filter((i) => settingsOf(i) !== null);
  const isAccount = new Set(accounts.map((i) => i.id));
  const kept = Object.fromEntries(Object.entries(answers).filter(([id]) => !isAccount.has(id)));
  const out = checkInWorth(items, kept, todayIso, nowIso);
  const monthStart = dayBeforeMonth(todayIso);
  for (const it of accounts) {
    const given = Object.hasOwn(answers, it.id) ? answers[it.id] : undefined;
    if (!validFigure(given)) continue;
    const expected = round2(figureOf(it, worked, todayIso));
    const again = it.d > monthStart && it.p !== null; // checked already this month: keep adding up its surprises
    let p: number | null = again ? round2(expected - (it.a - (it.p as number))) : expected;
    if (expected < 0 || p < 0) p = null;
    out[it.id] = { ...it, a: round2(given), d: todayIso, p, pd: again ? it.pd : it.d, w: withAt(it, nowIso), t: laterThan(it.t, nowIso) };
  }
  return out;
}

/**
 * The set-up: what each account holds today, typed once. A fresh start: no figure before it is kept, so the first month does not show the
 * difference from an old typed value as a move of the market.
 */
export function startAccounts(items: Goals, figures: Readonly<Record<string, number>>, todayIso: string, nowIso: string): Goals {
  const out: Goals = { ...items };
  for (const [id, n] of Object.entries(figures)) {
    const it = items[id];
    if (it?.k !== 'w' || it.x || !validFigure(n)) continue;
    out[id] = { ...it, a: round2(n), d: todayIso, p: null, pd: '', w: withAt(it, nowIso), t: laterThan(it.t, nowIso) };
  }
  return out;
}

/** The day the check-in was last done in full: the earliest of the days its figures were last confirmed (null before the first). */
export function lastCheckIn(items: Goals, worked: Readonly<Record<string, Worked>>, todayIso: string): string | null {
  const days = checkInAsks(items, worked, todayIso).map((a) => (items[a.id] as WorthItem).d).sort();
  return days[0] ?? null;
}

// ---------------------------------------------------------------- why it moved
export interface MovedLine { name: string; amount: number }
export interface WhyMoved {
  from: string; start: number | null; end: number; change: number | null;
  saved: number; markets: number; interest: number; other: number; came: number; kept: number | null; moved: MovedLine[];
}

/** The last day of the month before today's: "this month" counts the payments dated after it, from the 1st. */
export function dayBeforeMonth(todayIso: string): string {
  const prev = shiftMonth(todayIso.slice(0, 7), -1);
  return `${prev}-${String(daysInMonth(prev)).padStart(2, '0')}`;
}

/** The figure at the start of a period: the last snapshot on or before its first day (null when the history starts later). */
function figureAt(items: Goals, day: string): number | null {
  return netUpdates(items).find((u) => u.d <= day)?.a ?? null;
}

// What a payment cost the person: all of a private one, their share of a shared one (paid by them or by someone else).
const myPart = (e: Entry, me: string | null): number => {
  if (!e.group_id) return e.amount;
  return me !== null && e.shares ? (e.shares[me] ?? 0) : 0;
};

// The period's payments: money received into the salary account, what the person spent (their part only, and only from money that is
// tracked), and money moved between their own accounts (by account id), which changed nothing.
function periodFlows(r: Routes, entries: readonly Entry[], me: string | null, from: string, todayIso: string): { came: number; spent: number; moved: Map<string, number> } {
  let came = 0;
  let spent = 0;
  const moved = new Map<string, number>();
  for (const e of entries) {
    if (e.deleted_at || e.share_of || e.entry_date <= from || e.entry_date > todayIso) continue;
    if (!paidByMe(e, me)) { spent = round2(spent + myPart(e, me)); continue; } // someone else paid: my share is in the group line
    if (e.kind === 'in') { if (r.income) came = round2(came + e.amount); continue; }
    const src = sourceOf(e, r);
    const to = r.byCat.get(catKey(e.category));
    if (to && to !== src) moved.set(to, round2((moved.get(to) ?? 0) + e.amount));
    else if (src && !to) spent = round2(spent + myPart(e, me));
  }
  return { came, spent, moved };
}

// How far market values moved at the check-ins in the period, and the interest estimated on deposits over it.
function growth(items: Goals, from: string, todayIso: string): { markets: number; interest: number } {
  let markets = 0;
  let interest = 0;
  for (const it of all(items)) {
    const s = settingsOf(it);
    if (s?.mk && it.p !== null && it.d > from) markets = round2(markets + it.a - it.p);
    if (s && s.ir > 0 && !s.mk) {
      const start = it.d > from ? it.d : from;
      interest = round2(interest + interestOn(it.a, s.ir, it.d, todayIso) - interestOn(it.a, s.ir, it.d, start));
    }
  }
  return { markets, interest };
}

/**
 * Why net worth moved since `from`: what was saved (money received less what you spent), markets (how far market values moved at the
 * check-ins), interest (estimated on deposits), the rest (items kept by hand, payments not logged), and the money moved between your own
 * accounts, which changed nothing.
 */
export function whyItMoved(items: Goals, entries: readonly Entry[], me: string | null, end: number, from: string, todayIso: string): WhyMoved {
  const { came, spent, moved } = periodFlows(routes(items), entries, me, from, todayIso);
  const { markets, interest } = growth(items, from, todayIso);
  const names = new Map(all(items).map((i) => [i.id, i.n]));
  const saved = round2(came - spent);
  const start = figureAt(items, from);
  const change = start === null ? null : round2(end - start);
  const other = change === null ? 0 : round2(change - saved - markets - interest);
  const lines = [...moved.entries()].map(([id, amount]) => ({ name: names.get(id) ?? '', amount })).sort((a, b) => b.amount - a.amount);
  return { from, start, end, change, saved, markets, interest, other, came, kept: came > 0 ? saved / came : null, moved: lines };
}

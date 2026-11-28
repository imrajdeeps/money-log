// Net worth as a list of what the person owns and owes (version 1.33). Each item has a value; the snapshots in the history (net worth
// updates, goals.ts) are written from the items whenever they change. Loans can pay themselves down on paper (an EMI and a rate give an
// estimated balance); two lines can be added automatically (group balances, Udhaar). Pure: no DOM, no storage, no network.
import { ASSET_CLASSES, DEBT_CLASSES, MAX_WORTH, addNetUpdate, parseNetAmount, netUpdates } from './goals.ts';
import type { Goals, WorthItem, WorthSide } from './goals.ts';
import { monthlyTotals, monthsEnding, averageOf } from './analytics.ts';
import type { GroupOf } from './analytics.ts';
import { groupBalances, fromPaise } from './groups.ts';
import type { Group, Settlement } from './groups.ts';
import { laterThan, newId, normName, round2, shiftMonth } from './logic.ts';
import type { Entry } from './logic.ts';
import type { Worked } from './accounts.ts';
import { tr } from './i18n.ts';

export type { WorthItem, WorthSide };

/** The words for a kind of item (written out, so each can be translated). */
export function classLabel(side: WorthSide, cls: string): string {
  if (side === 'a') {
    switch (cls) {
      case 'liquid': return tr('Cash and bank');
      case 'invest': return tr('Investments');
      case 'retire': return tr('Retirement (PF, PPF, NPS)');
      case 'gold': return tr('Gold');
      case 'property': return tr('Property');
      default: return tr('Other assets');
    }
  }
  switch (cls) {
    case 'loan': return tr('Loans');
    case 'card': return tr('Credit card');
    default: return tr('Other debts');
  }
}
export const classesOf = (side: WorthSide): readonly string[] => (side === 'a' ? ASSET_CLASSES : DEBT_CLASSES);

export interface WorthInput { name: string; side: WorthSide; cls: string; amount: string; emi: string; rate: string }
export type WorthChecked = { ok: true; name: string; side: WorthSide; cls: string; amount: number; emi: number; rate: number } | { ok: false; error: string };
export type WorthResult = { ok: true; items: Goals } | { ok: false; error: string };

const RATE = /^\d{1,2}(\.\d{1,2})?$/;

type LoanTerms = { ok: true; emi: number; rate: number } | { ok: false; error: string };

/** The EMI and the yearly rate, which only a loan has: for any other kind what was typed is ignored. Empty means none (zero). */
function checkLoanTerms(i: WorthInput): LoanTerms {
  if (!(i.side === 'd' && i.cls === 'loan')) return { ok: true, emi: 0, rate: 0 };
  const emiText = i.emi.trim();
  const rateText = i.rate.trim();
  const emi = emiText === '' ? 0 : parseNetAmount(emiText);
  if (emi === null || emi < 0) return { ok: false, error: tr('The EMI must be an amount of zero or more, with at most two decimals.') };
  const rate = rateText === '' ? 0 : (RATE.test(rateText) ? Number(rateText) : NaN);
  if (!Number.isFinite(rate) || rate > 60) return { ok: false, error: tr('The yearly interest rate must be between 0 and 60, with at most two decimals.') };
  return { ok: true, emi, rate };
}

/** What was typed for an item, checked. An amount is never below zero (a debt goes under "You owe"); an EMI and a rate are for loans. */
export function checkWorth(i: WorthInput): WorthChecked {
  const name = normName(i.name);
  if (name === '' || name.length > 40) return { ok: false, error: tr('Give it a name of up to 40 characters.') };
  if (!classesOf(i.side).includes(i.cls)) return { ok: false, error: tr('Choose a kind.') };
  const amount = parseNetAmount(i.amount);
  if (amount === null) return { ok: false, error: tr('Enter an amount, with at most two decimals.') };
  if (amount < 0) return { ok: false, error: tr('An amount cannot be below zero. A debt goes under "You owe".') };
  const terms = checkLoanTerms(i);
  if (!terms.ok) return terms;
  return { ok: true, name, side: i.side, cls: i.cls, amount, emi: terms.emi, rate: terms.rate };
}

const all = (items: Goals): WorthItem[] => Object.values(items).filter((v): v is WorthItem => v.k === 'w');

// ---------------------------------------------------------------- loans that pay themselves down
const monthsBetween = (from: string, to: string): number => {
  const [y1 = 0, m1 = 1, d1 = 1] = from.split('-').map(Number);
  const [y2 = 0, m2 = 1, d2 = 1] = to.split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
};

/** A loan's balance worked out from the one typed on its day: each whole month since, interest first, the rest of the EMI reduces it. */
export function estimateLoan(item: Pick<WorthItem, 'a' | 'd' | 'e' | 'r'>, todayIso: string): number {
  let bal = item.a;
  const months = Math.min(monthsBetween(item.d, todayIso), 600);
  for (let m = 0; m < months && bal > 0; m++) {
    const principal = item.e - bal * item.r / 1200;
    if (principal <= 0) break; // the EMI does not even cover the interest: it does not go down
    bal = Math.max(0, round2(bal - principal));
  }
  return round2(bal);
}

const isLoanWithEmi = (it: WorthItem): boolean => it.s === 'd' && it.c === 'loan' && it.e > 0;

/** What the item is worth today: the typed value, or for a loan with an EMI the estimated balance. */
export const valueNow = (it: WorthItem, todayIso: string): number => (isLoanWithEmi(it) ? estimateLoan(it, todayIso) : it.a);

/** Whether the figure shown is an estimate (a loan with an EMI, at least a month after its balance was typed). */
export const isEstimated = (it: WorthItem, todayIso: string): boolean => isLoanWithEmi(it) && monthsBetween(it.d, todayIso) > 0;

// ---------------------------------------------------------------- changing items
export function addWorthItem(items: Goals, i: WorthInput, todayIso: string, nowIso: string, id: string = newId()): WorthResult {
  const c = checkWorth(i);
  if (!c.ok) return c;
  if (all(items).filter((i) => !i.x).length >= MAX_WORTH) return { ok: false, error: tr('That is the most items one account can keep.') };
  const item: WorthItem = { id, k: 'w', n: c.name, s: c.side, c: c.cls, a: c.amount, d: todayIso, p: null, pd: '', e: c.emi, r: c.rate, x: 0, t: nowIso };
  return { ok: true, items: { ...items, [id]: item } };
}

type Terms = Pick<WorthItem, 'n' | 'c' | 'e' | 'r'>;

/**
 * Set an item's value as of today. The first change on a new day remembers the value it had (p, pd) for "what moved"; another change
 * the same day only replaces the value, so the memory stays the value at the last check-in before today.
 * A loan left at its estimate (same terms) is only confirmed: its balance keeps counting from the day it was typed, so the part of a
 * month already run is not thrown away each time (checking in every few weeks would otherwise freeze it).
 */
function setValue(cur: WorthItem, amount: number, todayIso: string, nowIso: string, terms: Terms = cur): WorthItem {
  const sameDay = cur.d === todayIso || cur.pd === todayIso; // pd is today when a loan was confirmed today without a new balance
  const t = laterThan(cur.t, nowIso);
  const confirmed = isLoanWithEmi(cur) && terms.e === cur.e && terms.r === cur.r && amount === valueNow(cur, todayIso);
  if (confirmed) return { ...cur, n: terms.n, c: terms.c, p: sameDay ? cur.p : amount, pd: sameDay ? cur.pd : todayIso, t };
  return { ...cur, n: terms.n, c: terms.c, e: terms.e, r: terms.r, a: amount, d: todayIso, p: sameDay ? cur.p : valueNow(cur, todayIso), pd: sameDay ? cur.pd : cur.d, t };
}

export function editWorthItem(items: Goals, id: string, i: WorthInput, todayIso: string, nowIso: string): WorthResult {
  const cur = items[id];
  if (cur?.k !== 'w' || cur.x) return { ok: false, error: tr('That item is gone.') };
  const c = checkWorth(i);
  if (!c.ok) return c;
  if (c.side !== cur.s) return { ok: false, error: tr('An item cannot change from owned to owed: remove it and add it again.') };
  const terms: Terms = { n: c.name, c: c.cls, e: c.emi, r: c.rate };
  const unchanged = c.amount === valueNow(cur, todayIso) && c.emi === cur.e && c.rate === cur.r; // a rename or a kind alone is not a new value
  const next = unchanged ? { ...cur, ...terms } : setValue(cur, c.amount, todayIso, nowIso, terms);
  return { ok: true, items: { ...items, [id]: { ...next, t: laterThan(cur.t, nowIso) } } };
}

/** A check-in: new values for the items given (by id), valid ones only. Every item given is confirmed for today, changed or not. */
export function checkInWorth(items: Goals, values: Readonly<Record<string, number>>, todayIso: string, nowIso: string): Goals {
  const out: Goals = { ...items };
  for (const [id, amount] of Object.entries(values)) {
    const cur = items[id];
    if (cur?.k !== 'w' || cur.x || !(amount >= 0) || round2(amount) !== amount || amount >= 1e12) continue;
    out[id] = setValue(cur, amount, todayIso, nowIso);
  }
  return out;
}

export function removeWorthItem(items: Goals, id: string, nowIso: string): Goals {
  const cur = items[id];
  if (cur?.k !== 'w' || cur.x) return items;
  return { ...items, [id]: { ...cur, x: 1, t: laterThan(cur.t, nowIso) } };
}

export interface WorthLists { assets: WorthItem[]; debts: WorthItem[] }
/** 2.3: the figures worked out from payments, by item id (accounts.ts); an item missing from it keeps its typed value or estimate. */
export type WorkedFigures = Readonly<Record<string, Pick<Worked, 'value'>>>;
const figure = (i: WorthItem, todayIso: string, worked?: WorkedFigures): number => worked?.[i.id]?.value ?? valueNow(i, todayIso);

/** The items still kept, the biggest first (by today's value). */
export function worthItems(items: Goals, todayIso: string, worked?: WorkedFigures): WorthLists {
  const live = all(items).filter((i) => !i.x).sort((a, b) => figure(b, todayIso, worked) - figure(a, todayIso, worked) || a.n.localeCompare(b.n));
  return { assets: live.filter((i) => i.s === 'a'), debts: live.filter((i) => i.s === 'd') };
}

// ---------------------------------------------------------------- the picture
export interface AutoLine { key: 'groups' | 'udhaar'; label: string; amount: number } // amount below zero: owed by the person
export interface ClassTotal { side: WorthSide; cls: string; amount: number }
export interface WorthSummary { assets: number; debts: number; net: number; liquid: number; byClass: ClassTotal[]; auto: AutoLine[] }

/** Totals, from the items and the automatic lines. A line above zero counts as something owned, below zero as something owed. */
export function worthSummary(items: Goals, todayIso: string, auto: readonly AutoLine[] = [], worked?: WorkedFigures): WorthSummary {
  const { assets, debts } = worthItems(items, todayIso, worked);
  const sum = (list: WorthItem[]) => round2(list.reduce((s, i) => s + figure(i, todayIso, worked), 0));
  const autoUp = round2(auto.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const autoDown = round2(auto.filter((l) => l.amount < 0).reduce((s, l) => s - l.amount, 0));
  const a = round2(sum(assets) + autoUp);
  const d = round2(sum(debts) + autoDown);
  const by = new Map<string, ClassTotal>();
  for (const i of [...assets, ...debts]) {
    const key = `${i.s}|${i.c}`;
    const cur = by.get(key) ?? { side: i.s, cls: i.c, amount: 0 };
    cur.amount = round2(cur.amount + figure(i, todayIso, worked));
    by.set(key, cur);
  }
  return {
    assets: a,
    debts: d,
    net: round2(a - d),
    liquid: round2(assets.filter((i) => i.c === 'liquid').reduce((s, i) => s + figure(i, todayIso, worked), 0)),
    byClass: [...by.values()].sort((x, y) => y.amount - x.amount),
    auto: [...auto],
  };
}

export interface Move { id: string; name: string; side: WorthSide; change: number } // change: the effect on net worth
/** Whether the item's own number went up: an asset rising, or a debt growing (a debt paid down went down, though it raises net worth). */
export const movedUp = (m: Move): boolean => (m.side === 'a' ? m.change > 0 : m.change < 0);
/** The items that moved the most since the check-in before (assets up or debts down raise net worth), the largest first. */
export function worthMoves(items: Goals, todayIso: string, n = 3): Move[] {
  return all(items)
    .filter((i) => !i.x && i.p !== null)
    .map((i) => { const delta = round2(valueNow(i, todayIso) - (i.p as number)); return { id: i.id, name: i.n, side: i.s, change: i.s === 'a' ? delta : -delta }; })
    .filter((m) => m.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** The average spending of the (up to) three whole months before this one that had any: "a usual month". `entries` are budget entries. */
export function usualMonthlySpend(entries: readonly Entry[], groupOf: GroupOf, todayIso: string): number {
  const month = todayIso.slice(0, 7);
  const t = monthlyTotals(entries, groupOf, monthsEnding(shiftMonth(month, -1), 3));
  return averageOf(t.filter((x) => x.spent > 0).map((x) => x.spent));
}

/** How many months the liquid money would last at a usual month's spending; null without a usual month. */
export const runwayMonths = (liquid: number, monthlySpend: number): number | null =>
  monthlySpend > 0 ? Math.floor((liquid / monthlySpend) * 10) / 10 : null;

/** Debts as a fraction of what is owned; null when nothing is owned. */
export const debtShare = (assets: number, debts: number): number | null => (assets > 0 ? debts / assets : null);

/**
 * Write today's snapshot into the history: the total from the items, replacing today's earlier snapshot if there is one (several saves in
 * a day make one point). Left as it was if the history is full.
 */
export function snapshotWorth(items: Goals, net: number, todayIso: string, nowIso: string): Goals {
  const today = netUpdates(items).find((u) => u.d === todayIso);
  if (today) return { ...items, [today.id]: { ...today, a: net, s: 'c', t: laterThan(today.t, nowIso) } };
  const r = addNetUpdate(items, net, todayIso, todayIso, nowIso, newId(), 'c');
  return r.ok ? r.items : items;
}

/**
 * 2.3: today's point in the history from the figure worked out as payments come in (source 'w'). At most one such point a week: while the
 * latest point is a worked-out one from the last six days, it moves to today; a point already today (a check-in) is updated in place.
 * So the history (at most MAX_NET_UPDATES points) lasts years, and check-ins are never overwritten by an older day's figure.
 */
export function recordWorked(items: Goals, net: number, todayIso: string, nowIso: string): Goals {
  const ups = netUpdates(items);
  const today = ups.find((u) => u.d === todayIso);
  if (today) return today.a === net ? items : { ...items, [today.id]: { ...today, a: net, t: laterThan(today.t, nowIso) } };
  const last = ups[0];
  if (last?.s === 'w' && daysApart(last.d, todayIso) < 7) return { ...items, [last.id]: { ...last, a: net, d: todayIso, t: laterThan(last.t, nowIso) } };
  const r = addNetUpdate(items, net, todayIso, todayIso, nowIso, newId(), 'w');
  return r.ok ? r.items : items;
}
const daysApart = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** What friends owe the person less what the person owes them, across every group (above zero: owed to them). */
export function groupsNet(groups: readonly Pick<Group, 'id'>[], entries: readonly Entry[], settlements: readonly Settlement[], me: string | null): number {
  if (!me) return 0;
  let paise = 0;
  for (const g of groups) paise += groupBalances(g.id, [...entries], [...settlements])[me] ?? 0;
  return fromPaise(paise);
}

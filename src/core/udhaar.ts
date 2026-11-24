// Udhaar (version 1.31): money lent to or borrowed from anyone, kept privately. "Lent to someone" as a category records that money left;
// this says to whom, when, and whether it came back. The person does not need to use the app. Items live in the goals block (goals.ts);
// this file is the logic. Pure: no DOM, no storage, no network.
import { MAX_UDHAAR } from './goals.ts';
import type { Goals, UdhaarItem, UdhaarWay } from './goals.ts';
import { catKey, isValidDate, laterThan, newId, normName, parseAmount, round2 } from './logic.ts';
import { tr } from './i18n.ts';

export interface UdhaarInput { name: string; amount: string; way: UdhaarWay; date: string; note: string }
export type UdhaarChecked = { ok: true; name: string; amount: number; way: UdhaarWay; date: string; note: string } | { ok: false; error: string };
export type UdhaarResult = { ok: true; items: Goals } | { ok: false; error: string };

/** What was typed, checked: a name, an amount above zero, a day that is not in the future, an optional short note. */
export function checkUdhaar(i: UdhaarInput, todayIso: string): UdhaarChecked {
  const name = normName(i.name);
  if (name === '' || name.length > 40) return { ok: false, error: tr('Enter a name of up to 40 characters.') };
  const amount = parseAmount(i.amount);
  if (amount === null) return { ok: false, error: tr('Enter an amount above zero, with at most two decimals.') };
  if (!isValidDate(i.date) || i.date > todayIso) return { ok: false, error: tr('Pick a day that is today or earlier.') };
  const note = normName(i.note);
  if (note.length > 100) return { ok: false, error: tr('The note can be up to 100 characters.') };
  return { ok: true, name, amount, way: i.way, date: i.date, note };
}

const all = (items: Goals): UdhaarItem[] => Object.values(items).filter((v): v is UdhaarItem => v.k === 'u');
const live = (items: Goals): UdhaarItem[] => all(items).filter((u) => !u.x);

export function addUdhaar(items: Goals, i: UdhaarInput, todayIso: string, nowIso: string, id: string = newId()): UdhaarResult {
  const c = checkUdhaar(i, todayIso);
  if (!c.ok) return c;
  if (live(items).length >= MAX_UDHAAR) return { ok: false, error: tr('That is the most entries one account can keep.') };
  const item: UdhaarItem = { id, k: 'u', n: c.name, a: c.amount, w: c.way, d: c.date, m: c.note, s: 0, x: 0, t: nowIso };
  return { ok: true, items: { ...items, [id]: item } };
}

export function editUdhaar(items: Goals, id: string, i: UdhaarInput, todayIso: string, nowIso: string): UdhaarResult {
  const cur = items[id];
  if (cur?.k !== 'u' || cur.x) return { ok: false, error: tr('That entry is gone.') };
  const c = checkUdhaar(i, todayIso);
  if (!c.ok) return c;
  return { ok: true, items: { ...items, [id]: { ...cur, n: c.name, a: c.amount, w: c.way, d: c.date, m: c.note, t: laterThan(cur.t, nowIso) } } };
}

/** Mark it paid back (or open again). A newer change on another phone wins, as with every item. */
export function setUdhaarSettled(items: Goals, id: string, settled: boolean, nowIso: string): Goals {
  const cur = items[id];
  if (cur?.k !== 'u' || cur.x || cur.s === (settled ? 1 : 0)) return items;
  return { ...items, [id]: { ...cur, s: settled ? 1 : 0, t: laterThan(cur.t, nowIso) } };
}

export function removeUdhaar(items: Goals, id: string, nowIso: string): Goals {
  const cur = items[id];
  if (cur?.k !== 'u' || cur.x) return items;
  return { ...items, [id]: { ...cur, x: 1, t: laterThan(cur.t, nowIso) } };
}

/** The entries, open ones first (newest day first), then settled ones. */
export const udhaarList = (items: Goals): UdhaarItem[] =>
  live(items).sort((a, b) => a.s - b.s || (a.d < b.d ? 1 : a.d > b.d ? -1 : a.n.localeCompare(b.n)));

export interface UdhaarPerson { key: string; name: string; net: number; open: number } // net > 0: they owe you; < 0: you owe them
export interface UdhaarTotals { owedToMe: number; iOwe: number; people: UdhaarPerson[] }

/** What is still open, in all and by person (names that differ only in case or spacing are one person). */
export function udhaarTotals(items: Goals): UdhaarTotals {
  const by = new Map<string, UdhaarPerson>();
  for (const u of live(items)) {
    if (u.s) continue;
    const key = catKey(u.n);
    const cur = by.get(key) ?? { key, name: u.n, net: 0, open: 0 };
    cur.net = round2(cur.net + (u.w === 'gave' ? u.a : -u.a));
    cur.open += 1;
    by.set(key, cur);
  }
  const people = [...by.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
  const owedToMe = round2(people.filter((p) => p.net > 0).reduce((s, p) => s + p.net, 0));
  const iOwe = round2(people.filter((p) => p.net < 0).reduce((s, p) => s - p.net, 0));
  return { owedToMe, iOwe, people };
}

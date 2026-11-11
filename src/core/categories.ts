// Pure helpers for the categories and budgets kept in the app itself (Release 4): the built-in list, the person's own
// categories and an optional monthly budget per category. (A plan imported from the spreadsheet is brought across once by
// migratePlan; nothing is imported any more.) No DOM, no storage, no network, so the browser and the Node test runner share this file.
import { GROUPS, catKey, laterThan, normName, parseTs, round2 } from './logic.ts';
import type { Group, PlanData } from './logic.ts';
import { tr } from './i18n.ts';

const MAX_AMOUNT = 1e9;
export const MAX_NAME = 60; // entries.category allows 80; this leaves room and keeps the pickers readable
export const MAX_ITEMS = 300; // what one account may keep (built-ins with a budget or removed, own categories, removed ones)
export const MAX_OWN = 100; // own categories shown at once

// The categories every account starts with. Names are plain words.
export const BUILTIN: readonly { c: string; g: Group }[] = [
  { c: 'Rent', g: 'Spending' },
  { c: 'Groceries', g: 'Spending' },
  { c: 'Eating out', g: 'Spending' },
  { c: 'Transport & fuel', g: 'Spending' },
  { c: 'Bills', g: 'Spending' },
  { c: 'Shopping', g: 'Spending' },
  { c: 'Health', g: 'Spending' },
  { c: 'Other', g: 'Spending' },
  { c: 'Family support', g: 'Family' },
  { c: 'Loan EMI', g: 'EMI' },
  { c: 'Savings', g: 'Saving' },
];

// ---------------------------------------------------------------- names
export function checkName(raw: string): string | null {
  const n = normName(raw);
  if (n === '') return tr('Enter a name for the category.');
  if (n.length > MAX_NAME) return tr('Use at most {0} characters.', MAX_NAME);
  if (catKey(n) === '__proto__') return tr('Choose a different name.'); // would not be a plain key in the map below
  return null;
}

// ---------------------------------------------------------------- what the person set in the app
// One item per category the person touched: a budget on any category, an own category, or a removed one.
// n = the name as typed, g = its group, b = monthly budget in rupees (0 = none), x = 1 when removed, t = when last changed.
// Per category the latest change wins, on every phone alike (the same rule as the due list's Done marks).
export interface MineItem { n: string; g: Group; b: number; x: 0 | 1; t: string }
export type Mine = Record<string, MineItem>;

const builtinOf = (key: string) => BUILTIN.find((b) => catKey(b.c) === key);
// A name such as "constructor" or "toString" must not find what every object inherits.
const own = (m: Mine, key: string): MineItem | undefined => (Object.hasOwn(m, key) ? m[key] : undefined);
// How many categories of the person's own (not built-in, not removed) there are.
const ownCount = (m: Mine): number => Object.values(m).filter((x) => !x.x && !builtinOf(catKey(x.n))).length;

export type Source = 'builtin' | 'mine';
export interface CategoryInfo {
  name: string;
  group: Group;
  source: Source;
  budget: number; // the monthly budget set in the app (0 = none)
}

// Every category the person can pick, grouped in the spreadsheet's order of groups: the built-ins (less the removed ones) and
// the person's own.
export function categoryList(mine: Mine): CategoryInfo[] {
  const map = new Map<string, CategoryInfo>();
  for (const b of BUILTIN) {
    const k = catKey(b.c);
    const m = own(mine, k);
    if (m?.x) continue;
    map.set(k, { name: b.c, group: b.g, source: 'builtin', budget: m?.b ?? 0 });
  }
  const ownCats = Object.entries(mine).filter(([k, m]) => !m.x && !builtinOf(k)).sort((a, b) => a[1].n.localeCompare(b[1].n));
  for (const [k, m] of ownCats) map.set(k, { name: m.n, group: m.g, source: 'mine', budget: m.b });
  const all = [...map.values()];
  return GROUPS.flatMap((g) => all.filter((c) => c.group === g));
}

// The budget view of one month as a plan with a single column, so the month summary needs no special case: each category's
// monthly budget, or "not budgeted" (u) where none is set.
export function planForMonth(mine: Mine, month: string): PlanData {
  const rows = categoryList(mine).map((c) => (c.budget > 0 ? { c: c.name, g: c.group, p: [c.budget] } : { c: c.name, g: c.group, p: [0], u: 1 as const }));
  return { v: 1, months: [month], rows };
}

// ---------------------------------------------------------------- bringing an imported plan across, once
// For each category the old spreadsheet plan listed: its amount for the month nearest to `month` becomes the app's monthly budget,
// and a category the app did not have becomes one of the person's own. A category the person already has an item for (a budget,
// an own category, a removal) is left alone: what was set in the app wins. The time stamp is the import's, so every phone
// that migrates on its own makes the same items.
// The column of the plan nearest to `month`: the month itself, else the first column (a month before the plan) or the last (after it).
const nearestColumn = (plan: PlanData, month: string): number => {
  const i = plan.months.indexOf(month);
  if (i >= 0) return i;
  return month < (plan.months[0] ?? '') ? 0 : plan.months.length - 1;
};

// The import's own time stamp, or the beginning of time when it has none.
function planStamp(plan: PlanData): string {
  const stamp = (plan as { importedAt?: string }).importedAt;
  return typeof stamp === 'string' && Number.isFinite(parseTs(stamp)) ? stamp : new Date(0).toISOString();
}

export function migratePlan(plan: PlanData | null, mine: Mine, month: string): { mine: Mine; added: number } {
  if (!plan?.months.length) return { mine, added: 0 };
  const near = nearestColumn(plan, month);
  const t = planStamp(plan);
  const out: Mine = { ...mine };
  let added = 0;
  for (const r of plan.rows) {
    const name = normName(r.c);
    const k = catKey(name);
    if (checkName(name) !== null || own(out, k)) continue;
    const amount = round2(r.p[near] ?? 0);
    const b = builtinOf(k);
    if (b && !(amount > 0)) continue; // a built-in with no figure needs no item
    if (Object.keys(out).length >= MAX_ITEMS || (!b && ownCount(out) >= MAX_OWN)) break;
    out[k] = { n: b ? b.c : name, g: b ? b.g : r.g, b: amount, x: 0, t };
    added++;
  }
  return { mine: out, added };
}

// ---------------------------------------------------------------- changes (each returns a new map)
function put(mine: Mine, name: string, g: Group, b: number, x: 0 | 1, nowIso: string): Mine {
  const n = normName(name);
  const k = catKey(n);
  const prev = own(mine, k);
  return { ...mine, [k]: { n, g, b, x, t: prev ? laterThan(prev.t, nowIso) : nowIso } };
}

export type AddResult = { ok: true; mine: Mine; name: string } | { ok: false; error: string };

// Add an own category. A name that belongs to a removed built-in (or a removed own category) brings it back.
export function addCategory(mine: Mine, visible: CategoryInfo[], rawName: string, group: Group, nowIso: string): AddResult {
  const bad = checkName(rawName);
  if (bad) return { ok: false, error: bad };
  const name = normName(rawName);
  const k = catKey(name);
  if (visible.some((c) => catKey(c.name) === k)) return { ok: false, error: tr('"{0}" is already in your list.', name) };
  if (!(GROUPS as readonly string[]).includes(group)) return { ok: false, error: tr('Pick a group.') };
  const prev = own(mine, k);
  if (!prev && Object.keys(mine).length >= MAX_ITEMS) return { ok: false, error: tr('Too many categories.') };
  if (!builtinOf(k) && ownCount(mine) >= MAX_OWN) {
    return { ok: false, error: tr('You can keep at most {0} categories of your own.', MAX_OWN) };
  }
  const b = builtinOf(k);
  return { ok: true, mine: put(mine, b ? b.c : name, b ? b.g : group, prev?.b ?? 0, 0, nowIso), name: b ? b.c : name };
}

// Remove a category from the pickers. Payments already logged under it keep their name. The plan's own categories
// cannot be removed here: they come from the spreadsheet.
export function removeCategory(mine: Mine, info: CategoryInfo, nowIso: string): Mine {
  return put(mine, info.name, info.group, own(mine, catKey(info.name))?.b ?? info.budget, 1, nowIso);
}

// Set (or clear, with 0) the monthly budget. Amounts are rounded to paise; nothing changes when the value is the same.
export function setBudget(mine: Mine, info: CategoryInfo, amount: number, nowIso: string): Mine {
  const b = round2(amount);
  const prev = own(mine, catKey(info.name));
  if ((prev?.b ?? 0) === b) return mine;
  if (!prev && Object.keys(mine).length >= MAX_ITEMS) return mine;
  return put(mine, info.name, prev?.g ?? info.group, b, prev?.x ?? 0, nowIso);
}

// ---------------------------------------------------------------- sync and backup
export function mergeMine(local: Mine, remote: Mine): Mine {
  const out: Mine = { ...remote };
  for (const [k, v] of Object.entries(local)) {
    const r = own(out, k);
    if (!r || parseTs(v.t) >= parseTs(r.t)) out[k] = v;
  }
  return out;
}

export function sameMine(a: Mine, b: Mine): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => {
    const x = a[k]!;
    const y = own(b, k);
    return y !== undefined && x.n === y.n && x.g === y.g && x.b === y.b && x.x === y.x && x.t === y.t;
  });
}

// Validate what comes from the server or a backup. Anything malformed is dropped, never repaired.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanMine(p: any): Mine {
  const out: Mine = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p as Record<string, any>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!v || typeof v.n !== 'string' || checkName(v.n) !== null || normName(v.n) !== v.n || catKey(v.n) !== k) continue;
    if (!(GROUPS as readonly string[]).includes(v.g)) continue;
    if (typeof v.b !== 'number' || !Number.isFinite(v.b) || v.b < 0 || v.b >= MAX_AMOUNT || round2(v.b) !== v.b) continue;
    if (v.x !== 0 && v.x !== 1) continue;
    if (!Number.isFinite(parseTs(v.t))) continue;
    out[k] = { n: v.n, g: v.g as Group, b: v.b, x: v.x, t: v.t };
    if (Object.keys(out).length >= MAX_ITEMS) break;
  }
  return out;
}

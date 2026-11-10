// Pure helpers for the categories and budgets kept in the app itself (Release 4): the built-in list, the person's own
// categories, an optional monthly budget per category, and how all of that merges with a plan imported from the
// spreadsheet. No DOM, no storage, no network, so the browser and the Node test runner share this file.
import { GROUPS, catKey, laterThan, normName, parseTs, round2 } from './logic.ts';
import type { Group, PlanData } from './logic.ts';
import { tr } from './i18n.ts';

const MAX_AMOUNT = 1e9;
export const MAX_NAME = 60; // entries.category allows 80; this leaves room and keeps the pickers readable
export const MAX_ITEMS = 300; // what one account may keep (built-ins with a budget or removed, own categories, removed ones)
export const MAX_OWN = 100; // own categories shown at once

// The categories every account starts with. Names are plain words; the spreadsheet's own list can differ, and the
// Export screen says which names the spreadsheet does not know.
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

export type Source = 'builtin' | 'mine' | 'plan';
export interface CategoryInfo {
  name: string;
  group: Group;
  source: Source;
  budget: number; // the monthly budget set in the app; the plan's own figures take over in the months it covers
}

// Every category the person can pick, grouped in the spreadsheet's order of groups. A category in the imported plan
// keeps the plan's spelling, group and amounts; the built-ins and own categories stay beside it (merge, not replace).
export function categoryList(plan: PlanData | null, mine: Mine): CategoryInfo[] {
  const map = new Map<string, CategoryInfo>();
  for (const b of BUILTIN) {
    const k = catKey(b.c);
    const m = own(mine, k);
    if (m?.x) continue;
    map.set(k, { name: b.c, group: b.g, source: 'builtin', budget: m?.b ?? 0 });
  }
  const ownCats = Object.entries(mine).filter(([k, m]) => !m.x && !builtinOf(k)).sort((a, b) => a[1].n.localeCompare(b[1].n));
  for (const [k, m] of ownCats) map.set(k, { name: m.n, group: m.g, source: 'mine', budget: m.b });
  for (const r of plan?.rows ?? []) {
    const k = catKey(r.c);
    map.set(k, { name: r.c, group: r.g, source: 'plan', budget: map.get(k)?.budget ?? own(mine, k)?.b ?? 0 });
  }
  const all = [...map.values()];
  return GROUPS.flatMap((g) => all.filter((c) => c.group === g));
}

// The budget view of one month as a plan with a single column, so the month summary needs no special case:
// a budget set in the app wins for its category (so a spreadsheet figure can be changed in the app; clear it to go back to the
// spreadsheet's); otherwise the spreadsheet's figure where the plan covers the month.
export function planForMonth(plan: PlanData | null, mine: Mine, month: string): PlanData {
  const mi = plan ? plan.months.indexOf(month) : -1;
  const fromPlan = new Map((plan?.rows ?? []).map((r) => [catKey(r.c), r]));
  const rows = categoryList(plan, mine).map((c) => {
    const r = fromPlan.get(catKey(c.name));
    if (r && mi >= 0 && !(c.budget > 0)) return { c: c.name, g: c.group, p: [r.p[mi] ?? 0] };
    return c.budget > 0 ? { c: c.name, g: c.group, p: [c.budget] } : { c: c.name, g: c.group, p: [0], u: 1 as const };
  });
  return { v: 1, months: [month], rows };
}

export const planCovers = (plan: PlanData | null, month: string): boolean => Boolean(plan?.months.includes(month));

// Categories (case-insensitively) that a plan imported from the spreadsheet does not list. Empty when no plan is imported,
// because then the app has no way to know what the spreadsheet holds.
export function missingFromPlan(names: Iterable<string>, plan: PlanData | null): string[] {
  if (!plan) return [];
  const known = new Set(plan.rows.map((r) => catKey(r.c)));
  const out = new Map<string, string>();
  for (const n of names) {
    const k = catKey(n);
    if (!known.has(k) && !out.has(k)) out.set(k, normName(n));
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b));
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
  if (!builtinOf(k) && Object.values(mine).filter((m) => !m.x && !builtinOf(catKey(m.n))).length >= MAX_OWN) {
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

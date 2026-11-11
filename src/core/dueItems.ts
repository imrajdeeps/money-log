// The due list made in the app: one-off payments and to-dos with an optional date (and, for payments, an amount). Pure, like
// goals.ts, whose block they live in (kind 'd'): one item per entry, merged item by item, the latest change wins, removed ones
// stay (marked) so the removal reaches the other phones. This replaces the list imported from the spreadsheet; migrateDue
// brings an already imported list across once.
import { isDone, isRemoved } from './blocks.ts';
import type { DoneMap, DueItem } from './blocks.ts';
import { MAX_DUE_ENTRIES, MAX_DUE_TITLE } from './goals.ts';
import type { DueEntry, DueEntryKind, GoalResult, Goals } from './goals.ts';
import { MAX_AMOUNT, isValidDate, newId, normName, parseTs, round2 } from './logic.ts';
import { tr } from './i18n.ts';

export interface DueInput { kind: DueEntryKind; title: string; date: string; amount: number } // date '' = none, amount 0 = none

export function checkDueInput(i: DueInput): string | null {
  const t = normName(i.title);
  if (t === '' || t.length > MAX_DUE_TITLE) return tr('Give it a title of up to {0} characters.', MAX_DUE_TITLE);
  if (i.kind !== 'oneoff' && i.kind !== 'todo') return tr('Choose a payment or a to-do.');
  if (i.date !== '' && !isValidDate(i.date)) return tr('Pick a date, or leave it empty.');
  if (i.kind === 'oneoff' && !(typeof i.amount === 'number' && Number.isFinite(i.amount) && i.amount >= 0 && i.amount < MAX_AMOUNT && round2(i.amount) === i.amount)) {
    return tr('Enter an amount with at most two decimals, or leave it empty.');
  }
  return null;
}

const entryOf = (i: DueInput, id: string, f: 0 | 1, nowIso: string): DueEntry =>
  ({ id, k: 'd', kind: i.kind, n: normName(i.title), d: i.date, a: i.kind === 'oneoff' ? i.amount : 0, f, x: 0, t: nowIso });

const dueCount = (items: Goals) => Object.values(items).filter((x) => x.k === 'd').length;

export function addDueItem(items: Goals, i: DueInput, nowIso: string, id: string = newId()): GoalResult {
  const error = checkDueInput(i);
  if (error) return { ok: false, error };
  if (dueCount(items) >= MAX_DUE_ENTRIES) return { ok: false, error: tr('That is the most due items one account can keep. Remove some old ones.') };
  return { ok: true, items: { ...items, [id]: entryOf(i, id, 0, nowIso) } };
}

export function editDueItem(items: Goals, id: string, i: DueInput, nowIso: string): GoalResult {
  const cur = items[id];
  if (!cur || cur.k !== 'd' || cur.x) return { ok: false, error: tr('That item is gone.') };
  const error = checkDueInput(i);
  if (error) return { ok: false, error };
  return { ok: true, items: { ...items, [id]: entryOf(i, id, cur.f, nowIso) } };
}

export function setDueItemDone(items: Goals, id: string, done: boolean, nowIso: string): Goals {
  const cur = items[id];
  if (!cur || cur.k !== 'd' || cur.x || cur.f === (done ? 1 : 0)) return items;
  return { ...items, [id]: { ...cur, f: done ? 1 : 0, t: nowIso } };
}

export function removeDueItem(items: Goals, id: string, nowIso: string): Goals {
  const cur = items[id];
  return !cur || cur.k !== 'd' || cur.x ? items : { ...items, [id]: { ...cur, x: 1, t: nowIso } };
}

/** The entries still kept, as the due list's items (the key is the entry's id), ready for classifyDue with no marks. */
export const dueItemsOf = (items: Goals): DueItem[] =>
  Object.values(items).filter((x): x is DueEntry => x.k === 'd' && !x.x)
    .map((e) => ({ k: e.id, kind: e.kind, title: e.n, due: e.d === '' ? null : e.d, amount: e.a > 0 ? e.a : null, done: e.f === 1 }));

export const dueEntry = (items: Goals, id: string): DueEntry | null => {
  const e = items[id];
  return e && e.k === 'd' && !e.x ? e : null;
};

// ---------------------------------------------------------------- bringing an imported list across, once
// The same id for the same imported item on every phone (so two phones migrating on their own never make copies) and the same
// time stamp, so the result is identical; anything the person already changed in the app is newer and wins.
function idOf(key: string): string {
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b1, 0x85ebca6b].map((seed, r) => {
    let h = seed >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i) ^ r, 0x01000193) >>> 0;
    return h.toString(16).padStart(8, '0');
  }).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const migratedDueId = (key: string): string => idOf(`due|${key}`);

export function migrateDue(block: { items: DueItem[]; importedAt: string } | null, marks: DoneMap, existing: Goals): { items: Goals; added: number } {
  if (!block) return { items: existing, added: 0 };
  const out: Goals = { ...existing };
  let added = 0;
  for (const it of block.items) {
    if (isRemoved(it, marks, block.importedAt)) continue;
    const id = migratedDueId(it.k);
    if (Object.hasOwn(out, id)) continue;
    if (dueCount(out) >= MAX_DUE_ENTRIES) break;
    const m = marks[it.k];
    const stamp = m && parseTs(m.t) > parseTs(block.importedAt) ? m.t : block.importedAt;
    const title = normName(it.title);
    if (title === '' || title.length > MAX_DUE_TITLE) continue;
    out[id] = { id, k: 'd', kind: it.kind, n: title, d: it.due ?? '', a: it.kind === 'oneoff' ? (it.amount ?? 0) : 0, f: isDone(it, marks, block.importedAt) ? 1 : 0, x: 0, t: stamp };
    added++;
  }
  return { items: out, added };
}

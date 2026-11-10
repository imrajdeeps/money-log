// The backup file: every payment, the plan blocks and the Done marks, as one JSON document. Pure, like logic.ts.
import { cleanDoneMap, cleanDue, cleanNet } from './blocks.ts';
import type { DoneMap, DueBlock, DueData, NetBlock, NetData } from './blocks.ts';
import { cleanMine } from './categories.ts';
import type { Mine } from './categories.ts';
import { cleanRecurring } from './recurring.ts';
import type { Recurring } from './recurring.ts';
import { cleanEntry, cleanPlan, parseTs } from './logic.ts';
import type { Entry, Plan, PlanData } from './logic.ts';

// What a backup may hold beyond payments and the budget plan. Every field is optional, so a Release 1 backup still loads.
export interface BackupExtras { due?: DueBlock | null; networth?: NetBlock | null; dueDone?: DoneMap; categories?: Mine; recurring?: Recurring }

export interface Backup {
  app: 'money-log';
  v: 1;
  exportedAt: string;
  entries: Omit<Entry, 'dirty'>[];
  plan: (PlanData & { importedAt: string }) | null;
  due?: (DueData & { importedAt: string }) | null;
  networth?: (NetData & { importedAt: string }) | null;
  dueDone?: DoneMap;
  categories?: Mine; // the person's own categories and budgets
  recurring?: Recurring; // payments that repeat every month
}

// Only payments this account made go in: a backup is a copy of your own data, never of what others shared with you.
export function makeBackup(entries: Entry[], plan: Plan | null, nowIso: string, extras: BackupExtras = {}): Backup {
  const out: Backup = {
    app: 'money-log',
    v: 1,
    exportedAt: nowIso,
    entries: entries.map(({ dirty: _dirty, ...e }) => e),
    plan: plan ? { v: plan.v, months: plan.months, rows: plan.rows, importedAt: plan.importedAt } : null,
  };
  if (extras.due) out.due = { v: 1, items: extras.due.items, importedAt: extras.due.importedAt };
  if (extras.networth) out.networth = { v: 1, asOf: extras.networth.asOf, items: extras.networth.items, importedAt: extras.networth.importedAt };
  if (extras.dueDone && Object.keys(extras.dueDone).length) out.dueDone = extras.dueDone;
  if (extras.categories && Object.keys(extras.categories).length) out.categories = extras.categories;
  if (extras.recurring && Object.keys(extras.recurring).length) out.recurring = extras.recurring;
  return out;
}

export type BackupParse =
  | {
      ok: true;
      entries: Entry[];
      plan: (PlanData & { importedAt: string }) | null;
      due: (DueData & { importedAt: string }) | null;
      networth: (NetData & { importedAt: string }) | null;
      dueDone: DoneMap;
      categories: Mine;
      recurring: Recurring;
      skipped: number;
    }
  | { ok: false; error: string };

export function parseBackup(text: string): BackupParse {
  let j: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { j = JSON.parse(text); } catch { return { ok: false, error: 'This is not a Money Log backup (not valid JSON).' }; }
  if (!j || j.app !== 'money-log' || j.v !== 1 || !Array.isArray(j.entries)) return { ok: false, error: 'This is not a Money Log backup file.' };
  const entries: Entry[] = [];
  let skipped = 0;
  for (const e of j.entries) {
    const c = cleanEntry({ ...e, dirty: 1 });
    if (c) entries.push(c); else skipped++;
  }
  const withDate = <T extends object>(clean: (p: unknown) => T | null, raw: any): (T & { importedAt: string }) | null => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!raw) return null;
    const c = clean(raw);
    return c && Number.isFinite(parseTs(raw.importedAt)) ? { ...c, importedAt: raw.importedAt as string } : null;
  };
  return {
    ok: true,
    entries,
    plan: withDate(cleanPlan, j.plan),
    due: withDate(cleanDue, j.due),
    networth: withDate(cleanNet, j.networth),
    dueDone: cleanDoneMap(j.dueDone),
    categories: cleanMine(j.categories),
    recurring: cleanRecurring(j.recurring),
    skipped,
  };
}

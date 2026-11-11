// The backup file, the only file that goes in and out of the app: every payment of your own, your categories and budgets, the
// payments that repeat, and the goals block (goals, top-ups, net worth, due list), as one JSON document. Pure, like logic.ts.
// A backup made by an older version may also hold the spreadsheet plan, the imported due list and its marks: they are read
// (and brought across when restored) but never written again.
import { cleanDoneMap, cleanDue } from '../core/blocks.ts';
import type { DoneMap, DueData } from '../core/blocks.ts';
import { cleanMine } from '../core/categories.ts';
import type { Mine } from '../core/categories.ts';
import { cleanGoals } from '../core/goals.ts';
import type { Goals } from '../core/goals.ts';
import { cleanRecurring } from '../core/recurring.ts';
import type { Recurring } from '../core/recurring.ts';
import { cleanEntry, cleanPlan, parseTs } from '../core/logic.ts';
import type { Entry, PlanData } from '../core/logic.ts';
import { tr } from '../core/i18n.ts';

// What a backup may hold beyond payments. Every field is optional, so a Release 1 backup still loads.
export interface BackupExtras { categories?: Mine; recurring?: Recurring; goals?: Goals }

export interface Backup {
  app: 'money-log';
  v: 1;
  exportedAt: string;
  entries: Omit<Entry, 'dirty'>[];
  categories?: Mine; // the person's own categories and budgets
  recurring?: Recurring; // payments that repeat every month
  goals?: Goals; // goals, top-ups, net worth updates and the due list
}

// Only payments this account made go in: a backup is a copy of your own data, never of what others shared with you.
export function makeBackup(entries: Entry[], nowIso: string, extras: BackupExtras = {}): Backup {
  const out: Backup = {
    app: 'money-log',
    v: 1,
    exportedAt: nowIso,
    entries: entries.map(({ dirty: _dirty, ...e }) => e),
  };
  if (extras.categories && Object.keys(extras.categories).length) out.categories = extras.categories;
  if (extras.recurring && Object.keys(extras.recurring).length) out.recurring = extras.recurring;
  if (extras.goals && Object.keys(extras.goals).length) out.goals = extras.goals;
  return out;
}

export type BackupParse =
  | {
      ok: true;
      entries: Entry[];
      plan: (PlanData & { importedAt: string }) | null;
      due: (DueData & { importedAt: string }) | null;
      dueDone: DoneMap;
      categories: Mine;
      recurring: Recurring;
      goals: Goals;
      skipped: number;
    }
  | { ok: false; error: string };

export function parseBackup(text: string): BackupParse {
  let j: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { j = JSON.parse(text); } catch { return { ok: false, error: tr('This is not a Money Log backup (not valid JSON).') }; }
  if (j?.app !== 'money-log' || j.v !== 1 || !Array.isArray(j.entries)) return { ok: false, error: tr('This is not a Money Log backup file.') };
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
    dueDone: cleanDoneMap(j.dueDone),
    categories: cleanMine(j.categories),
    recurring: cleanRecurring(j.recurring),
    goals: cleanGoals(j.goals),
    skipped,
  };
}

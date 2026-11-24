// The blocks that travel as one row each, made in the app and merged item by item. One table says how each is cleaned, merged and compared.
import { cleanMine, mergeMine, sameMine } from '../core/categories.ts';
import type { Mine } from '../core/categories.ts';
import { cleanGoals, mergeGoals, purgeRemoved, sameGoals } from '../core/goals.ts';
import type { Goals } from '../core/goals.ts';
import { cleanRecurring, mergeRecurring, sameRecurring } from '../core/recurring.ts';
import type { Recurring } from '../core/recurring.ts';

// The blocks made in the app, merged per item (the latest change to each item wins) and synced as one row each: the
// categories and budgets the person set, the payments that repeat every month, and the goals block (goals, top-ups, net worth
// updates and the due list). Nothing is imported from the spreadsheet any more; old stored imports are brought across by
// data/legacy.ts.
export interface MineBlock { items: Mine; dirty: 0 | 1 }
export interface RecurBlock { items: Recurring; dirty: 0 | 1 }
export interface GoalsBlock { items: Goals; dirty: 0 | 1 }
// The profile (one row per account, not a plan block): the phone's copy, when it last changed (t) and whether it still has to go up.
export interface ProfileBlock { name: string; whatsapp: string; t: string; dirty: 0 | 1 }
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Items = Record<string, any>;
// tidy: what is done to a copy after it is merged (and to the cloud's copy before): old removals are cleared. Applied to both sides, so
// a removal cleared on this phone is not merged back from the cloud's older copy, and the two copies can settle on the same block.
const keep = (items: Items): Items => items;
export const MERGED: { block: string; meta: string; clean: (p: unknown) => Items; merge: (a: Items, b: Items) => Items; same: (a: Items, b: Items) => boolean; tidy: (items: Items, nowIso: string) => Items }[] = [
  { block: 'categories', meta: 'mine', clean: cleanMine, merge: mergeMine, same: sameMine, tidy: keep },
  { block: 'recurring', meta: 'recurring', clean: cleanRecurring, merge: mergeRecurring, same: sameRecurring, tidy: keep },
  { block: 'goals', meta: 'goals', clean: cleanGoals, merge: mergeGoals, same: sameGoals, tidy: purgeRemoved },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

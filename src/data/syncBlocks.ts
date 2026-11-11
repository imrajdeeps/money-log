// The blocks that travel as one row each, made in the app and merged item by item. One table says how each is cleaned, merged and compared.
import { cleanMine, mergeMine, sameMine } from '../core/categories.ts';
import type { Mine } from '../core/categories.ts';
import { cleanGoals, mergeGoals, sameGoals } from '../core/goals.ts';
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
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Items = Record<string, any>;
export const MERGED: { block: string; meta: string; clean: (p: unknown) => Items; merge: (a: Items, b: Items) => Items; same: (a: Items, b: Items) => boolean }[] = [
  { block: 'categories', meta: 'mine', clean: cleanMine, merge: mergeMine, same: sameMine },
  { block: 'recurring', meta: 'recurring', clean: cleanRecurring, merge: mergeRecurring, same: sameRecurring },
  { block: 'goals', meta: 'goals', clean: cleanGoals, merge: mergeGoals, same: sameGoals },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

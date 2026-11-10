// The blocks that travel as one row each: imported from the spreadsheet (replaced as a unit) and made in the app
// (merged item by item). One table says how each is cleaned, merged and compared.
import { cleanDoneMap, cleanDue, cleanNet, mergeDone, sameDone } from '../core/blocks.ts';
import type { DoneMap } from '../core/blocks.ts';
import { cleanMine, mergeMine, sameMine } from '../core/categories.ts';
import type { Mine } from '../core/categories.ts';
import { cleanGoals, mergeGoals, sameGoals } from '../core/goals.ts';
import type { Goals } from '../core/goals.ts';
import { cleanRecurring, mergeRecurring, sameRecurring } from '../core/recurring.ts';
import type { Recurring } from '../core/recurring.ts';
import { cleanPlan } from '../core/logic.ts';

// The plan blocks imported from the spreadsheet. Each is kept whole on the phone as { ...data, importedAt, dirty } and
// replaced as a unit; the latest import wins. 'budget' keeps its Release 1 storage key.
export type BlockName = 'budget' | 'due' | 'networth';
export const BLOCKS: Record<BlockName, { meta: string; clean: (p: unknown) => object | null }> = {
  budget: { meta: 'plan', clean: cleanPlan },
  due: { meta: 'block:due', clean: cleanDue },
  networth: { meta: 'block:networth', clean: cleanNet },
};
export const BLOCK_NAMES = Object.keys(BLOCKS) as BlockName[];
export const isBlock = (n: unknown): n is BlockName => typeof n === 'string' && Object.hasOwn(BLOCKS, n);
export interface StoredBlock { importedAt: string; dirty: 0 | 1 }
// Two more blocks are made in the app instead of imported, merged per item (the latest change to each item wins) and
// synced as one row each: the Done marks on the due list, the categories and budgets the person set, and the payments
// that repeat every month.
export interface DueDone { items: DoneMap; dirty: 0 | 1 }
export interface MineBlock { items: Mine; dirty: 0 | 1 }
export interface RecurBlock { items: Recurring; dirty: 0 | 1 }
export interface GoalsBlock { items: Goals; dirty: 0 | 1 }
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Items = Record<string, any>;
export const MERGED: { block: string; meta: string; clean: (p: unknown) => Items; merge: (a: Items, b: Items) => Items; same: (a: Items, b: Items) => boolean }[] = [
  { block: 'due_done', meta: 'dueDone', clean: cleanDoneMap, merge: mergeDone, same: sameDone },
  { block: 'categories', meta: 'mine', clean: cleanMine, merge: mergeMine, same: sameMine },
  { block: 'recurring', meta: 'recurring', clean: cleanRecurring, merge: mergeRecurring, same: sameRecurring },
  { block: 'goals', meta: 'goals', clean: cleanGoals, merge: mergeGoals, same: sameGoals },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

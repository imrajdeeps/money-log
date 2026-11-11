// Brings what older versions imported from the spreadsheet into the app's own data, once per phone: the due list becomes due items,
// the plan's amounts become budgets, and the old stored blocks are deleted (so this finds nothing the next time). The ids and time
// stamps are made from the imported data itself, so two phones migrating on their own end up with the same items.
import { cleanDoneMap, cleanDue } from '../core/blocks.ts';
import type { DueBlock } from '../core/blocks.ts';
import { migratePlan } from '../core/categories.ts';
import { migrateDue } from '../core/dueItems.ts';
import { cleanPlan, monthOf, parseTs } from '../core/logic.ts';
import type { PlanData } from '../core/logic.ts';
import type { Store } from './store.ts';
import type { GoalsBlock, MineBlock } from './syncBlocks.ts';

/** The keys the old imports were kept under. */
export const LEGACY_KEYS = ['plan', 'block:due', 'dueDone', 'block:networth'] as const;

const stored = <T extends object>(clean: (p: unknown) => T | null, raw: unknown): (T & { importedAt: string }) | null => {
  if (!raw || typeof raw !== 'object') return null;
  const c = clean(raw);
  const at = (raw as { importedAt?: unknown }).importedAt;
  return c && typeof at === 'string' && Number.isFinite(parseTs(at)) ? { ...c, importedAt: at } : null;
};

/** Returns how many due items and budgets were brought across. */
export async function migrateLegacy(store: Store, todayIso: string): Promise<{ due: number; budgets: number }> {
  let due = 0;
  let budgets = 0;
  const block = stored(cleanDue, await store.getMeta('block:due')) as DueBlock | null;
  const marks = cleanDoneMap((await store.getMeta<{ items?: unknown }>('dueDone'))?.items);
  if (block) {
    await store.mutateMeta<GoalsBlock>('goals', (cur) => {
      const r = migrateDue(block, marks, cur?.items ?? {});
      due = r.added;
      return r.added > 0 ? { items: r.items, dirty: 1 } : undefined;
    });
  }
  const plan = stored(cleanPlan as (p: unknown) => PlanData | null, await store.getMeta('plan'));
  if (plan) {
    await store.mutateMeta<MineBlock>('mine', (cur) => {
      const r = migratePlan(plan, cur?.items ?? {}, monthOf(todayIso));
      budgets = r.added;
      return r.added > 0 ? { items: r.mine, dirty: 1 } : undefined;
    });
  }
  for (const k of LEGACY_KEYS) if ((await store.getMeta(k)) !== undefined) await store.delMeta(k);
  return { due, budgets };
}

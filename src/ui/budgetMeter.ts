// What the budget meter says, as plain functions: the words under it, its colour and how full it is.
import { fmtINR, nearBudget } from '../core/logic.ts';
import type { BudgetState } from '../core/logic.ts';
import type { MeterTone } from './styles.ts';
import { tr } from '../core/i18n.ts';

// The words under the meter: what is left, how much is over, or for savings how far they are from the plan.
export function budgetText(saving: boolean, spent: number, planned: number): string {
  const diff = planned - spent;
  if (saving) {
    if (!(planned > 0)) return '';
    return spent >= planned ? tr('on track') : tr('{0} to go', fmtINR(Math.max(0, diff)));
  }
  if (diff >= 0) return tr('{0} left{1}', fmtINR(diff), nearBudget(spent, planned) ? tr(', nearly used') : '');
  return tr('{0} over', fmtINR(-diff));
}

// The colour of the meter.
export function meterTone(state: BudgetState, saving: boolean, spent: number, planned: number): MeterTone {
  if (state === 'over' || state === 'short') return 'bad';
  if (saving) return planned > 0 ? 'good' : 'idle';
  if (state === 'idle') return 'idle';
  return nearBudget(spent, planned) ? 'warn' : 'accent';
}

// How full the meter is, 0 to 100: spending against the plan (anything spent with no plan fills it).
export function fillPercent(spent: number, planned: number): number {
  if (planned > 0) return Math.min(100, (spent / planned) * 100);
  return spent > 0 ? 100 : 0;
}

import { budgetState } from '../core/logic.ts';
import type { Group } from '../core/logic.ts';
import { budgetText, fillPercent, meterTone, wordsTone } from './budgetMeter.ts';
import * as ui from './styles.ts';
import { tr } from '../core/i18n.ts';

// How far a group or category is into its budget: a 6px meter and the words for it in a small tag, so the state never rests on
// colour alone (the design's group tiles). The meter is the accent colour while there is room, amber from 85% of the budget and when it is used up, red
// once it is over (an EMI paid in full stays as planned); savings fill in the accent colour toward the plan.
export function BudgetLine({ group, spent, planned, over, budgeted }: Readonly<{ group: Group; spent: number; planned: number; over: boolean; budgeted: boolean }>) {
  if (!budgeted) return <><div className={ui.meter('idle', 'm-0')} aria-hidden="true"><i style={{ width: '0%' }} /></div><span className={ui.meterWords()}>{spent > 0 ? tr('No budget · set one') : tr('No budget')}</span></>;
  const state = budgetState(group, spent, planned, over);
  const saving = group === 'Saving';
  const emi = group === 'EMI';
  const tone = meterTone(state, saving, spent, planned, emi);
  return (
    <>
      <div className={ui.meter(tone, 'm-0')} aria-hidden="true"><i style={{ width: `${fillPercent(spent, planned)}%` }} /></div>
      <span className={ui.meterWords(wordsTone(tone, saving))}>{budgetText(saving, spent, planned, emi)}</span>
    </>
  );
}

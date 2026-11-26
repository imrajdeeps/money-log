import { budgetState } from '../core/logic.ts';
import type { Group } from '../core/logic.ts';
import { budgetText, fillPercent, meterTone } from './budgetMeter.ts';
import * as ui from './styles.ts';
import { tr } from '../core/i18n.ts';

// How far a group or category is into its budget: a thin meter and the words for it, so the state never rests on colour
// alone. The meter is the brand colour while there is room, amber from 80% of the budget, rose once it is over; savings
// fill in emerald as they grow toward the plan.
export function BudgetLine({ group, spent, planned, over, budgeted }: Readonly<{ group: Group; spent: number; planned: number; over: boolean; budgeted: boolean }>) {
  if (!budgeted) return <><div className={ui.meter('idle')} aria-hidden="true"><i style={{ width: '0%' }} /></div><span className={ui.meterWords()}>{tr('no budget')}</span></>;
  const state = budgetState(group, spent, planned, over);
  const saving = group === 'Saving';
  const tone = meterTone(state, saving, spent, planned);
  const words = tone === 'bad' || tone === 'warn' ? tone : saving && state === 'ok' ? 'good' : '';
  return (
    <>
      <div className={ui.meter(tone)} aria-hidden="true"><i style={{ width: `${fillPercent(spent, planned)}%` }} /></div>
      <span className={ui.meterWords(words || (tone === 'accent' ? 'good' : ''))}>{budgetText(saving, spent, planned)}</span>
    </>
  );
}

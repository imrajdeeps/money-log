import { budgetState } from '../core/logic.ts';
import type { Group } from '../core/logic.ts';
import { budgetText, fillPercent, meterTone, wordsTone } from './budgetMeter.ts';
import * as ui from './styles.ts';
import { tr } from '../core/i18n.ts';

// How far a group or category is into its budget: a 6px meter and the words for it in a small tag, so the state never rests on
// colour alone (the design's group tiles). The meter is the accent colour while there is room, amber from 90% of the budget, red
// once it is over, green when exactly all is paid; savings fill in the accent colour toward the plan.
export function BudgetLine({ group, spent, planned, over, budgeted }: Readonly<{ group: Group; spent: number; planned: number; over: boolean; budgeted: boolean }>) {
  if (!budgeted) return <><div className={ui.meter('idle', 'm-0')} aria-hidden="true"><i style={{ width: '0%' }} /></div><span className={ui.meterWords()}>{tr('no budget')}</span></>;
  const state = budgetState(group, spent, planned, over);
  const saving = group === 'Saving';
  const tone = meterTone(state, saving, spent, planned);
  return (
    <>
      <div className={ui.meter(tone, 'm-0')} aria-hidden="true"><i style={{ width: `${fillPercent(spent, planned)}%` }} /></div>
      <span className={ui.meterWords(wordsTone(tone, saving))}>{budgetText(saving, spent, planned)}</span>
    </>
  );
}

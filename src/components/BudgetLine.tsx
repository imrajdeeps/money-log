import { budgetState, fmtINR, nearBudget } from '../logic.ts';
import type { Group } from '../logic.ts';

// How far a group or category is into its budget: a thin meter and the words for it, so the state never rests on colour
// alone. The meter is the brand colour while there is room, amber from 80% of the budget, rose once it is over; savings
// fill in emerald as they grow toward the plan.
export function BudgetLine({ group, spent, planned, over, budgeted }: { group: Group; spent: number; planned: number; over: boolean; budgeted: boolean }) {
  if (!budgeted) return <><div className="bar meter-idle" aria-hidden="true"><i style={{ width: '0%' }} /></div><span className="left">no budget</span></>;
  const st = budgetState(group, spent, planned, over);
  const saving = group === 'Saving';
  const diff = planned - spent;
  let text = '';
  if (saving) text = spent >= planned && planned > 0 ? 'on track' : planned > 0 ? `${fmtINR(Math.max(0, diff))} to go` : '';
  else text = diff >= 0 ? `${fmtINR(diff)} left${nearBudget(spent, planned) ? ', nearly used' : ''}` : `${fmtINR(-diff)} over`;
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : spent > 0 ? 100 : 0;
  let tone: 'good' | 'bad' | 'warn' | 'accent' | 'idle';
  if (st === 'over' || st === 'short') tone = 'bad';
  else if (saving) tone = planned > 0 ? 'good' : 'idle';
  else if (st === 'idle') tone = 'idle';
  else tone = nearBudget(spent, planned) ? 'warn' : 'accent';
  const words = tone === 'bad' || tone === 'warn' ? tone : saving && st === 'ok' ? 'good' : '';
  return (
    <>
      <div className={`bar meter-${tone}`} aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      <span className={`left ${words}`}>{text}</span>
    </>
  );
}

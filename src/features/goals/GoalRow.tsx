import { SwipeRow } from '../../ui/SwipeRow.tsx';
import type { Goal, GoalLine, GoalProgress, TopUp } from '../../core/goals.ts';
import { TopUps } from './TopUps.tsx';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

function lineText(line: GoalLine): string {
  if (line.state === 'reached') return tr('Reached');
  if (line.state === 'passed') return tr('The date has passed with {0} still to go. Change the date, or add what you have set aside.', fmtINR(line.remaining));
  return tr('Needs {0} a month for {1} {2}', fmtINR(line.monthly), line.months, line.months === 1 ? 'month' : 'months');
}

// One goal: what is saved of the target, a bar, the date, and a line saying what it needs. Slide it left to remove it.
export function GoalRow({ goal, progress, line, topUps, onEdit, onRemove }: Readonly<{ goal: Goal; progress: GoalProgress; line: GoalLine; topUps: TopUp[]; onEdit: () => void; onRemove: () => void }>) {
  const parts = [
    progress.fromStart > 0 ? tr('{0} at the start', fmtINR(progress.fromStart)) : null,
    progress.fromTopUps > 0 ? tr('{0} in top-ups', fmtINR(progress.fromTopUps)) : null,
    progress.fromPayments > 0 ? tr('{0} from {1} payments', fmtINR(progress.fromPayments), goal.c) : null,
  ].filter(Boolean);
  const tone = line.state === 'reached' ? 'good' : line.state === 'passed' ? 'bad' : 'accent';
  return (
    <li>
    <SwipeRow as="div" className="px-3.5 py-3" label={goal.n} onDelete={onRemove}>
      <button type="button" className="flex w-full cursor-pointer items-start justify-between gap-3 border-0 bg-transparent p-0 text-left text-inherit [font:inherit]" onClick={onEdit} aria-label={tr('Change goal: {0}', goal.n)}>
        <span className={ui.rowMain()}><b>{goal.n}</b><small>{tr('by {0}', shortDate(goal.d))}</small></span>
        <span className="font-bold tabular-nums">{fmtINR(progress.saved)} <small className="text-muted">{tr('of {0}', fmtINR(goal.a))}</small></span>
      </button>
      <div className={ui.meter(tone, 'mt-2.5 mb-1.5')} role="img" aria-label={tr('{0} percent of the target', Math.round(progress.fraction * 100))}><i style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
      <p className={`m-0 text-sm ${line.state === 'reached' ? 'font-semibold text-good' : line.state === 'passed' ? 'text-bad' : ''}`}>{lineText(line)}</p>
      {parts.length > 0 && <p className="mt-1 mb-0 text-[13px] text-muted">{parts.join(' · ')}</p>}
    </SwipeRow>
    <div className="px-3.5 pb-3"><TopUps goal={goal} topUps={topUps} /></div>
    </li>
  );
}

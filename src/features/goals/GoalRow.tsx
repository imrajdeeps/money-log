import { SwipeRow } from '../../ui/SwipeRow.tsx';
import type { Goal, GoalLine, GoalProgress, TopUp } from '../../core/goals.ts';
import { TopUps } from './TopUps.tsx';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

function lineText(line: GoalLine): string {
  if (line.state === 'reached') return 'Reached';
  if (line.state === 'passed') return `The date has passed with ${fmtINR(line.remaining)} still to go. Change the date, or add what you have set aside.`;
  return `Needs ${fmtINR(line.monthly)} a month for ${line.months} ${line.months === 1 ? 'month' : 'months'}`;
}

// One goal: what is saved of the target, a bar, the date, and a line saying what it needs. Slide it left to remove it.
export function GoalRow({ goal, progress, line, topUps, onEdit, onRemove }: { goal: Goal; progress: GoalProgress; line: GoalLine; topUps: TopUp[]; onEdit: () => void; onRemove: () => void }) {
  const parts = [
    progress.fromStart > 0 ? `${fmtINR(progress.fromStart)} at the start` : null,
    progress.fromTopUps > 0 ? `${fmtINR(progress.fromTopUps)} in top-ups` : null,
    progress.fromPayments > 0 ? `${fmtINR(progress.fromPayments)} from ${goal.c} payments` : null,
  ].filter(Boolean);
  const tone = line.state === 'reached' ? 'good' : line.state === 'passed' ? 'bad' : 'accent';
  return (
    <li>
    <SwipeRow as="div" className="px-3.5 py-3" label={goal.n} onDelete={onRemove}>
      <button type="button" className="flex w-full cursor-pointer items-start justify-between gap-3 border-0 bg-transparent p-0 text-left text-inherit [font:inherit]" onClick={onEdit} aria-label={`Change goal: ${goal.n}`}>
        <span className={ui.rowMain()}><b>{goal.n}</b><small>by {shortDate(goal.d)}</small></span>
        <span className="font-bold tabular-nums">{fmtINR(progress.saved)} <small className="text-muted">of {fmtINR(goal.a)}</small></span>
      </button>
      <div className={ui.meter(tone, 'mt-2.5 mb-1.5')} role="img" aria-label={`${Math.round(progress.fraction * 100)} percent of the target`}><i style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
      <p className={`m-0 text-sm ${line.state === 'reached' ? 'font-semibold text-good' : line.state === 'passed' ? 'text-bad' : ''}`}>{lineText(line)}</p>
      {parts.length > 0 && <p className="mt-1 mb-0 text-[13px] text-muted">{parts.join(' · ')}</p>}
    </SwipeRow>
    <div className="px-3.5 pb-3"><TopUps goal={goal} topUps={topUps} /></div>
    </li>
  );
}

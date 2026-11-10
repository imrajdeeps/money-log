import { SwipeRow } from '../../ui/SwipeRow.tsx';
import type { Goal, GoalLine, GoalProgress } from '../../core/goals.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';

function lineText(line: GoalLine): string {
  if (line.state === 'reached') return 'Reached';
  if (line.state === 'passed') return `The date has passed with ${fmtINR(line.remaining)} still to go. Change the date, or add what you have set aside.`;
  return `Needs ${fmtINR(line.monthly)} a month for ${line.months} ${line.months === 1 ? 'month' : 'months'}`;
}

// One goal: what is saved of the target, a bar, the date, and a line saying what it needs. Slide it left to remove it.
export function GoalRow({ goal, progress, line, onEdit, onRemove }: { goal: Goal; progress: GoalProgress; line: GoalLine; onEdit: () => void; onRemove: () => void }) {
  const parts = [
    progress.fromStart > 0 ? `${fmtINR(progress.fromStart)} at the start` : null,
    progress.fromTopUps > 0 ? `${fmtINR(progress.fromTopUps)} in top-ups` : null,
    progress.fromPayments > 0 ? `${fmtINR(progress.fromPayments)} from ${goal.c} payments` : null,
  ].filter(Boolean);
  const tone = line.state === 'reached' ? 'good' : line.state === 'passed' ? 'bad' : 'accent';
  return (
    <SwipeRow className="goalrow" label={goal.n} onDelete={onRemove}>
      <button type="button" className="goalhead" onClick={onEdit} aria-label={`Change goal: ${goal.n}`}>
        <span className="row-main"><b>{goal.n}</b><small>by {shortDate(goal.d)}</small></span>
        <span className="amt">{fmtINR(progress.saved)} <small className="muted">of {fmtINR(goal.a)}</small></span>
      </button>
      <div className={`bar meter-${tone}`} role="img" aria-label={`${Math.round(progress.fraction * 100)} percent of the target`}><i style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
      <p className={`goalstate ${line.state}`}>{lineText(line)}</p>
      {parts.length > 0 && <p className="muted small goalparts">{parts.join(' · ')}</p>}
    </SwipeRow>
  );
}

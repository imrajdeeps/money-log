import { SwipeRow } from '../../ui/SwipeRow.tsx';
import type { Goal, GoalLine, GoalProgress, TopUp } from '../../core/goals.ts';
import { TopUps } from './TopUps.tsx';
import { monthLabel } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

function lineText(line: GoalLine): string {
  if (line.state === 'reached') return tr('Reached');
  if (line.state === 'passed') return tr('The date has passed with {0} still to go. Change the date, or add what you have set aside.', fmtINR(line.remaining));
  return tr('Needs {0} a month', fmtINR(line.monthly));
}

// One goal as a card, as on the design: its name and term, what is saved of the target, a 10px bar, what it needs and by when, and
// adding to it. Tap it to change it; slide it left to remove it.
export function GoalRow({ goal, progress, line, topUps, term, onEdit, onRemove }: Readonly<{ goal: Goal; progress: GoalProgress; line: GoalLine; topUps: TopUp[]; term: 'short' | 'long'; onEdit: () => void; onRemove: () => void }>) {
  const tone = line.state === 'reached' ? 'bg-good' : line.state === 'passed' ? 'bg-bad' : 'bg-accent';
  return (
    <li className="bg-card border border-line rounded-card overflow-hidden">
      <SwipeRow as="div" className="px-4 pt-4 pb-2" label={goal.n} onDelete={onRemove}>
        <button type="button" className="flex w-full flex-col gap-2 cursor-pointer border-0 bg-transparent p-0 text-left text-inherit [font:inherit]" onClick={onEdit} aria-label={tr('Change goal: {0}', goal.n)}>
          <span className="flex justify-between gap-2 items-center"><span className="text-[16px] font-[650]">{goal.n}</span><span className="px-2 py-0.5 rounded-md bg-press text-[12px] font-semibold">{term === 'short' ? tr('short term') : tr('long term')}</span></span>
          <span className="text-[21px] leading-[26px] font-bold tabular-nums">{fmtINR(progress.saved)} <span className="text-[14px] font-medium text-muted">{tr('of {0}', fmtINR(goal.a))}</span></span>
          <span className="flex h-2.5 rounded-full bg-track" role="img" aria-label={tr('{0} percent of the target', Math.round(progress.fraction * 100))}><span className={ui.cx('rounded-full', tone)} style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></span>
          <span className="flex justify-between gap-2 text-[13px] text-muted">
            <span className={line.state === 'reached' ? 'font-semibold text-good' : line.state === 'passed' ? 'text-bad' : ''}>{lineText(line)}</span>
            <span className="flex-none">{tr('by {0}', monthLabel(goal.d.slice(0, 7)))}</span>
          </span>
        </button>
      </SwipeRow>
      <div className="px-4 pb-4"><TopUps goal={goal} topUps={topUps} /></div>
    </li>
  );
}

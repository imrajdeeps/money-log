import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { activeGoals, goalLine, goalPlan, goalProgress, goalTerm, topUpsOf } from '../../core/goals.ts';
import { planForMonth } from '../../core/categories.ts';
import type { Goal } from '../../core/goals.ts';
import { budgetEntries, isoDate, monthOf, summarizeMonth } from '../../core/logic.ts';
import { GoalForm } from './GoalForm.tsx';
import { GoalRow } from './GoalRow.tsx';
import { confirmRemoveGoal } from './confirmRemove.ts';
import { PlanCard } from './PlanCard.tsx';
import { SharedGoals } from './SharedGoals.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The goals page: short-term goals (due within 12 months) and long-term ones, each with its progress and what it needs.
export function GoalsScreen() {
  const app = useApp();
  const today = isoDate();
  const [form, setForm] = useState<'new' | Goal | null>(null);
  const goals = useMemo(() => activeGoals(app.goals), [app.goals]);
  const entries = useMemo(() => budgetEntries(app.entries, app.me), [app.entries, app.me]);
  const rows = useMemo(() => goals.map((goal) => {
    const progress = goalProgress(goal, app.goals, entries);
    return { goal, progress, line: goalLine(goal, progress, today), term: goalTerm(goal.d, today), topUps: topUpsOf(app.goals, goal.id) };
  }), [goals, app.goals, entries, today]);

  // this month's Saving budget: the planned amounts of the Saving group (the app's budgets, or the spreadsheet's where it covers the month)
  const plan = useMemo(() => {
    const month = monthOf(today);
    const saving = summarizeMonth(entries, planForMonth(app.mine, month), month).groups.Saving;
    return goalPlan(rows, saving.budgeted ? saving.planned : null);
  }, [rows, entries, app.mine, today]);

  const list = (title: string, term: 'short' | 'long', hint: string) => {
    const mine = rows.filter((r) => r.term === term);
    if (mine.length === 0) return null;
    return (
      <>
        <h3 className="text-[16px] mt-5 mb-2">{title} <small className="text-muted">{hint}</small></h3>
        <ul className={ui.list()}>
          {mine.map((r) => (
            <GoalRow key={r.goal.id} goal={r.goal} progress={r.progress} line={r.line} topUps={r.topUps}
              onEdit={() => setForm(r.goal)}
              onRemove={() => { if (confirmRemoveGoal(r.goal.n)) void app.removeGoal(r.goal.id).then(() => app.toast(tr('Removed: {0}', r.goal.n))); }} />
          ))}
        </ul>
      </>
    );
  };

  return (
    <section aria-label={tr('Goals')} id="goals">
      <div className="mt-5 mb-2 flex items-center justify-between gap-3">
        <h3 className="m-0 text-[16px]">{tr('Goals')}</h3>
        {!form && <button type="button" className={ui.btn('solid', 'small')} onClick={() => setForm('new')}>{tr('Add a goal')}</button>}
      </div>
      {form && <GoalForm key={form === 'new' ? 'new' : form.id} goal={form === 'new' ? undefined : form} onDone={() => setForm(null)} />}
      {goals.length === 0 && !form && <p className="text-muted">{tr('No goals yet. Make one with a name, a target and a date, and see what to set aside each month.')}</p>}
      {goals.length > 0 && <PlanCard plan={plan} />}
      {list(tr('Short term'), 'short', tr('due within 12 months'))}
      {list(tr('Long term'), 'long', tr('more than 12 months away'))}
      {goals.length > 0 && <p className="text-muted text-[13px]">{tr('Slide a goal or a top-up to the left to remove it. A goal moves from long term to short term by itself as its date gets close.')}</p>}
      <SharedGoals />
    </section>
  );
}

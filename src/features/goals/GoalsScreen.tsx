import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
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
  const spend = useSpendEntries();
  const entries = useMemo(() => budgetEntries(spend, app.me), [spend, app.me]);
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

  return (
    <section aria-label={tr('Goals')} id="goals" className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Goals')}</h3>
        {!form && <button type="button" className={LINK} onClick={() => setForm('new')}>{tr('Add a goal')}</button>}
      </div>
      {form && <GoalForm key={form === 'new' ? 'new' : form.id} goal={form === 'new' ? undefined : form} onDone={() => setForm(null)} />}
      {goals.length === 0 && !form && <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('No goals yet. Make one with a name, a target and a date, and see what to set aside each month.')}</p>}
      {rows.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {[...rows].sort((a, b) => (a.term === b.term ? 0 : a.term === 'short' ? -1 : 1)).map((r) => (
            <GoalRow key={r.goal.id} goal={r.goal} progress={r.progress} line={r.line} topUps={r.topUps} term={r.term}
              onEdit={() => setForm(r.goal)}
              onRemove={() => { if (confirmRemoveGoal(r.goal.n)) void app.removeGoal(r.goal.id).then(() => app.toast(tr('Removed: {0}', r.goal.n))); }} />
          ))}
        </ul>
      )}
      {goals.length > 0 && <PlanCard plan={plan} />}
      <SharedGoals />
    </section>
  );
}

const LINK = 'min-h-11 border-0 bg-transparent p-0 text-brand text-[14px] font-[650] underline underline-offset-2 cursor-pointer [font-family:inherit]';

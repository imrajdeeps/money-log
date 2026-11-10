import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { activeGoals, goalLine, goalPlan, goalProgress, goalTerm, topUpsOf } from '../../core/goals.ts';
import { planForMonth } from '../../core/categories.ts';
import type { Goal } from '../../core/goals.ts';
import { budgetEntries, isoDate, monthOf, summarizeMonth } from '../../core/logic.ts';
import { GoalForm } from './GoalForm.tsx';
import { GoalRow } from './GoalRow.tsx';
import { PlanCard } from './PlanCard.tsx';

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
    const saving = summarizeMonth(entries, planForMonth(app.plan, app.mine, month), month).groups.Saving;
    return goalPlan(rows, saving.budgeted ? saving.planned : null);
  }, [rows, entries, app.plan, app.mine, today]);

  const list = (title: string, term: 'short' | 'long', hint: string) => {
    const mine = rows.filter((r) => r.term === term);
    if (mine.length === 0) return null;
    return (
      <>
        <h3 className="h2">{title} <small className="muted">{hint}</small></h3>
        <ul className="list">
          {mine.map((r) => (
            <GoalRow key={r.goal.id} goal={r.goal} progress={r.progress} line={r.line} topUps={r.topUps}
              onEdit={() => setForm(r.goal)}
              onRemove={() => { void app.removeGoal(r.goal.id).then(() => app.toast(`Removed: ${r.goal.n}`)); }} />
          ))}
        </ul>
      </>
    );
  };

  return (
    <section aria-label="Goals">
      {form ? (
        <GoalForm key={form === 'new' ? 'new' : form.id} goal={form === 'new' ? undefined : form} onDone={() => setForm(null)} />
      ) : (
        <button type="button" className="btn" onClick={() => setForm('new')}>Add a goal</button>
      )}
      {goals.length === 0 && !form && <p className="muted">No goals yet. Make one with a name, a target and a date, and see what to set aside each month.</p>}
      {goals.length > 0 && <PlanCard plan={plan} />}
      {list('Short term', 'short', 'due within 12 months')}
      {list('Long term', 'long', 'more than 12 months away')}
      {goals.length > 0 && <p className="muted small">Slide a goal or a top-up to the left to remove it. A goal moves from long term to short term by itself as its date gets close.</p>}
    </section>
  );
}

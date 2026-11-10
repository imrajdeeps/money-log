import type { GoalPlan } from '../../core/goals.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

// The plan: what to set aside each month for each goal, the total, and whether this month's Saving budget covers it.
export function PlanCard({ plan }: { plan: GoalPlan }) {
  if (plan.rows.length === 0) {
    return (
      <div className={ui.card()}>
        <h3>Plan</h3>
        <p>Nothing to set aside each month: every goal is {plan.reached > 0 && plan.passed > 0 ? 'reached or past its date' : plan.passed > 0 ? 'past its date' : 'reached'}.</p>
        {plan.passed > 0 && <p className="text-muted text-[13px]">A goal whose date has passed is left out until its date is changed.</p>}
      </div>
    );
  }
  return (
    <div className={ui.card()}>
      <h3>Plan</h3>
      <p className="text-[22px] font-bold mt-0 mx-0 mb-1.5 tabular-nums">{fmtINR(plan.total)} <small className="text-muted">a month</small></p>
      <ul className={ui.list(true)}>
        {plan.rows.map((r) => (
          <li key={r.goal.id} className={ui.catLineFlush}><span>{r.goal.n}</span><span>{fmtINR(r.monthly)} <small className="text-muted">for {r.months} {r.months === 1 ? 'month' : 'months'}</small></span></li>
        ))}
      </ul>
      {plan.budget === null ? (
        <p className="text-muted text-[13px]">You have no Saving budget set for this month, so there is nothing to compare this with. Set one under Month, Categories and budgets.</p>
      ) : plan.covers ? (
        <p className="mt-2.5 mb-1.5 font-semibold text-good">Your Saving budget of {fmtINR(plan.budget)} covers it{plan.gap! < 0 ? `, with ${fmtINR(-plan.gap!)} to spare` : ' exactly'}.</p>
      ) : (
        <p className="mt-2.5 mb-1.5 font-semibold text-bad">Your Saving budget of {fmtINR(plan.budget)} is {fmtINR(plan.gap!)} a month short of this.</p>
      )}
      {plan.passed > 0 && <p className="text-muted text-[13px]">{plan.passed} {plan.passed === 1 ? 'goal is' : 'goals are'} past {plan.passed === 1 ? 'its' : 'their'} date and left out until the date is changed.</p>}
      <p className="text-muted text-[13px]">This is what is left of each goal divided by the months to its date, counting this month. It assumes no interest or returns.</p>
    </div>
  );
}

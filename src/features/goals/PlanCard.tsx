import type { GoalPlan } from '../../core/goals.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The plan: what to set aside each month for each goal, the total, and whether this month's Saving budget covers it.
export function PlanCard({ plan }: Readonly<{ plan: GoalPlan }>) {
  if (plan.rows.length === 0) {
    return (
      <div className={ui.card()}>
        <h3>{tr('Plan')}</h3>
        <p>{tr('Nothing to set aside each month: every goal is {0}.', plan.reached > 0 && plan.passed > 0 ? 'reached or past its date' : plan.passed > 0 ? 'past its date' : 'reached')}</p>
        {plan.passed > 0 && <p className="text-muted text-[13px]">{tr('A goal whose date has passed is left out until its date is changed.')}</p>}
      </div>
    );
  }
  return (
    <div className={ui.card()}>
      <h3>{tr('Plan')}</h3>
      <p className="text-[22px] font-bold mt-0 mx-0 mb-1.5 tabular-nums">{fmtINR(plan.total)} <small className="text-muted">{tr('a month')}</small></p>
      <ul className={ui.list(true)}>
        {plan.rows.map((r) => (
          <li key={r.goal.id} className={ui.catLineFlush}><span>{r.goal.n}</span><span>{fmtINR(r.monthly)} <small className="text-muted">{tr('for {0} {1}', r.months, r.months === 1 ? 'month' : 'months')}</small></span></li>
        ))}
      </ul>
      {plan.budget === null ? (
        <p className="text-muted text-[13px]">{tr('You have no Saving budget set for this month, so there is nothing to compare this with. Set one under Month, Categories and budgets.')}</p>
      ) : plan.covers ? (
        <p className="mt-2.5 mb-1.5 font-semibold text-good">{tr('Your Saving budget of {0} covers it{1}.', fmtINR(plan.budget), plan.gap! < 0 ? tr(', with {0} to spare', fmtINR(-plan.gap!)) : ' exactly')}</p>
      ) : (
        <p className="mt-2.5 mb-1.5 font-semibold text-bad">{tr('Your Saving budget of {0} is {1} a month short of this.', fmtINR(plan.budget), fmtINR(plan.gap!))}</p>
      )}
      {plan.passed > 0 && <p className="text-muted text-[13px]">{tr('{0} {1} past {2} date and left out until the date is changed.', plan.passed, plan.passed === 1 ? 'goal is' : 'goals are', plan.passed === 1 ? 'its' : 'their')}</p>}
      <p className="text-muted text-[13px]">{tr('This is what is left of each goal divided by the months to its date, counting this month. It assumes no interest or returns.')}</p>
    </div>
  );
}

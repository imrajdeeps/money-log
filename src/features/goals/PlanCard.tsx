import type { GoalPlan } from '../../core/goals.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const CARD = 'flex flex-col gap-2 bg-card border border-line rounded-card p-4';

// When no goal has anything to set aside: they are all reached, or past their date, or both.
function NothingToSet({ plan }: Readonly<{ plan: GoalPlan }>) {
  return (
    <div className={CARD}>
      <span className="text-[15px] font-[650]">{tr('The plan')}</span>
      <p className="m-0 text-[14px]">{tr('Nothing to set aside each month: every goal is {0}.', plan.reached > 0 && plan.passed > 0 ? 'reached or past its date' : plan.passed > 0 ? 'past its date' : 'reached')}</p>
      {plan.passed > 0 && <p className="m-0 text-muted text-[13px]">{tr('A goal whose date has passed is left out until its date is changed.')}</p>}
    </div>
  );
}

// Whether this month's Saving budget covers the monthly total, in words (or that there is no Saving budget to compare with).
function BudgetVerdict({ plan }: Readonly<{ plan: GoalPlan }>) {
  if (plan.budget === null) return <p className="m-0 text-muted text-[13px]">{tr('You have no Saving budget set for this month, so there is nothing to compare this with. Set one under Month, Categories and budgets.')}</p>;
  if (plan.covers) return <p className="m-0 px-2.5 py-2 rounded-[10px] bg-good-bg text-good text-[14px] leading-5 font-semibold">{tr('Your Saving budget of {0} covers it{1}.', fmtINR(plan.budget), plan.gap! < 0 ? tr(', with {0} to spare', fmtINR(-plan.gap!)) : ' exactly')}</p>;
  return <p className="m-0 px-2.5 py-2 rounded-[10px] bg-bad-bg text-bad text-[14px] leading-5 font-semibold">{tr('Your Saving budget of {0} is {1} a month short of this.', fmtINR(plan.budget), fmtINR(plan.gap!))}</p>;
}

// The plan: what to set aside each month for each goal, the total, and whether this month's Saving budget covers it.
export function PlanCard({ plan }: Readonly<{ plan: GoalPlan }>) {
  if (plan.rows.length === 0) return <NothingToSet plan={plan} />;
  return (
    <div className={CARD}>
      <div className="flex justify-between items-baseline"><span className="text-[15px] font-[650]">{tr('The plan')}</span><span className="text-[18px] font-[750] tabular-nums">{tr('{0} a month', fmtINR(plan.total))}</span></div>
      {plan.rows.map((r) => <div key={r.goal.id} className="flex justify-between text-[14px]"><span>{r.goal.n}</span><span className="tabular-nums">{fmtINR(r.monthly)}</span></div>)}
      <BudgetVerdict plan={plan} />
      {plan.passed > 0 && <p className="m-0 text-muted text-[13px]">{tr('{0} {1} past {2} date and left out until the date is changed.', plan.passed, plan.passed === 1 ? 'goal is' : 'goals are', plan.passed === 1 ? 'its' : 'their')}</p>}
    </div>
  );
}

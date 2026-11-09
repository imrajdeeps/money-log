import { useMemo, useState } from 'react';
import { useApp } from '../context.tsx';
import { monthLabel } from '../format.ts';
import { GROUPS, budgetState, fmtINR, isoDate, monthOf, shiftMonth, summarizeMonth } from '../logic.ts';
import type { BudgetState, Group } from '../logic.ts';

const stateClass: Record<BudgetState, string> = { over: 'bad', ok: 'good', short: 'bad', idle: 'idle' };

function Line({ group, spent, planned, over }: { group: Group; spent: number; planned: number; over: boolean }) {
  const st = budgetState(group, spent, planned, over);
  const saving = group === 'Saving';
  const diff = planned - spent;
  let text = '';
  if (saving) text = spent >= planned && planned > 0 ? 'on track' : planned > 0 ? `${fmtINR(Math.max(0, diff))} to go` : '';
  else text = diff >= 0 ? `${fmtINR(diff)} left` : `${fmtINR(-diff)} over`;
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : spent > 0 ? 100 : 0;
  return (
    <>
      <div className="bar" aria-hidden="true"><i className={stateClass[st]} style={{ width: `${pct}%` }} /></div>
      <span className={`left ${stateClass[st]}`}>{text}</span>
    </>
  );
}

export function MonthScreen({ openSettings }: { openSettings: () => void }) {
  const app = useApp();
  const current = monthOf(isoDate());
  const [month, setMonth] = useState(current);
  const s = useMemo(() => summarizeMonth(app.entries, app.plan, month), [app.entries, app.plan, month]);
  const monthIsOver = month < current;
  const shown = s.rows.filter((r) => r.planned > 0 || r.spent > 0);

  return (
    <section aria-label="Month against plan">
      <div className="monthbar">
        <button type="button" className="btn ghost sq" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <button type="button" className="btn ghost sq" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      {!app.plan && (
        <div className="card notice">
          <p>No plan imported yet, so there is nothing to compare against.</p>
          <button type="button" className="btn" onClick={openSettings}>Import plan</button>
        </div>
      )}
      {app.plan && !s.hasPlan && <p className="muted">The plan has no figures for this month (it covers {monthLabel(app.plan.months[0] ?? month)} to {monthLabel(app.plan.months[app.plan.months.length - 1] ?? month)}). Spending is shown without a budget.</p>}

      <div className="groups">
        {GROUPS.map((g) => {
          const t = s.groups[g];
          return (
            <div key={g} className="card group">
              <h3>{g}</h3>
              <p className="big-num">{fmtINR(t.spent)}</p>
              <p className="muted small">of {fmtINR(t.planned)}</p>
              <Line group={g} spent={t.spent} planned={t.planned} over={monthIsOver} />
            </div>
          );
        })}
      </div>

      {shown.length > 0 && (
        <ul className="list cats">
          {shown.map((r) => (
            <li key={r.category} className="catrow">
              <div className="catline">
                <b>{r.category}</b>
                <span>{fmtINR(r.spent)}{r.planned > 0 ? <small className="muted"> / {fmtINR(r.planned)}</small> : null}</span>
              </div>
              <Line group={r.group} spent={r.spent} planned={r.planned} over={monthIsOver} />
            </li>
          ))}
        </ul>
      )}

      {s.extra.length > 0 && (
        <>
          <h3 className="h2">Not in the plan</h3>
          <ul className="list">
            {s.extra.map((x) => (
              <li key={x.category} className="catline plain"><b>{x.category}</b><span>{fmtINR(x.spent)}</span></li>
            ))}
          </ul>
        </>
      )}

      <p className="muted small">{s.count} payment{s.count === 1 ? '' : 's'} this month · {fmtINR(s.totalSpent)} in total</p>
    </section>
  );
}

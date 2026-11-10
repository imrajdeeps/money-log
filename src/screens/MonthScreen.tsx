import { useMemo, useState } from 'react';
import { useApp } from '../context.tsx';
import { monthLabel } from '../format.ts';
import { BudgetLine as Line } from '../components/BudgetLine.tsx';
import { BudgetsDialog } from '../components/BudgetsDialog.tsx';
import { planCovers, planForMonth } from '../categories.ts';
import type { Group } from '../logic.ts';
import { GROUPS, budgetEntries, fmtINR, isoDate, monthOf, shiftMonth, summarizeMonth } from '../logic.ts';

// group: show only that group's categories (a tile on the Overview was tapped); onGroup() shows them all again.
export function MonthScreen({ group, onGroup }: { group?: Group; onGroup: (g?: Group) => void }) {
  const app = useApp();
  const current = monthOf(isoDate());
  const [month, setMonth] = useState(current);
  const [editing, setEditing] = useState(false);
  // Shared expenses count at this account's own share; other people's expenses never count. The budgets are the
  // spreadsheet plan's figures where it covers the month and the ones set in the app everywhere else.
  const s = useMemo(
    () => summarizeMonth(budgetEntries(app.entries, app.me), planForMonth(app.plan, app.mine, month), month),
    [app.entries, app.me, app.plan, app.mine, month],
  );
  const noBudgets = !app.plan && app.categories.every((c) => c.budget === 0);
  const monthIsOver = month < current;
  const shown = s.rows.filter((r) => (r.planned > 0 || r.spent > 0) && (!group || r.group === group));

  return (
    <section aria-label="Month against plan">
      <div className="monthbar">
        <button type="button" className="btn ghost sq" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <button type="button" className="btn ghost sq" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      {noBudgets && (
        <div className="card notice">
          <p>No budgets yet, so there is nothing to compare against. Give each category a monthly amount to see what is left.</p>
          <button type="button" className="btn" onClick={() => setEditing(true)}>Set budgets</button>
        </div>
      )}
      {app.plan && !planCovers(app.plan, month) && <p className="muted">Your spreadsheet plan covers {monthLabel(app.plan.months[0] ?? month)} to {monthLabel(app.plan.months[app.plan.months.length - 1] ?? month)}. This month uses the budgets set in the app.</p>}

      <div className="groups">
        {GROUPS.map((g) => {
          const t = s.groups[g];
          return (
            <div key={g} className={`card group${g === group ? ' picked' : ''}`}>
              <h3>{g}</h3>
              <p className="big-num">{fmtINR(t.spent)}</p>
              <p className="muted small">{t.budgeted ? `of ${fmtINR(t.planned)}` : '\u00a0'}</p>
              <Line group={g} spent={t.spent} planned={t.planned} over={monthIsOver} budgeted={t.budgeted} />
            </div>
          );
        })}
      </div>

      {group && (
        <p className="muted small" role="status">
          Showing {group} only. <button type="button" className="linkbtn" onClick={() => onGroup(undefined)}>Show all categories</button>
        </p>
      )}
      {group && shown.length === 0 && <p className="muted">No {group} categories have a budget or a payment this month.</p>}
      {shown.length > 0 && (
        <ul className="list cats">
          {shown.map((r) => (
            <li key={r.category} className="catrow">
              <div className="catline">
                <b>{r.category}</b>
                <span>{fmtINR(r.spent)}{r.planned > 0 ? <small className="muted"> / {fmtINR(r.planned)}</small> : null}</span>
              </div>
              <Line group={r.group} spent={r.spent} planned={r.planned} over={monthIsOver} budgeted={r.budgeted} />
            </li>
          ))}
        </ul>
      )}

      {!group && s.extra.length > 0 && (
        <>
          <h3 className="h2">Not in your categories</h3>
          <ul className="list">
            {s.extra.map((x) => (
              <li key={x.category} className="catline plain"><b>{x.category}</b><span>{fmtINR(x.spent)}</span></li>
            ))}
          </ul>
        </>
      )}

      <p className="muted small">{s.count} payment{s.count === 1 ? '' : 's'} this month · {fmtINR(s.totalSpent)} in total</p>
      <button type="button" className="btn ghost" onClick={() => setEditing(true)}>Categories and budgets</button>
      {editing && <BudgetsDialog onClose={() => setEditing(false)} />}
    </section>
  );
}

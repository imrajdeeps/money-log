import { Icon } from '../../ui/Icon.tsx';
import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { monthLabel } from '../../core/format.ts';
import { BudgetLine as Line } from '../../ui/BudgetLine.tsx';
import { BudgetsDialog } from './BudgetsDialog.tsx';
import { CategoryActions } from './CategoryActions.tsx';
import { planCovers, planForMonth } from '../../core/categories.ts';
import type { Group } from '../../core/logic.ts';
import { GROUPS, budgetEntries, fmtINR, isoDate, monthOf, shiftMonth, summarizeMonth } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

// group: show only that group's categories (a tile on the Overview was tapped); onGroup() shows them all again.
export function MonthScreen({ group, onGroup, onAddExpense }: { group?: Group; onGroup: (g?: Group) => void; onAddExpense: (category: string) => void }) {
  const app = useApp();
  const current = monthOf(isoDate());
  const [month, setMonth] = useState(current);
  const [editing, setEditing] = useState(false);
  const [focusCat, setFocusCat] = useState<string | undefined>(undefined); // the budgets dialog opens on this category
  const [picked, setPicked] = useState<string | null>(null); // the category whose button was tapped
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
      <div className="flex items-center justify-between mb-3 [&_h2]:m-0">
        <button type="button" className={ui.btn('ghost', 'sq')} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><span className="inline-flex rotate-180"><Icon name="chevron" size={22} /></span></button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <button type="button" className={ui.btn('ghost', 'sq')} aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron" size={22} /></button>
      </div>

      {noBudgets && (
        <div className={ui.card('notice')}>
          <p>No budgets yet, so there is nothing to compare against. Give each category a monthly amount to see what is left.</p>
          <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={() => setEditing(true)}>Set budgets</button>
        </div>
      )}
      {app.plan && !planCovers(app.plan, month) && <p className="text-muted">Your spreadsheet plan covers {monthLabel(app.plan.months[0] ?? month)} to {monthLabel(app.plan.months[app.plan.months.length - 1] ?? month)}. This month uses the budgets set in the app.</p>}

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        {GROUPS.map((g) => {
          const t = s.groups[g];
          return (
            <div key={g} className={ui.groupTile(g === group)}>
              <h3>{g}</h3>
              <p className={ui.bigNum}>{fmtINR(t.spent)}</p>
              <p className="text-muted text-[13px]">{t.budgeted ? `of ${fmtINR(t.planned)}` : '\u00a0'}</p>
              <Line group={g} spent={t.spent} planned={t.planned} over={monthIsOver} budgeted={t.budgeted} />
            </div>
          );
        })}
      </div>

      {group && (
        <p className="text-muted text-[13px]" role="status">
          Showing {group} only. <button type="button" className={ui.linkBtn} onClick={() => onGroup(undefined)}>Show all categories</button>
        </p>
      )}
      {group && shown.length === 0 && <p className="text-muted">No {group} categories have a budget or a payment this month.</p>}
      {shown.length > 0 && (
        <ul className={ui.list(false, 'mt-0 mx-0 mb-3.5')}>
          {shown.map((r) => (
            <li key={r.category} className="px-3.5 py-3">
              <div className="flex items-start gap-2">
                <div className={`${ui.catLine} flex-1 pt-2.5`}>
                  <b>{r.category}</b>
                  <span>{fmtINR(r.spent)}{r.planned > 0 ? <small className="text-muted"> / {fmtINR(r.planned)}</small> : null}</span>
                </div>
                <button type="button" className={ui.icoBtn} aria-label={`Actions for ${r.category}: set budget or add expense`} onClick={() => setPicked(r.category)}><Icon name="dots" size={20} /></button>
              </div>
              <Line group={r.group} spent={r.spent} planned={r.planned} over={monthIsOver} budgeted={r.budgeted} />
            </li>
          ))}
        </ul>
      )}

      {!group && s.extra.length > 0 && (
        <>
          <h3 className="text-[16px] mt-5 mb-2">Not in your categories</h3>
          <ul className={ui.list()}>
            {s.extra.map((x) => (
              <li key={x.category} className={ui.catLineBox}><b>{x.category}</b><span>{fmtINR(x.spent)}</span></li>
            ))}
          </ul>
        </>
      )}

      <p className="text-muted text-[13px]">{s.count} payment{s.count === 1 ? '' : 's'} this month · {fmtINR(s.totalSpent)} in total</p>
      <button type="button" className={ui.btn('ghost')} onClick={() => setEditing(true)}>Categories and budgets</button>
      {picked && (
        <CategoryActions
          category={picked}
          onBudget={() => { setFocusCat(picked); setEditing(true); }}
          onAddExpense={() => onAddExpense(picked)}
          onClose={() => setPicked(null)}
        />
      )}
      {editing && <BudgetsDialog focus={focusCat} onClose={() => { setEditing(false); setFocusCat(undefined); }} />}
    </section>
  );
}

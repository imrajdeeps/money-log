import { Icon } from '../../ui/Icon.tsx';
import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { suggestBudgets } from '../../core/suggestBudgets.ts';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { monthLabel } from '../../core/format.ts';
import { BudgetLine as Line } from '../../ui/BudgetLine.tsx';
import { BudgetsDialog } from './BudgetsDialog.tsx';
import { CategoryActions } from './CategoryActions.tsx';
import { planForMonth } from '../../core/categories.ts';
import type { Group } from '../../core/logic.ts';
import { GROUPS, budgetEntries, fmtINR, isoDate, monthOf, shiftMonth, summarizeMonth } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

type Summary = ReturnType<typeof summarizeMonth>;
type Suggestion = ReturnType<typeof suggestBudgets>;

// With no budgets yet: say so, offer to set them, and (this month only) to use last month's spending as the budgets in one tap.
function NoBudgetsCard({ suggestion, offer, onSet }: Readonly<{ suggestion: Suggestion; offer: boolean; onSet: () => void }>) {
  const app = useApp();
  return (
    <div className={ui.card('notice')}>
      <p>{tr('No budgets yet, so there is nothing to compare against. Give each category a monthly amount to see what is left.')}</p>
      <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={onSet}>{tr('Set budgets')}</button>
      {suggestion.length > 0 && offer && (
        <>
          <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} onClick={() => { void app.saveBudgets(suggestion).then(() => app.toast(tr('Budgets set from last month: {0} categories', suggestion.length))); }}>{tr('Use last month\'s spending as my budgets')}</button>
          <p className="text-muted text-[13px]">{tr('{0} categories, each last month\'s spending rounded up. You can change any of them afterwards.', suggestion.length)}</p>
        </>
      )}
    </div>
  );
}

// The four groups (Spending, EMI, Family, Saving) with what was spent in each; the one that was tapped on the Overview is marked.
function GroupTiles({ s, group, over }: Readonly<{ s: Summary; group?: Group; over: boolean }>) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-3.5">
      {GROUPS.map((g) => {
        const t = s.groups[g];
        return (
          <div key={g} className={ui.groupTile(g === group)}>
            <h3>{tr(g)}</h3>
            <p className={ui.bigNum}>{fmtINR(t.spent)}</p>
            <p className="text-muted text-[13px]">{t.budgeted ? tr('of {0}', fmtINR(t.planned)) : '\u00a0'}</p>
            <Line group={g} spent={t.spent} planned={t.planned} over={over} budgeted={t.budgeted} />
          </div>
        );
      })}
    </div>
  );
}

// One line for each category that has a budget or a payment: spent against planned, the bar, and the button for its actions.
function CategoryList({ rows, over, onPick }: Readonly<{ rows: Summary['rows']; over: boolean; onPick: (category: string) => void }>) {
  return (
    <ul className={ui.list(false, 'mt-0 mx-0 mb-3.5')}>
      {rows.map((r, ri) => (
        <li key={r.category} className="px-3.5 py-3">
          <div className="flex items-start gap-2">
            <div className={`${ui.catLine} flex-1 pt-2.5`}>
              <b>{r.category}</b>
              <span>{fmtINR(r.spent)}{r.planned > 0 ? <small className="text-muted"> / {fmtINR(r.planned)}</small> : null}</span>
            </div>
            <button type="button" data-tour={ri === 0 ? 'category-actions' : undefined} className={ui.icoBtn} aria-label={tr('Actions for {0}: set budget or add expense', r.category)} onClick={() => onPick(r.category)}><Icon name="dots" size={20} /></button>
          </div>
          <Line group={r.group} spent={r.spent} planned={r.planned} over={over} budgeted={r.budgeted} />
        </li>
      ))}
    </ul>
  );
}

// group: show only that group's categories (a tile on the Overview was tapped); onGroup() shows them all again.
export function MonthScreen({ group, onGroup, onAddExpense, onInsights, onCashFlow }: Readonly<{ group?: Group; onGroup: (g?: Group) => void; onAddExpense: (category: string) => void; onInsights: () => void; onCashFlow: () => void }>) {
  const app = useApp();
  const current = monthOf(isoDate());
  const [month, setMonth] = useState(current);
  const [editing, setEditing] = useState(false);
  const [focusCat, setFocusCat] = useState<string | undefined>(undefined); // the budgets dialog opens on this category
  const [picked, setPicked] = useState<string | null>(null); // the category whose button was tapped
  // Shared expenses count at this account's own share; other people's expenses never count. The budgets are the ones set in the app.
  const spend = useSpendEntries(); // your own payments, plus your share of friends' group expenses where that counts
  const s = useMemo(
    () => summarizeMonth(budgetEntries(spend, app.me), planForMonth(app.mine, month), month),
    [spend, app.me, app.mine, month],
  );
  const noBudgets = app.categories.every((c) => c.budget === 0);
  // with no budgets yet, last month's spending can become them in one tap
  const prevMonth = shiftMonth(current, -1);
  const suggestion = useMemo(
    () => (noBudgets ? suggestBudgets(summarizeMonth(budgetEntries(spend, app.me), planForMonth(app.mine, prevMonth), prevMonth).rows).filter((b) => app.categories.some((c) => c.name === b.name)) : []),
    [noBudgets, spend, app.me, app.mine, app.categories, prevMonth],
  );
  const monthIsOver = month < current;
  const shown = s.rows.filter((r) => (r.planned > 0 || r.spent > 0) && (!group || r.group === group));

  return (
    <section aria-label={tr('Month against plan')}>
      <div className="flex items-center justify-between mb-3 [&_h2]:m-0">
        <button type="button" className={ui.btn('ghost', 'sq')} aria-label={tr('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><span className="inline-flex rotate-180"><Icon name="chevron" size={22} /></span></button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <button type="button" className={ui.btn('ghost', 'sq')} aria-label={tr('Next month')} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron" size={22} /></button>
      </div>

      {noBudgets && <NoBudgetsCard suggestion={suggestion} offer={month === current} onSet={() => setEditing(true)} />}

      <GroupTiles s={s} group={group} over={monthIsOver} />

      {group && (
        <p className="text-muted text-[13px]" role="status">
          {tr('Showing {0} only.', group)}{' '}<button type="button" className={ui.linkBtn} onClick={() => onGroup(undefined)}>{tr('Show all categories')}</button>
        </p>
      )}
      {group && shown.length === 0 && <p className="text-muted">{tr('No {0} categories have a budget or a payment this month.', group)}</p>}
      {shown.length > 0 && <CategoryList rows={shown} over={monthIsOver} onPick={setPicked} />}

      {!group && s.extra.length > 0 && (
        <>
          <h3 className="text-[16px] mt-5 mb-2">{tr('Not in your categories')}</h3>
          <ul className={ui.list()}>
            {s.extra.map((x) => (
              <li key={x.category} className={ui.catLineBox}><b>{x.category}</b><span>{fmtINR(x.spent)}</span></li>
            ))}
          </ul>
        </>
      )}

      <p className="text-muted text-[13px]">{tr('{0} payment{1} this month · {2} in total', s.count, s.count === 1 ? '' : 's', fmtINR(s.totalSpent))}</p>
      <div className={ui.btnRowOf('mt-3.5 mb-0')}>
        <button type="button" className={ui.btn('ghost')} onClick={() => setEditing(true)}>{tr('Categories and budgets')}</button>
        <button type="button" className={ui.btn('ghost')} onClick={onInsights}>{tr('Insights')}</button>
        <button type="button" className={ui.btn('ghost')} onClick={onCashFlow}>{tr('Cash flow')}</button>
      </div>
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

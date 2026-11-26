import { Icon } from '../../ui/Icon.tsx';
import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { suggestBudgets } from '../../core/suggestBudgets.ts';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { monthLabel } from '../../core/format.ts';
import { BudgetLine as Line } from '../../ui/BudgetLine.tsx';
import { budgetText } from '../../ui/budgetMeter.ts';
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
function NoBudgetsCard({ suggestion, offer, lastSpent, onSet }: Readonly<{ suggestion: Suggestion; offer: boolean; lastSpent: number; onSet: () => void }>) {
  const app = useApp();
  return (
    <section className="flex flex-col gap-2.5 bg-card border border-line rounded-card p-[18px]">
      <h3 className="m-0 text-[17px] font-bold text-ink">{tr('No budgets yet')}</h3>
      <p className="m-0 text-[15px] leading-[22px] text-muted">
        {tr('Give each category a monthly amount and this page shows what is left as you spend.')}
        {suggestion.length > 0 && offer && lastSpent > 0 ? ' ' + tr('You can start from what you spent last month ({0}).', fmtINR(lastSpent)) : ''}
      </p>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={ui.btn('solid', 'none', 'min-h-12 px-[18px] text-[16px]')} onClick={onSet}>{tr('Set budgets')}</button>
        {suggestion.length > 0 && offer && (
          <button type="button" className={ui.btn('outline', 'none', 'min-h-12 px-4 text-[15px] text-left whitespace-normal')} onClick={() => { void app.saveBudgets(suggestion).then(() => app.toast(tr('Budgets set from last month: {0} categories', suggestion.length))); }}>{tr('Use last month\'s spending as my budgets')}</button>
        )}
      </div>
    </section>
  );
}

// The four groups (Spending, EMI, Family, Saving) with what was spent in each; the one that was tapped on the Overview is marked.
function GroupTiles({ s, group, over, onGroup }: Readonly<{ s: Summary; group?: Group; over: boolean; onGroup: (g?: Group) => void }>) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {GROUPS.map((g) => {
        const t = s.groups[g];
        return (
          <button key={g} type="button" className={ui.cx(GROUP_TILE, g === group && '[box-shadow:0_0_0_2px_var(--accent)]')} aria-pressed={g === group} onClick={() => onGroup(g === group ? undefined : g)}>
            <span className="text-[14px] font-[650]">{tr(g)}</span>
            <span className="text-[21px] leading-[26px] font-bold">{fmtINR(t.spent)}</span>
            <span className="text-[13px] text-muted">{t.budgeted ? tr('of {0}', fmtINR(t.planned)) : tr('spent')}</span>
            <Line group={g} spent={t.spent} planned={t.planned} over={over} budgeted={t.budgeted} />
          </button>
        );
      })}
    </div>
  );
}
const GROUP_TILE = 'text-left flex flex-col gap-1.5 bg-card text-ink border border-line rounded-card p-3.5 cursor-pointer [font-family:inherit] [line-height:inherit]';

// One line for each category that has a budget or a payment: spent against planned, the bar, and the button for its actions.
function CategoryList({ rows, over, onPick, first }: Readonly<{ rows: Summary['rows']; over: boolean; onPick: (category: string) => void; first: boolean }>) {
  return (
    <ul className="list-none m-0 bg-card border border-line rounded-card pl-4 pr-1.5 py-0">
      {rows.map((r, ri) => (
        <li key={r.category} className={ui.cx('grid grid-cols-[minmax(0,1fr)_44px] gap-1.5 items-center py-3', ri > 0 && 'border-t border-line')}>
          <div className="flex flex-col gap-[7px] min-w-0">
            <div className="flex justify-between gap-2.5 items-baseline"><span className="text-[15px] font-semibold truncate">{r.category}</span><span className="text-[14px] text-muted whitespace-nowrap"><strong className="text-ink">{fmtINR(r.spent)}</strong>{r.planned > 0 ? ' ' + tr('of {0}', fmtINR(r.planned)) : ''}</span></div>
            <Line group={r.group} spent={r.spent} planned={r.planned} over={over} budgeted={r.budgeted} />
          </div>
          <button type="button" data-tour={first && ri === 0 ? 'category-actions' : undefined} className="w-11 h-11 border-0 rounded-xl bg-transparent text-muted flex items-center justify-center cursor-pointer" aria-label={tr('Actions for {0}: set budget or add expense', r.category)} onClick={() => onPick(r.category)}><Icon name="dotsFill" size={22} /></button>
        </li>
      ))}
    </ul>
  );
}

// One group's part of the page: its name, what was spent of what was planned, and its categories.
function GroupSection({ g, rows, total, over, onPick, first }: Readonly<{ g: Group; rows: Summary['rows']; total: Summary['groups'][Group]; over: boolean; onPick: (c: string) => void; first: boolean }>) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline"><h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr(g)}</h3><span className="text-[13px] text-muted">{total.budgeted ? tr('{0} of {1}', fmtINR(total.spent), fmtINR(total.planned)) : g === 'Saving' ? tr('{0} put by', fmtINR(total.spent)) : tr('{0} spent', fmtINR(total.spent))}</span></div>
      <CategoryList rows={rows} over={over} onPick={onPick} first={first} />
    </section>
  );
}

const MONTH_BTN = 'w-11 h-11 rounded-xl border border-control-line bg-card text-ink flex items-center justify-center cursor-pointer disabled:border-line disabled:bg-transparent disabled:text-disabled-ink disabled:cursor-not-allowed';
const LINK_TILE = 'flex justify-between items-center min-h-[52px] p-3.5 bg-card border border-line rounded-card text-ink text-[15px] font-[650] text-left cursor-pointer [font-family:inherit] [&>svg]:text-muted';

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

  const pickedRow = picked ? s.rows.find((r) => r.category === picked) : undefined;
  const pickedLine = pickedRow ? [pickedRow.planned > 0 ? tr('{0} of {1}', fmtINR(pickedRow.spent), fmtINR(pickedRow.planned)) : fmtINR(pickedRow.spent), pickedRow.planned > 0 ? budgetText(pickedRow.group === 'Saving', pickedRow.spent, pickedRow.planned, pickedRow.group === 'EMI') : ''].filter(Boolean).join(' · ') : undefined;
  const sections = GROUPS.filter((g) => !group || g === group).map((g) => ({ g, rows: shown.filter((r) => r.group === g) })).filter((x) => x.rows.length > 0);
  const last = useMemo(() => summarizeMonth(budgetEntries(spend, app.me), planForMonth(app.mine, prevMonth), prevMonth), [spend, app.me, app.mine, prevMonth]);
  const lastSpent = last.totalSpent;
  const lastBy = useMemo(() => Object.fromEntries([...last.rows.map((r) => [r.category.toLowerCase(), r.spent] as const), ...last.extra.map((x) => [x.category.toLowerCase(), x.spent] as const)]), [last]);

  return (
    <section aria-label={tr('Month against plan')} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr('Month')}</h2>
        <div className="flex items-center gap-0.5">
          <button type="button" className={MONTH_BTN} aria-label={tr('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="back" size={20} stroke={2} /></button>
          <span className="min-w-[132px] text-center text-[16px] font-[650]" aria-live="polite">{monthLabel(month)}</span>
          <button type="button" className={MONTH_BTN} aria-label={tr('Next month')} disabled={month >= current} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron" size={20} stroke={2} /></button>
        </div>
      </div>

      <GroupTiles s={s} group={group} over={monthIsOver} onGroup={onGroup} />

      {noBudgets && <NoBudgetsCard suggestion={suggestion} offer={month === current} lastSpent={lastSpent} onSet={() => setEditing(true)} />}

      {group && (
        <p className="m-0 text-muted text-[13px]" role="status">
          {tr('Showing {0} only.', group)}{' '}<button type="button" className={ui.linkBtn} onClick={() => onGroup(undefined)}>{tr('Show all categories')}</button>
        </p>
      )}
      {group && shown.length === 0 && <p className="m-0 text-muted">{tr('No {0} categories have a budget or a payment this month.', group)}</p>}
      {sections.length > 0 && (
        <div className="grid gap-x-6 gap-y-4 items-start lg:grid-cols-2">
          {sections.map((x, i) => <GroupSection key={x.g} g={x.g} rows={x.rows} total={s.groups[x.g]} over={monthIsOver} onPick={setPicked} first={i === 0} />)}
        </div>
      )}

      {!group && s.extra.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Not in your categories')}</h3>
          <div className="bg-card border border-line rounded-card px-4 py-1">
            {s.extra.map((x, i) => (
              <div key={x.category} className={ui.cx('grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-center min-h-[58px]', i > 0 && 'border-t border-line')}>
                <span className="flex flex-col"><span className="text-[15px] font-semibold">{x.category}</span><span className="text-[13px] text-muted">{tr('not in any budget')}</span></span>
                <span className="text-[15px] font-bold tabular-nums">{fmtINR(x.spent)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={LINK_TILE} onClick={onInsights}>{tr('Insights')}<Icon name="chevron" size={18} /></button>
        <button type="button" className={LINK_TILE} onClick={onCashFlow}>{tr('Cash flow')}<Icon name="chevron" size={18} /></button>
      </div>
      <button type="button" className="self-start min-h-11 border-0 bg-transparent p-0 text-brand text-[15px] font-[650] underline underline-offset-2 cursor-pointer [font-family:inherit]" onClick={() => setEditing(true)}>{tr('Categories and budgets')}</button>
      {picked && (
        <CategoryActions
          category={picked}
          line={pickedLine}
          onBudget={() => { setFocusCat(picked); setEditing(true); }}
          onAddExpense={() => onAddExpense(picked)}
          onClose={() => setPicked(null)}
        />
      )}
      {editing && <BudgetsDialog focus={focusCat} lastMonth={monthLabel(prevMonth).split(' ')[0]} lastBy={lastBy} onClose={() => { setEditing(false); setFocusCat(undefined); }} />}
    </section>
  );
}

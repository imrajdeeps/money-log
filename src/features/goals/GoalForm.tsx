import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import type { Goal } from '../../core/goals.ts';
import { monthsLeft } from '../../core/goals.ts';
import { isoDate, parseAmount } from '../../core/logic.ts';
import { confirmRemoveGoal } from './confirmRemove.ts';
import { PageDialog } from '../../ui/PageDialog.tsx';
import { monthLabel } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// An amount typed in a field: blank or zero is 0 (allowed where an amount is optional), anything else must be a good amount.
const typed = (v: string): number | null => (v.trim() === '' || /^0+(\.0*)?$/.test(v.trim()) ? 0 : parseAmount(v));

// Making a goal, or changing one: a name, a target, a date, what is already saved, and (optionally) a category whose payments count.
export function GoalForm({ goal, onDone }: Readonly<{ goal?: Goal; onDone: () => void }>) {
  const app = useApp();
  const today = isoDate();
  const [name, setName] = useState(goal?.n ?? '');
  const [target, setTarget] = useState(goal ? String(goal.a) : '');
  const [date, setDate] = useState(goal?.d ?? '');
  const [saved, setSaved] = useState(goal && goal.s > 0 ? String(goal.s) : '');
  const [category, setCategory] = useState(goal?.c ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const categories = useMemo(() => {
    const names = [...new Set(app.categories.map((c) => c.name))].sort((a, b) => a.localeCompare(b));
    return goal?.c && !names.includes(goal.c) ? [goal.c, ...names] : names;
  }, [app.categories, goal]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const t = parseAmount(target);
    if (t === null) return setError(tr('Enter a target above zero, with at most two decimals.'));
    const s = typed(saved);
    if (s === null) return setError(tr('The amount already saved must be zero or more, with at most two decimals.'));
    setBusy(true);
    setError('');
    const input = { name, target: t, date, saved: s, category };
    const problem = goal ? await app.editGoal(goal.id, input) : await app.addGoal(input);
    setBusy(false);
    if (problem) return setError(problem);
    app.toast(goal ? tr('Goal saved') : tr('Goal added'));
    onDone();
  }

  async function remove() {
    if (!goal || !confirmRemoveGoal(goal.n)) return;
    setBusy(true);
    await app.removeGoal(goal.id);
    app.toast(tr('Removed: {0}', goal.n));
    onDone();
  }

  // the design's line under the form: what it needs each month to reach the target by the date
  const t = parseAmount(target.replace(/[₹,\s]/g, ''));
  const sv = parseAmount(saved.replace(/[₹,\s]/g, '')) ?? 0;
  const needs = t && date && date >= today && t > sv ? Math.ceil((t - sv) / monthsLeft(date, today)) : null;

  return (
    <PageDialog title={goal ? tr('Change goal') : tr('New goal')} back={tr('Plan')} onClose={onDone}>
      <form className="flex flex-col gap-[18px]" onSubmit={submit} noValidate>
        <label className={ui.fieldBare}><span>{tr('Name')}</span><input value={name} maxLength={60} placeholder={tr('Emergency fund, new laptop, trip')} onChange={(e) => { setName(e.target.value); setError(''); }} /></label>
        <label className={ui.fieldBare}><span>{tr('Target')}</span><input inputMode="decimal" value={target} placeholder="₹" onChange={(e) => { setTarget(e.target.value); setError(''); }} /></label>
        <label className={ui.fieldBare}><span>{tr('Saved so far')}</span><input inputMode="decimal" value={saved} placeholder="₹0" onChange={(e) => { setSaved(e.target.value); setError(''); }} /></label>
        <label className={ui.fieldBare}><span>{tr('By when')}</span><input type="date" value={date} min={goal ? undefined : today} onChange={(e) => { setDate(e.target.value); setError(''); }} /></label>
        <div>
          <label className={ui.fieldBare}>
            <span>{tr('Count payments in this category (optional)')}</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{tr('None: I will add what I set aside')}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <p className={ui.hint}>{tr('{0}Log a saving as a payment or add it as a top-up, not both, so it is not counted twice.', category ? tr('Payments you log in {0} from {1} on count towards this goal. ', category, goal ? goal.b : tr('today')) : '')}</p>
        </div>
        {needs !== null && t !== null && <p className="m-0 px-3.5 py-3 rounded-xl bg-good-bg text-good text-[14px] leading-5 font-semibold">{tr('Needs {0} a month to reach {1} by {2}.', fmtINR(needs), fmtINR(t), monthLabel(date.slice(0, 7)))}</p>}
        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
        <div className="flex flex-col gap-3">
          <button type="submit" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')} disabled={busy}>{tr('Save goal')}</button>
          {goal && <button type="button" className={ui.btn('dangerOutline', 'md')} disabled={busy} onClick={() => void remove()}>{tr('Delete goal')}</button>}
        </div>
      </form>
    </PageDialog>
  );
}

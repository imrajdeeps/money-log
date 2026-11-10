import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import type { Goal } from '../../core/goals.ts';
import { isoDate, parseAmount } from '../../core/logic.ts';

// An amount typed in a field: blank or zero is 0 (allowed where an amount is optional), anything else must be a good amount.
const typed = (v: string): number | null => (v.trim() === '' || /^0+(\.0*)?$/.test(v.trim()) ? 0 : parseAmount(v));

// Making a goal, or changing one: a name, a target, a date, what is already saved, and (optionally) a category whose payments count.
export function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
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
    if (t === null) return setError('Enter a target above zero, with at most two decimals.');
    const s = typed(saved);
    if (s === null) return setError('The amount already saved must be zero or more, with at most two decimals.');
    setBusy(true);
    setError('');
    const input = { name, target: t, date, saved: s, category };
    const problem = goal ? await app.editGoal(goal.id, input) : await app.addGoal(input);
    setBusy(false);
    if (problem) return setError(problem);
    app.toast(goal ? 'Goal saved' : 'Goal added');
    onDone();
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>{goal ? 'Change goal' : 'New goal'}</h2>
      <label className="field"><span>Goal</span><input value={name} maxLength={60} placeholder="Emergency fund, new laptop, trip" onChange={(e) => { setName(e.target.value); setError(''); }} /></label>
      <label className="field"><span>Target amount (₹)</span><input inputMode="decimal" value={target} placeholder="100000" onChange={(e) => { setTarget(e.target.value); setError(''); }} /></label>
      <label className="field"><span>Target date</span><input type="date" value={date} min={goal ? undefined : today} onChange={(e) => { setDate(e.target.value); setError(''); }} /></label>
      <label className="field"><span>Already saved (₹, optional)</span><input inputMode="decimal" value={saved} placeholder="0" onChange={(e) => { setSaved(e.target.value); setError(''); }} /></label>
      <label className="field">
        <span>Count payments in this category (optional)</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">None: I will add what I set aside</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <p className="muted small">
        {category ? `Payments you log in ${category} from ${goal ? goal.b : 'today'} on count towards this goal. ` : ''}
        Log a saving as a payment or add it as a top-up, not both, so it is not counted twice.
      </p>
      {error && <p className="msg bad" role="alert">{error}</p>}
      <div className="btnrow">
        <button type="submit" className="btn" disabled={busy}>{goal ? 'Save' : 'Add goal'}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { equalShares, fromPaise, toPaise } from '../../core/groups.ts';
import type { Group, Member, UsualSplit } from '../../core/groups.ts';
import { parseAmount } from '../../core/logic.ts';
import { useAction } from './useAction.ts';

const pctText = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}%`;

// Flatmates: how a new shared expense is split before anyone changes it. Everyone sees it; admins set it.
export function UsualSplitCard({ group, people, isAdmin }: { group: Group; people: Member[]; isAdmin: boolean }) {
  const app = useApp();
  const act = useAction();
  const usual = group.usual_split;
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'equal' | 'percent'>('equal');
  const [values, setValues] = useState<Record<string, string>>({});
  const me = app.me ?? '';
  const who = (m: Member) => (m.user_id === me ? 'You' : m.display_name);

  function startEditing() {
    const start = usual?.mode === 'percent' ? usual.percent : equalShares(100, people.map((p) => p.user_id));
    setValues(Object.fromEntries(people.map((p) => [p.user_id, String(start[p.user_id] ?? 0)])));
    setMode(usual?.mode ?? 'equal');
    act.setError('');
    setEditing(true);
  }

  // percentages as typed; null when one of them is not a number from 0 to 100
  const typed = people.map((p) => { const v = (values[p.user_id] ?? '').trim(); return v === '' || /^0+(\.0*)?$/.test(v) ? 0 : parseAmount(v); });
  const valid = typed.every((n) => n !== null && n <= 100);
  const total = valid ? fromPaise(typed.reduce<number>((a, n) => a + toPaise(n ?? 0), 0)) : null;
  const addsUp = mode === 'equal' || (total !== null && Math.abs(total - 100) < 0.005);

  async function save() {
    const split: UsualSplit = mode === 'equal'
      ? { mode: 'equal' }
      : { mode: 'percent', percent: Object.fromEntries(people.map((p, i) => [p.user_id, typed[i] ?? 0])) };
    if (await act.run(() => app.setUsualSplit(group.id, split), 'Usual split saved')) setEditing(false);
  }

  const late = usual?.mode === 'percent' ? people.filter((p) => usual.percent[p.user_id] === undefined) : [];
  return (
    <div className="card">
      <h3>Usual split</h3>
      {!editing && (
        <>
          <p>
            {usual?.mode === 'percent'
              ? people.map((p) => `${who(p)} ${pctText(usual.percent[p.user_id] ?? 0)}`).join(' · ')
              : 'Equal between everyone. Each new expense starts from this, and you can change it for a single expense.'}
          </p>
          {late.length > 0 && <p className="muted small">{late.map(who).join(', ')} joined after this was set and {late.length === 1 ? 'is' : 'are'} at 0% until an admin updates it.</p>}
          {isAdmin && (
            <div className="btnrow">
              <button type="button" className="btn ghost" onClick={startEditing}>{usual ? 'Change' : 'Set a usual split'}</button>
              {usual && <button type="button" className="btn ghost" disabled={act.busy} onClick={() => { void act.run(() => app.setUsualSplit(group.id, null), 'Usual split cleared'); }}>Clear</button>}
            </div>
          )}
        </>
      )}
      {editing && (
        <>
          <fieldset className="chips">
            <legend>Split</legend>
            <button type="button" className="chip" aria-pressed={mode === 'equal'} onClick={() => setMode('equal')}>Equal</button>
            <button type="button" className="chip" aria-pressed={mode === 'percent'} onClick={() => setMode('percent')}>Percent</button>
          </fieldset>
          {mode === 'percent' && (
            <ul className="list plainlist splitlist">
              {people.map((p) => (
                <li key={p.user_id} className="splitrow">
                  <span className="who">{who(p)}</span>
                  <input className="num" inputMode="decimal" aria-label={`Percent for ${p.display_name}`} placeholder="%" value={values[p.user_id] ?? ''} onChange={(e) => { setValues({ ...values, [p.user_id]: e.target.value }); act.setError(''); }} />
                </li>
              ))}
            </ul>
          )}
          {mode === 'percent' && (
            <p className={addsUp ? 'muted small' : 'msg bad'} role="status">
              {total === null ? 'Use numbers from 0 to 100 with at most 2 decimals.' : addsUp ? 'Adds up to 100%.' : `The percentages add up to ${pctText(total)}, not 100%.`}
            </p>
          )}
          <div className="btnrow">
            <button type="button" className="btn" disabled={act.busy || !addsUp} onClick={() => { void save(); }}>Save</button>
            <button type="button" className="btn ghost" disabled={act.busy} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      )}
      {act.error && <p className="msg bad" role="alert">{act.error}</p>}
    </div>
  );
}

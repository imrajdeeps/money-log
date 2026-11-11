import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { equalShares, fromPaise, toPaise } from '../../core/groups.ts';
import type { Group, Member, UsualSplit } from '../../core/groups.ts';
import { parseAmount } from '../../core/logic.ts';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const pctText = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}%`;

// Flatmates: how a new shared expense is split before anyone changes it. Everyone sees it; admins set it.
export function UsualSplitCard({ group, people, isAdmin }: Readonly<{ group: Group; people: Member[]; isAdmin: boolean }>) {
  const app = useApp();
  const act = useAction();
  const usual = group.usual_split;
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'equal' | 'percent'>('equal');
  const [values, setValues] = useState<Record<string, string>>({});
  const me = app.me ?? '';
  const who = (m: Member) => (m.user_id === me ? tr('You') : m.display_name);

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
    if (await act.run(() => app.setUsualSplit(group.id, split), tr('Usual split saved'))) setEditing(false);
  }

  const late = usual?.mode === 'percent' ? people.filter((p) => usual.percent[p.user_id] === undefined) : [];
  return (
    <div className={ui.card()}>
      <h3>{tr('Usual split')}</h3>
      {!editing && (
        <>
          <p>
            {usual?.mode === 'percent'
              ? people.map((p) => `${who(p)} ${pctText(usual.percent[p.user_id] ?? 0)}`).join(' · ')
              : tr('Equal between everyone. Each new expense starts from this, and you can change it for a single expense.')}
          </p>
          {late.length > 0 && <p className="text-muted text-[13px]">{tr('{0} joined after this was set and {1} at 0% until an admin updates it.', late.map(who).join(', '), late.length === 1 ? 'is' : 'are')}</p>}
          {isAdmin && (
            <div className={ui.btnRow}>
              <button type="button" className={ui.btn('ghost')} onClick={startEditing}>{usual ? tr('Change') : tr('Set a usual split')}</button>
              {usual && <button type="button" className={ui.btn('ghost')} disabled={act.busy} onClick={() => { void act.run(() => app.setUsualSplit(group.id, null), 'Usual split cleared'); }}>{tr('Clear')}</button>}
            </div>
          )}
        </>
      )}
      {editing && (
        <>
          <fieldset className={ui.chips}>
            <legend>{tr('Split')}</legend>
            <button type="button" className={ui.chip} aria-pressed={mode === 'equal'} onClick={() => setMode('equal')}>{tr('Equal')}</button>
            <button type="button" className={ui.chip} aria-pressed={mode === 'percent'} onClick={() => setMode('percent')}>{tr('Percent')}</button>
          </fieldset>
          {mode === 'percent' && (
            <ul className={ui.list(true, 'mt-2 mx-0 mb-0')}>
              {people.map((p) => (
                <li key={p.user_id} className={ui.splitRow}>
                  <span className="flex-1">{who(p)}</span>
                  <input className="w-24 text-right" inputMode="decimal" aria-label={tr('Percent for {0}', p.display_name)} placeholder="%" value={values[p.user_id] ?? ''} onChange={(e) => { setValues({ ...values, [p.user_id]: e.target.value }); act.setError(''); }} />
                </li>
              ))}
            </ul>
          )}
          {mode === 'percent' && (
            <p className={addsUp ? 'text-muted text-[13px]' : ui.msg('bad')} role="status">
              {total === null ? tr('Use numbers from 0 to 100 with at most 2 decimals.') : addsUp ? tr('Adds up to 100%.') : tr('The percentages add up to {0}, not 100%.', pctText(total))}
            </p>
          )}
          <div className={ui.btnRow}>
            <button type="button" className={ui.btn()} disabled={act.busy || !addsUp} onClick={() => { void save(); }}>{tr('Save')}</button>
            <button type="button" className={ui.btn('ghost')} disabled={act.busy} onClick={() => setEditing(false)}>{tr('Cancel')}</button>
          </div>
        </>
      )}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </div>
  );
}

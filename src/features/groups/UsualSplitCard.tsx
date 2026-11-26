import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { equalShares, fromPaise, toPaise } from '../../core/groups.ts';
import type { Group, Member, UsualSplit } from '../../core/groups.ts';
import { parseAmount } from '../../core/logic.ts';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import * as st from './settingsStyles.ts';
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
  const shown = editing ? mode : (usual?.mode ?? 'equal');
  function pick(next: 'equal' | 'percent') {
    if (next === 'percent') { startEditing(); setMode('percent'); return; }
    setEditing(false);
    if (usual?.mode === 'percent') void act.run(() => app.setUsualSplit(group.id, { mode: 'equal' }), tr('Usual split saved'));
  }
  return (
    <section className={st.section}>
      <h3 className={st.title}>{tr('Usual split')}</h3>
      <p className={st.note}>{tr('What a new expense starts with. You can change it on each one.')}</p>
      {isAdmin ? (
        <div className={ui.segment(2)} role="radiogroup" aria-label={tr('Usual split')}>
          <button type="button" role="radio" className={ui.segBtn} aria-checked={shown === 'equal'} disabled={act.busy} onClick={() => pick('equal')}>{tr('Equal')}</button>
          <button type="button" role="radio" className={ui.segBtn} aria-checked={shown === 'percent'} disabled={act.busy} onClick={() => pick('percent')}>{tr('Percent')}</button>
        </div>
      ) : <p className="m-0 text-[15px] font-semibold">{usual?.mode === 'percent' ? tr('Percent') : tr('Equal')}</p>}
      {!editing && usual?.mode === 'percent' && <p className="m-0 text-[15px]">{people.map((p) => `${who(p)} ${pctText(usual.percent[p.user_id] ?? 0)}`).join(' · ')}</p>}
      {!editing && late.length > 0 && <p className={st.small}>{tr('{0} joined after this was set and {1} at 0% until an admin updates it.', late.map(who).join(', '), late.length === 1 ? 'is' : 'are')}</p>}
      {!editing && isAdmin && usual?.mode === 'percent' && <button type="button" className={ui.btn('outline', 'none', st.outline44 + ' self-start')} onClick={startEditing}>{tr('Change the percentages')}</button>}
      {editing && (
        <>
          <ul className="list-none m-0 p-0">
            {people.map((p, i) => (
              <li key={p.user_id} className={ui.cx('grid grid-cols-[minmax(0,1fr)_112px] gap-3 items-center min-h-14', i > 0 && 'border-t border-line')}>
                <span className="text-[15px] font-semibold truncate">{who(p)}</span>
                <span className={ui.money}><input inputMode="decimal" aria-label={tr('Percent for {0}', p.display_name)} value={values[p.user_id] ?? ''} onChange={(e) => { setValues({ ...values, [p.user_id]: e.target.value }); act.setError(''); }} /><span aria-hidden="true">%</span></span>
              </li>
            ))}
          </ul>
          <p className={addsUp ? st.small : ui.msg('bad')} role="status">
            {total === null ? tr('Use numbers from 0 to 100 with at most 2 decimals.') : addsUp ? tr('Adds up to 100%.') : tr('The percentages add up to {0}, not 100%.', pctText(total))}
          </p>
          <div className="flex gap-2.5 [&>*]:flex-1">
            <button type="button" className={ui.btn()} disabled={act.busy || !addsUp} onClick={() => { void save(); }}>{tr('Save')}</button>
            <button type="button" className={ui.btn('outline')} disabled={act.busy} onClick={() => setEditing(false)}>{tr('Cancel')}</button>
          </div>
        </>
      )}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </section>
  );
}

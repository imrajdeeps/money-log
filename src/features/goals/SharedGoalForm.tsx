import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { useProfile } from '../../data/useProfile.ts';
import { circleName } from '../../core/circle.ts';
import type { CircleMember } from '../../core/circle.ts';
import { isoDate } from '../../core/logic.ts';
import { MAX_SHARED_PEOPLE, checkSharedInput } from '../../core/sharedGoals.ts';
import type { SharedGoal } from '../../core/sharedGoals.ts';
import { useAction } from '../groups/index.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Making a shared goal (a name, a target, a day, your name in it, and who to ask from your Circle), or changing one you made.
export function SharedGoalForm({ goal, circle, onDone }: Readonly<{ goal?: SharedGoal; circle: CircleMember[]; onDone: () => void }>) {
  const app = useApp();
  const profile = useProfile();
  const act = useAction();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [date, setDate] = useState(goal?.date ?? '');
  const [mine, setMine] = useState(profile.name);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const c = checkSharedInput({ name, target, date }, isoDate(), !goal);
    if (!c.ok) return setError(c.error);
    if (!goal && mine.trim() === '') return setError(tr('Enter the name the others will see you as.'));
    if (picked.length >= MAX_SHARED_PEOPLE) return setError(tr('A shared goal holds at most {0} people, you included.', MAX_SHARED_PEOPLE));
    setError('');
    const ok = await act.run(async () => {
      if (goal) await app.sharedGoals.edit(goal.id, c.name, c.target, c.date);
      else await app.sharedGoals.create(c.name, c.target, c.date, mine.trim(), picked);
    }, goal ? tr('Goal saved') : tr('Shared goal made'));
    if (ok) onDone();
  }

  return (
    <form className={ui.card()} onSubmit={(ev) => { void submit(ev); }} noValidate>
      <h2>{goal ? tr('Change shared goal') : tr('New shared goal')}</h2>
      <label className={ui.field}><span>{tr('Goal')}</span><input value={name} maxLength={60} placeholder={tr('Trip fund, a gift for Amma')} onChange={(e) => { setName(e.target.value); setError(''); }} /></label>
      <label className={ui.field}><span>{tr('Target amount (₹)')}</span><input inputMode="decimal" value={target} placeholder="30000" onChange={(e) => { setTarget(e.target.value); setError(''); }} /></label>
      <label className={ui.field}><span>{tr('Target date')}</span><input type="date" value={date} min={goal ? undefined : isoDate()} onChange={(e) => { setDate(e.target.value); setError(''); }} /></label>
      {!goal && (
        <>
          <label className={ui.field}><span>{tr('Your name in this goal')}</span><input value={mine} maxLength={40} onChange={(e) => { setMine(e.target.value); setError(''); }} /></label>
          <fieldset className="m-0 mt-2 border-0 p-0">
            <legend className="mb-1 font-semibold">{tr('Ask people from your Circle')}</legend>
            {circle.length === 0 && <p className="text-muted text-[13px]">{tr('Your Circle is empty. Join a group, or add someone with a code on the Circle page, then ask them.')}</p>}
            {circle.map((m) => (
              <label key={m.user_id} className="flex items-center gap-2 py-1">
                <input type="checkbox" checked={picked.includes(m.user_id)} onChange={() => toggle(m.user_id)} /> {circleName(m)}
              </label>
            ))}
            <p className="text-muted text-[13px]">{tr('They join only if they accept. You can ask more people later.')}</p>
          </fieldset>
        </>
      )}
      {(error || act.error) && <p className={ui.msg('bad')} role="alert">{error || act.error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={act.busy}>{goal ? tr('Save') : tr('Make shared goal')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={act.busy} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { circleName } from '../../core/circle.ts';
import type { CircleMember } from '../../core/circle.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR, isValidDate, isoDate, parseAmount } from '../../core/logic.ts';
import { MAX_SHARED_PEOPLE, sharedName, sharedProgress } from '../../core/sharedGoals.ts';
import type { SharedGoal } from '../../core/sharedGoals.ts';
import { useAction } from '../groups/index.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Add your own top-up to a shared goal.
function AddTopUp({ goal, onChanged }: Readonly<{ goal: SharedGoal; onChanged: () => void }>) {
  const app = useApp();
  const act = useAction();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(isoDate());
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const a = parseAmount(amount);
    if (a === null) return act.setError(tr('Enter an amount above zero, with at most two decimals.'));
    if (!isValidDate(date) || date > isoDate()) return act.setError(tr('Pick a day that is today or earlier.'));
    if (await act.run(() => app.sharedGoals.addTopUp(goal.id, a, date), tr('Added {0} to {1}', fmtINR(a), goal.name))) { setAmount(''); onChanged(); }
  }
  return (
    <form className="mt-2" onSubmit={(ev) => { void submit(ev); }} noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <input className="min-w-[7rem] flex-1" inputMode="decimal" value={amount} placeholder={tr('Amount (₹)')} aria-label={tr('Amount (₹)')} onChange={(e) => { setAmount(e.target.value); act.setError(''); }} />
        <input className="w-[10.5rem]" type="date" value={date} max={isoDate()} aria-label={tr('Date')} onChange={(e) => setDate(e.target.value)} />
        <button type="submit" className={ui.btn('solid', 'small')} disabled={act.busy}>{tr('Add')}</button>
      </div>
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </form>
  );
}

// What the creator may do: ask people from the Circle, take someone out, change or delete the goal. Anyone else: leave.
function Manage({ goal, circle, onEdit, onChanged }: Readonly<{ goal: SharedGoal; circle: CircleMember[]; onEdit: () => void; onChanged: () => void }>) {
  const app = useApp();
  const act = useAction();
  const mine = goal.created_by === app.me;
  const inGoal = new Set(goal.members.filter((m) => m.state !== 'left').map((m) => m.user_id));
  const askable = circle.filter((m) => !inGoal.has(m.user_id));
  const people = goal.members.filter((m) => m.state !== 'left').length;
  const [pick, setPick] = useState('');
  const run = (fn: () => Promise<unknown>, done: string) => { void act.run(fn, done).then((ok) => { if (ok) onChanged(); }); };
  return (
    <div className="mt-3">
      {mine && askable.length > 0 && people < MAX_SHARED_PEOPLE && (
        <div className="flex gap-2">
          <select className="min-w-0 flex-1" value={pick} aria-label={tr('Ask someone from your Circle')} onChange={(e) => setPick(e.target.value)}>
            <option value="">{tr('Ask someone from your Circle…')}</option>
            {askable.map((m) => <option key={m.user_id} value={m.user_id}>{circleName(m)}</option>)}
          </select>
          <button type="button" className={ui.btn('ghost', 'small')} disabled={act.busy || !pick} onClick={() => { run(() => app.sharedGoals.invite(goal.id, pick), tr('Invitation sent')); setPick(''); }}>{tr('Ask')}</button>
        </div>
      )}
      <div className={ui.btnRow}>
        {mine && <button type="button" className={ui.btn('ghost', 'small')} onClick={onEdit}>{tr('Change goal')}</button>}
        {mine && <button type="button" className={ui.btn('danger', 'small')} disabled={act.busy} onClick={() => { if (window.confirm(tr('Delete the shared goal "{0}" for everyone in it? Every top-up goes with it. This cannot be undone.', goal.name))) run(() => app.sharedGoals.remove(goal.id), tr('Removed: {0}', goal.name)); }}>{tr('Delete goal')}</button>}
        {!mine && <button type="button" className={ui.btn('danger', 'small')} disabled={act.busy} onClick={() => { if (window.confirm(tr('Leave the shared goal "{0}"? You will stop seeing it. What you put in stays for the others.', goal.name))) run(() => app.sharedGoals.leave(goal.id), tr('You left {0}', goal.name)); }}>{tr('Leave goal')}</button>}
      </div>
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </div>
  );
}

// One shared goal: the bar, what each person put in, your own top-up, and the tools for your role.
export function SharedGoalCard({ goal, circle, onEdit, onChanged }: Readonly<{ goal: SharedGoal; circle: CircleMember[]; onEdit: () => void; onChanged: () => void }>) {
  const app = useApp();
  const act = useAction();
  const p = sharedProgress(goal);
  const circleNameOf = (id: string) => { const m = circle.find((c) => c.user_id === id); return m ? circleName(m) : ''; };
  const mineList = goal.topups.filter((t) => t.user_id === app.me);
  const asked = goal.members.filter((m) => m.state === 'invited');
  const isCreator = goal.created_by === app.me;
  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className={ui.rowMain()}><b>{goal.name}</b><small>{tr('by {0}', shortDate(goal.date))}</small></span>
        <span className="font-bold tabular-nums">{fmtINR(p.saved)} <small className="text-muted">{tr('of {0}', fmtINR(goal.target))}</small></span>
      </div>
      <div className={ui.meter(p.reached ? 'good' : 'accent', 'mt-2.5 mb-1.5')} role="img" aria-label={tr('{0} percent of the target', Math.round(p.fraction * 100))}><i style={{ width: `${Math.round(p.fraction * 100)}%` }} /></div>
      <p className={`m-0 text-sm ${p.reached ? 'font-semibold text-good' : ''}`}>{p.reached ? tr('Reached') : tr('{0} to go', fmtINR(p.remaining))}</p>
      <ul className="m-0 mt-2 list-none p-0 text-[13px]">
        {p.people.map((x) => (
          <li key={x.user_id} className="flex justify-between py-0.5">
            <span>{sharedName(x, circleNameOf)}{x.user_id === app.me ? ` ${tr('(you)')}` : ''}{x.state === 'left' ? ` · ${tr('left')}` : ''}</span>
            <span className="tabular-nums">{fmtINR(x.amount)}</span>
          </li>
        ))}
      </ul>
      {asked.length > 0 && (
        <p className="mt-1 mb-0 text-[13px] text-muted">
          {tr('Asked, not answered yet: {0}', asked.map((m) => sharedName(m, circleNameOf)).join(', '))}
          {isCreator && asked.map((m) => (
            <button key={m.user_id} type="button" className={`${ui.linkBtn} ml-2`} disabled={act.busy} onClick={() => { void act.run(() => app.sharedGoals.removePerson(goal.id, m.user_id), tr('Invitation withdrawn')).then((ok) => { if (ok) onChanged(); }); }}>{tr('Withdraw {0}', sharedName(m, circleNameOf))}</button>
          ))}
        </p>
      )}
      <AddTopUp goal={goal} onChanged={onChanged} />
      {mineList.length > 0 && (
        <details className="mt-2 text-[13px]">
          <summary>{tr('Your top-ups ({0})', mineList.length)}</summary>
          <ul className="m-0 list-none p-0">
            {mineList.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-0.5">
                <span>{shortDate(t.date)} · {fmtINR(t.amount)}</span>
                <button type="button" className={ui.linkBtn} disabled={act.busy} onClick={() => { if (window.confirm(tr('Remove this top-up of {0}?', fmtINR(t.amount)))) void act.run(() => app.sharedGoals.removeTopUp(goal.id, t.id), tr('Top-up removed')).then((ok) => { if (ok) onChanged(); }); }}>{tr('Remove')}</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {isCreator && goal.members.filter((m) => m.state === 'active' && m.user_id !== app.me).map((m) => (
        <button key={m.user_id} type="button" className={`${ui.linkBtn} mr-3 mt-1 text-[13px]`} disabled={act.busy} onClick={() => { if (window.confirm(tr('Take {0} out of "{1}"? What they put in stays in the total.', sharedName(m, circleNameOf), goal.name))) void act.run(() => app.sharedGoals.removePerson(goal.id, m.user_id), tr('Removed')).then((ok) => { if (ok) onChanged(); }); }}>{tr('Take {0} out', sharedName(m, circleNameOf))}</button>
      ))}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
      <Manage goal={goal} circle={circle} onEdit={onEdit} onChanged={onChanged} />
    </li>
  );
}

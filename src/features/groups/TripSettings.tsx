import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import type { Group } from '../../core/groups.ts';
import { shortDate } from '../../core/format.ts';
import { useAction } from './useAction.ts';

// The trip's own settings: its dates, and closing it once everything is settled. Admins change them; everyone sees them.
export function TripSettings({ group, isAdmin }: { group: Group; isAdmin: boolean }) {
  const app = useApp();
  const act = useAction();
  const [starts, setStarts] = useState(group.starts_on ?? '');
  const [ends, setEnds] = useState(group.ends_on ?? '');
  const closed = group.closed_at !== null;

  async function saveDates(ev: FormEvent) {
    ev.preventDefault();
    if (starts && ends && ends < starts) { act.setError('The trip cannot end before it starts.'); return; }
    await act.run(() => app.setTripDates(group.id, starts || null, ends || null), 'Dates saved');
  }

  if (!isAdmin && !closed) return null;
  return (
    <div className="card">
      <h3>Trip</h3>
      {closed && <p className="closedbanner">Closed on {shortDate(group.closed_at!.slice(0, 10))}. No new expenses or people; settling up still works.</p>}
      {isAdmin && (
        <form onSubmit={saveDates} noValidate>
          <div className="btnrow">
            <label className="field half"><span>First day</span><input type="date" value={starts} onChange={(e) => { setStarts(e.target.value); act.setError(''); }} /></label>
            <label className="field half"><span>Last day</span><input type="date" value={ends} min={starts || undefined} onChange={(e) => { setEnds(e.target.value); act.setError(''); }} /></label>
          </div>
          <button type="submit" className="btn ghost" disabled={act.busy}>Save dates</button>
        </form>
      )}
      {isAdmin && (
        <button
          type="button"
          className={closed ? 'btn ghost' : 'btn'}
          disabled={act.busy}
          onClick={() => {
            const question = closed ? 'Reopen this trip? People can add expenses and join with the code again.' : 'Close this trip? Nobody can add expenses or join. Settling up still works, and you can reopen it.';
            if (window.confirm(question)) void act.run(() => app.setGroupClosed(group.id, !closed), closed ? 'Trip reopened' : 'Trip closed');
          }}
        >
          {closed ? 'Reopen trip' : 'Close trip'}
        </button>
      )}
      {act.error && <p className="msg bad" role="alert">{act.error}</p>}
    </div>
  );
}

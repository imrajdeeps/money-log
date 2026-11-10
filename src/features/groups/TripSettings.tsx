import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import type { Group } from '../../core/groups.ts';
import { shortDate } from '../../core/format.ts';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The trip's own settings: its dates, and closing it once everything is settled. Admins change them; everyone sees them.
export function TripSettings({ group, isAdmin }: { group: Group; isAdmin: boolean }) {
  const app = useApp();
  const act = useAction();
  const [starts, setStarts] = useState(group.starts_on ?? '');
  const [ends, setEnds] = useState(group.ends_on ?? '');
  const closed = group.closed_at !== null;

  async function saveDates(ev: FormEvent) {
    ev.preventDefault();
    if (starts && ends && ends < starts) { act.setError(tr('The trip cannot end before it starts.')); return; }
    await act.run(() => app.setTripDates(group.id, starts || null, ends || null), tr('Dates saved'));
  }

  if (!isAdmin && !closed) return null;
  return (
    <div className={ui.card()}>
      <h3>{tr('Trip')}</h3>
      {closed && <p className={ui.closedBanner}>{tr('Closed on {0}. No new expenses or people; settling up still works.', shortDate(group.closed_at!.slice(0, 10)))}</p>}
      {isAdmin && (
        <form onSubmit={saveDates} noValidate>
          <div className={ui.btnRow}>
            <label className={ui.fieldHalf}><span>{tr('First day')}</span><input type="date" value={starts} onChange={(e) => { setStarts(e.target.value); act.setError(''); }} /></label>
            <label className={ui.fieldHalf}><span>{tr('Last day')}</span><input type="date" value={ends} min={starts || undefined} onChange={(e) => { setEnds(e.target.value); act.setError(''); }} /></label>
          </div>
          <button type="submit" className={ui.btn('ghost')} disabled={act.busy}>{tr('Save dates')}</button>
        </form>
      )}
      {isAdmin && (
        <button
          type="button"
          className={ui.btn(closed ? 'ghost' : 'solid', 'md', ui.inCard)}
          disabled={act.busy}
          onClick={() => {
            const question = closed ? 'Reopen this trip? People can add expenses and join with the code again.' : 'Close this trip? Nobody can add expenses or join. Settling up still works, and you can reopen it.';
            if (window.confirm(question)) void act.run(() => app.setGroupClosed(group.id, !closed), closed ? 'Trip reopened' : 'Trip closed');
          }}
        >
          {closed ? tr('Reopen trip') : tr('Close trip')}
        </button>
      )}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </div>
  );
}

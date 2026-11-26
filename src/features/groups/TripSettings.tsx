import { useState } from 'react';
import { ask } from '../../ui/confirm.tsx';
import { useApp } from '../../data/context.tsx';
import type { Group } from '../../core/groups.ts';
import { shortDate } from '../../core/format.ts';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import * as st from './settingsStyles.ts';
import { tr } from '../../core/i18n.ts';

type Action = ReturnType<typeof useAction>;

// The trip's first and last day. Each is saved as soon as it is changed (admins only).
function TripDates({ starts, ends, act, onStarts, onEnds }: Readonly<{ starts: string; ends: string; act: Action; onStarts: (v: string) => void; onEnds: (v: string) => void }>) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <label className={ui.fieldBare}><span>{tr('First day')}</span><input type="date" value={starts} disabled={act.busy} onChange={(e) => onStarts(e.target.value)} /></label>
      <label className={ui.fieldBare}><span>{tr('Last day')}</span><input type="date" value={ends} min={starts || undefined} disabled={act.busy} onChange={(e) => onEnds(e.target.value)} /></label>
    </div>
  );
}

// Closes the trip (nobody can add expenses or join; settling up still works) or opens it again; asks first.
function CloseTrip({ group, closed, act }: Readonly<{ group: Group; closed: boolean; act: Action }>) {
  const app = useApp();
  function toggle() {
    const question = closed ? 'Reopen this trip? People can add expenses and join with the code again.' : 'Close this trip? Nobody can add expenses or join. Settling up still works, and you can reopen it.';
    void ask(question, closed ? tr('Reopen the trip') : tr('Close the trip'), 'go').then((yes) => { if (yes) void act.run(() => app.setGroupClosed(group.id, !closed), closed ? 'Trip reopened' : 'Trip closed'); });
  }
  return (
    <button type="button" className={ui.btn('outline')} disabled={act.busy} onClick={toggle}>
      {closed ? tr('Reopen the trip') : tr('Close the trip')}
    </button>
  );
}

// The trip's own settings: its dates, and closing it once everything is settled. Admins change them; everyone sees them.
export function TripSettings({ group, isAdmin }: Readonly<{ group: Group; isAdmin: boolean }>) {
  const app = useApp();
  const act = useAction();
  const [starts, setStarts] = useState(group.starts_on ?? '');
  const [ends, setEnds] = useState(group.ends_on ?? '');
  const closed = group.closed_at !== null;

  function saveDates(s: string, e: string) {
    setStarts(s); setEnds(e); act.setError('');
    if (s && e && e < s) { act.setError(tr('The trip cannot end before it starts.')); return; }
    void act.run(() => app.setTripDates(group.id, s || null, e || null), tr('Dates saved'));
  }

  if (!isAdmin && !closed) return null;
  return (
    <section className={st.section}>
      <h3 className={st.title}>{tr('Trip')}</h3>
      {isAdmin && <TripDates starts={starts} ends={ends} act={act} onStarts={(v) => saveDates(v, ends)} onEnds={(v) => saveDates(starts, v)} />}
      <p className={st.note}>{closed
        ? tr('Closed on {0}. No new expenses or people; settling up still works.', shortDate(group.closed_at!.slice(0, 10)))
        : tr('Close the trip when everyone is back and settled. No new expenses can be added after that; you can reopen it.')}</p>
      {isAdmin && <CloseTrip group={group} closed={closed} act={act} />}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </section>
  );
}

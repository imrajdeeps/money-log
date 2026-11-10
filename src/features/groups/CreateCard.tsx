import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import type { Group } from '../../core/groups.ts';
import { GROUP_KINDS } from '../../core/groupKinds.ts';
import type { GroupKind } from '../../core/groupKinds.ts';
import { rememberedName, rememberName, useAction } from './useAction.ts';

export function CreateCard() {
  const app = useApp();
  const { busy, error, run, setError } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<GroupKind>('family');
  const [name, setName] = useState(rememberedName());
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');

  async function create(ev: FormEvent) {
    ev.preventDefault();
    if (!title.trim()) return setError('Give the group a name.');
    if (!name.trim()) return setError('Enter the name the others will see you as.');
    if (kind === 'trip' && starts && ends && ends < starts) return setError('The trip cannot end before it starts.');
    rememberName(name.trim());
    const made = await run(async () => {
      const id = await app.createGroup(title.trim(), kind, name.trim());
      if (kind === 'trip' && (starts || ends)) await app.setTripDates(id, starts || null, ends || null); // optional
    }, 'Group created');
    if (made) { setTitle(''); setStarts(''); setEnds(''); setOpen(false); }
  }

  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>Create a group</button>;
  return (
    <form className="card" onSubmit={create} noValidate>
      <h2>New group</h2>
      <label className="field"><span>Group name</span><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Home, or Goa trip" /></label>
      <fieldset className="kinds">
        <legend>Kind</legend>
        {GROUP_KINDS.map((k) => (
          <button key={k.id} type="button" className="kindcard" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            <b>{k.label}</b>
            <span>{k.blurb}</span>
          </button>
        ))}
      </fieldset>
      {kind === 'trip' && (
        <div className="btnrow">
          <label className="field half"><span>First day (optional)</span><input type="date" value={starts} onChange={(e) => { setStarts(e.target.value); setError(''); }} /></label>
          <label className="field half"><span>Last day (optional)</span><input type="date" value={ends} min={starts || undefined} onChange={(e) => { setEnds(e.target.value); setError(''); }} /></label>
        </div>
      )}
      <label className="field"><span>Your name in this group</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
      {error && <p className="msg bad" role="alert">{error}</p>}
      <div className="btnrow">
        <button type="submit" className="btn" disabled={busy}>Create</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </div>
    </form>
  );
}

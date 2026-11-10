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

  async function create(ev: FormEvent) {
    ev.preventDefault();
    if (!title.trim()) return setError('Give the group a name.');
    if (!name.trim()) return setError('Enter the name the others will see you as.');
    rememberName(name.trim());
    if (await run(() => app.createGroup(title.trim(), kind, name.trim()), 'Group created')) { setTitle(''); setOpen(false); }
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
      <label className="field"><span>Your name in this group</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
      {error && <p className="msg bad" role="alert">{error}</p>}
      <div className="btnrow">
        <button type="submit" className="btn" disabled={busy}>Create</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </div>
    </form>
  );
}

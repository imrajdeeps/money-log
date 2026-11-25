import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { GROUP_KINDS } from '../../core/groupKinds.ts';
import type { GroupKind } from '../../core/groupKinds.ts';
import { rememberedName, rememberName, useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// What is wrong with a new group, in words, or null when it is fine.
function newGroupProblem(f: { title: string; name: string; kind: GroupKind; starts: string; ends: string }): string | null {
  if (!f.title.trim()) return tr('Give the group a name.');
  if (!f.name.trim()) return tr('Enter the name the others will see you as.');
  if (f.kind === 'trip' && f.starts && f.ends && f.ends < f.starts) return tr('The trip cannot end before it starts.');
  return null;
}

// A trip's first and last day, both optional.
function TripDays({ starts, ends, onStarts, onEnds }: Readonly<{ starts: string; ends: string; onStarts: (v: string) => void; onEnds: (v: string) => void }>) {
  return (
    <div className={ui.btnRow}>
      <label className={ui.fieldHalf}><span>{tr('First day (optional)')}</span><input type="date" value={starts} onChange={(e) => onStarts(e.target.value)} /></label>
      <label className={ui.fieldHalf}><span>{tr('Last day (optional)')}</span><input type="date" value={ends} min={starts || undefined} onChange={(e) => onEnds(e.target.value)} /></label>
    </div>
  );
}

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
    const problem = newGroupProblem({ title, name, kind, starts, ends });
    if (problem) return setError(problem);
    rememberName(name.trim());
    const made = await run(async () => {
      const id = await app.createGroup(title.trim(), kind, name.trim());
      if (kind === 'trip' && (starts || ends)) await app.setTripDates(id, starts || null, ends || null); // optional
    }, tr('Group created'));
    if (made) { setTitle(''); setStarts(''); setEnds(''); setOpen(false); }
  }

  if (!open) return <button type="button" className={ui.btn()} onClick={() => setOpen(true)}>{tr('Create a group')}</button>;
  return (
    <form className={ui.card()} onSubmit={create} noValidate>
      <h2>{tr('New group')}</h2>
      <label className={ui.field}><span>{tr('Group name')}</span><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder={tr('Home, or Goa trip')} /></label>
      <fieldset className={ui.kinds}>
        <legend>{tr('Kind')}</legend>
        {GROUP_KINDS.map((k) => (
          <button key={k.id} type="button" className={ui.kindCard} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            <b>{tr(k.label)}</b>
            <span>{tr(k.blurb)}</span>
          </button>
        ))}
      </fieldset>
      {kind === 'trip' && <TripDays starts={starts} ends={ends} onStarts={(v) => { setStarts(v); setError(''); }} onEnds={(v) => { setEnds(v); setError(''); }} />}
      <label className={ui.field}><span>{tr('Your name in this group')}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{tr('Create')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={() => { setOpen(false); setError(''); }}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}

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


// Creating a group, as the design's page: a name, the kind as cards with their line, the trip's days, your name, a word on what is
// shared, and Create group.
export function CreateCard({ onDone }: Readonly<{ onDone: () => void }>) {
  const app = useApp();
  const { busy, error, run, setError } = useAction();
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
    if (made) onDone();
  }

  return (
    <form className="flex flex-col gap-4 max-w-[600px]" onSubmit={create} noValidate>
      <label className={ui.fieldBare}><span>{tr('Name')}</span><input value={title} maxLength={60} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder={tr('Home, or Goa trip')} /></label>
      <fieldset className="border-0 p-0 m-0">
        <legend className="p-0 mb-2 text-[13px] font-semibold text-ink">{tr('Kind')}</legend>
        <div className="grid gap-2 lg:grid-cols-2">
          {GROUP_KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}
              className="text-left flex flex-col gap-0.5 min-h-16 px-3.5 py-3 rounded-[14px] border border-control-line bg-card text-ink cursor-pointer [font-family:inherit] aria-pressed:border-2 aria-pressed:border-brand aria-pressed:px-[13px] aria-pressed:py-[11px]">
              <span className="text-[16px] font-[650]">{tr(k.label)}</span>
              <span className="text-[13px] leading-[18px] text-muted">{tr(k.blurb)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {kind === 'trip' && (
        <div className="grid grid-cols-2 gap-2.5">
          <label className={ui.fieldBare}><span>{tr('First day')}</span><input type="date" value={starts} onChange={(e) => { setStarts(e.target.value); setError(''); }} /></label>
          <label className={ui.fieldBare}><span>{tr('Last day')}</span><input type="date" value={ends} min={starts || undefined} onChange={(e) => { setEnds(e.target.value); setError(''); }} /></label>
        </div>
      )}
      <div>
        <label className={ui.fieldBare}><span>{tr('Your name in this group')}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
        <p className={ui.hint}>{tr('What the others see next to your expenses.')}</p>
      </div>
      <p className="m-0 text-[14px] leading-5 text-muted">{tr('Everyone you invite sees the expenses and payments in this group. Nothing else from your Hisaab is shared.')}</p>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <button type="submit" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')} disabled={busy}>{tr('Create group')}</button>
    </form>
  );
}

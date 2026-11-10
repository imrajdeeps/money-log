import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { codeLooksValid, formatCode, normalizeCode } from '../../core/groups.ts';
import { rememberedName, rememberName, useAction } from './useAction.ts';

export function JoinCard() {
  const app = useApp();
  const { busy, error, run, setError } = useAction();
  const invited = app.joinCode;
  const [code, setCode] = useState(invited ? formatCode(invited) : '');
  const [name, setName] = useState(rememberedName());
  const [open, setOpen] = useState(Boolean(invited));
  // A link opened while the app is already running: show the form with its code.
  useEffect(() => { if (invited) { setCode(formatCode(invited)); setOpen(true); } }, [invited]);

  async function join(ev: FormEvent) {
    ev.preventDefault();
    if (!codeLooksValid(code)) return setError('The code has 12 letters and digits, like ABCD-EF01-2345.');
    if (!name.trim()) return setError('Enter the name the others will see you as.');
    rememberName(name.trim());
    if (await run(() => app.joinGroup(normalizeCode(code), name.trim()), 'You have joined the group')) { setCode(''); setOpen(false); }
  }

  if (!open) return <button type="button" className="btn ghost" onClick={() => setOpen(true)}>Join a group with a code</button>;
  return (
    <form className={`card${invited ? ' notice' : ''}`} onSubmit={join} noValidate>
      <h2>{invited ? 'You were invited to a group' : 'Join a group'}</h2>
      <p className="muted small">The code comes from the person who made the group. Joining means they, and everyone in it, can see the expenses you share there.</p>
      <label className="field"><span>Code</span><input value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-EF01-2345" /></label>
      <label className="field"><span>Your name in this group</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
      {error && <p className="msg bad" role="alert">{error}</p>}
      <div className="btnrow">
        <button type="submit" className="btn" disabled={busy}>Join</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { setOpen(false); setError(''); app.clearJoinCode(); }}>Cancel</button>
      </div>
    </form>
  );
}

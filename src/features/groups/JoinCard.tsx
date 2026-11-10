import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { codeLooksValid, formatCode, normalizeCode } from '../../core/groups.ts';
import { rememberedName, rememberName, useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

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
    if (!codeLooksValid(code)) return setError(tr('The code has 12 letters and digits, like ABCD-EF01-2345.'));
    if (!name.trim()) return setError(tr('Enter the name the others will see you as.'));
    rememberName(name.trim());
    if (await run(() => app.joinGroup(normalizeCode(code), name.trim()), tr('You have joined the group'))) { setCode(''); setOpen(false); }
  }

  if (!open) return <button type="button" className={ui.btn('ghost')} onClick={() => setOpen(true)}>{tr('Join a group with a code')}</button>;
  return (
    <form className={ui.card(invited ? 'notice' : undefined)} onSubmit={join} noValidate>
      <h2>{invited ? tr('You were invited to a group') : tr('Join a group')}</h2>
      <p className="text-muted text-[13px]">{tr('The code comes from the person who made the group. Joining means they, and everyone in it, can see the expenses you share there.')}</p>
      <label className={ui.field}><span>{tr('Code')}</span><input value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-EF01-2345" /></label>
      <label className={ui.field}><span>{tr('Your name in this group')}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{tr('Join')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={() => { setOpen(false); setError(''); app.clearJoinCode(); }}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}

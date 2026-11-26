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
  const [, setOpen] = useState(Boolean(invited));
  // A link opened while the app is already running: show the form with its code.
  useEffect(() => { if (invited) { setCode(formatCode(invited)); setOpen(true); } }, [invited]);

  async function join(ev: FormEvent) {
    ev.preventDefault();
    if (!codeLooksValid(code)) return setError(tr('The code has 12 letters and digits, like ABCD-EF01-2345.'));
    if (!name.trim()) return setError(tr('Enter the name the others will see you as.'));
    rememberName(name.trim());
    if (await run(() => app.joinGroup(normalizeCode(code), name.trim()), tr('You have joined the group'))) { setCode(''); setOpen(false); }
  }

  const needName = !rememberedName().trim() || Boolean(invited);
  // The design's card: a line of help, the code and Join side by side (the name only when the app does not know it yet).
  return (
    <form className={ui.cx('flex flex-col gap-2.5 border rounded-card p-4', invited ? 'bg-warn-bg border-transparent' : 'bg-card border-line')} onSubmit={join} noValidate>
      <h2 className="m-0 text-[16px] font-[650] text-ink">{invited ? tr('You were invited to a group') : tr('Join a group with a code')}</h2>
      <p className="m-0 text-[14px] leading-5 text-muted">{tr('Someone in the group can find its code in the group\'s settings.')}</p>
      {needName && <label className={ui.fieldBare}><span>{tr('Your name in this group')}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input value={code} aria-label={tr('Group code')} className="tracking-[0.04em]" onChange={(e) => { setCode(e.target.value); setError(''); }} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="2573-903B-371D" />
        <button type="submit" className={ui.btn('outline', 'none', 'min-h-12 px-[18px] text-[15px]')} disabled={busy}>{tr('Join')}</button>
      </div>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      {invited && <button type="button" className={ui.linkBtn + ' self-start text-[14px]'} disabled={busy} onClick={() => { setOpen(false); setError(''); app.clearJoinCode(); }}>{tr('Not now')}</button>}
    </form>
  );
}

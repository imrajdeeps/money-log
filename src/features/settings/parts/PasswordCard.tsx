import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { MIN_PASSWORD } from '../../../data/password.ts';
import { errText } from './shared.ts';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
import { tr } from '../../../core/i18n.ts';

type Note = { text: string; bad: boolean };

// Change password, as on the design. Signed in, no old password is needed; the new one is not kept on this phone.
export function PasswordCard() {
  const app = useApp();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note | null>(null);
  if (!app.syncEnabled || app.sync.mode === 'signedout' || app.sync.mode === 'local') return null;

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (password !== password2) { setMsg({ text: tr('The two passwords are not the same.'), bad: true }); return; }
    setBusy(true); setMsg(null);
    try {
      await app.changePassword(password);
      setPassword(''); setPassword2('');
      setMsg({ text: tr('Password saved. You can now sign in with your email and this password.'), bad: false });
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  return (
    <form className={ps.card} onSubmit={save} noValidate>
      <h3 className={ps.title}>{tr('Change password')}</h3>
      {app.recovering && <p className={ui.msg('good')} role="status">{tr('You opened a reset link, so you are signed in. Choose a new password now.')}</p>}
      <label className={ui.fieldBare}>
        <span>{tr('New password')}</span>
        <input type="password" autoComplete="new-password" placeholder={tr('At least {0} characters', MIN_PASSWORD)} value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} disabled={busy} />
      </label>
      <label className={ui.fieldBare}>
        <span>{tr('Repeat the new password')}</span>
        <input type="password" autoComplete="new-password" value={password2} onChange={(e) => { setPassword2(e.target.value); setMsg(null); }} disabled={busy} />
      </label>
      {msg && <p className={ui.msg(msg.bad ? 'bad' : 'good')} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      <button type="submit" className={ui.btn('solid', 'none', ps.save)} disabled={busy || !password || !password2}>{tr('Change password')}</button>
      <p className={ps.small}>{tr('You are signed in, so no old password is needed. Others cannot see the new one and it is not kept on this phone.')}</p>
    </form>
  );
}

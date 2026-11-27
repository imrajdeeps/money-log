import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { MIN_PASSWORD } from '../../data/password.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const problem = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// An invitation link was opened by someone who is not signed in yet: instead of "sign in first, somewhere else", the way in is here.
// Create an account (or sign in), and the Groups page, with the code already filled in, takes over.
export function JoinInvite() {
  const app = useApp();
  const [how, setHow] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (how === 'signup' && password !== again) { setMsg({ text: tr('The two passwords are not the same.'), bad: true }); return; }
    setBusy(true);
    setMsg(null);
    try {
      if (how === 'signin') {
        await app.signInWithPassword(email.trim(), password);
      } else if ((await app.signUp(email.trim(), password)) === 'confirm') {
        setMsg({ text: tr('Almost there: open the confirmation link we emailed to {0}, then come back to this invitation and sign in.', email.trim()), bad: false });
        return;
      }
      setPassword('');
      setAgain('');
    } catch (e) {
      setMsg({ text: problem(e), bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={ui.card('notice')} onSubmit={(ev) => { void submit(ev); }} noValidate>
      <h2>{tr('You were invited to a group')}</h2>
      <p className="text-muted text-[13px]">{tr('Make an account (or sign in) and you can join it in a moment. Your own payments are kept on this device, and signing in adds a copy to your account; what you share in a group is seen by its members.')}</p>
      <div className={ui.chips} role="group" aria-label={tr('How to sign in')}>
        <button type="button" className={ui.chip} aria-pressed={how === 'signup'} onClick={() => { setHow('signup'); setMsg(null); }}>{tr('Create account')}</button>
        <button type="button" className={ui.chip} aria-pressed={how === 'signin'} onClick={() => { setHow('signin'); setMsg(null); }}>{tr('Sign in')}</button>
      </div>
      <label className={ui.field}><span>{tr('Email')}</span><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></label>
      <label className={ui.field}>
        <span>{how === 'signup' ? tr('Password (at least {0} characters)', MIN_PASSWORD) : tr('Password')}</span>
        <input type="password" autoComplete={how === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      </label>
      {how === 'signup' && <label className={ui.field}><span>{tr('Repeat the password')}</span><input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} disabled={busy} /></label>}
      {msg && <p className={ui.msg(msg.bad ? 'bad' : 'good')} role="alert">{msg.text}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy || !email.trim() || !password}>{how === 'signup' ? tr('Create account and continue') : tr('Sign in and continue')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={() => app.clearJoinCode()}>{tr('Not now')}</button>
      </div>
    </form>
  );
}

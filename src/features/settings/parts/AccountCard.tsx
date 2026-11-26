import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { clockLabel } from '../../../core/format.ts';
import { MIN_PASSWORD } from '../../../data/password.ts';
import { errText } from './shared.ts';
import { SignOutPanel } from './SignOutPanel.tsx';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

type Note = { text: string; bad: boolean };

// The sign-in and create-account form: what is typed, what happened, and the three things it can do. It lives in AccountCard (not in the
// signed-out view) so that what was typed is still there after signing out again.
function useSignInForm() {
  const app = useApp();
  const signedOut = app.sync.mode === 'signedout';
  const [how, setHow] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false); // the "send me a reset link" panel is open
  const [resetNote, setResetNote] = useState<Note | null>(null);
  const [msg, setMsg] = useState<Note | null>(null);

  // a reset note from a moment ago must not still be showing after signing in or out
  useEffect(() => { setForgot(false); setResetNote(null); }, [signedOut]);

  function choose(next: 'signin' | 'signup') {
    setHow(next); setMsg(null); setPassword2('');
  }

  async function signIn(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await app.signInWithPassword(email.trim(), password);
      setPassword('');
      app.toast(tr('Signed in'));
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function signUp(ev: FormEvent) {
    ev.preventDefault();
    if (password !== password2) { setMsg({ text: tr('The two passwords are not the same.'), bad: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await app.signUp(email.trim(), password);
      setPassword(''); setPassword2('');
      if (r === 'signed-in') app.toast(tr('Account created'));
      else setMsg({ text: tr('Almost there: open the confirmation link we emailed to {0}, then come back and sign in. If you already have an account with this address, just sign in. No email after a few minutes? This project\'s email may be limited: see the README (email setup).', email.trim()), bad: false });
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function sendReset() {
    setBusy(true); setResetNote(null);
    try {
      await app.requestPasswordReset(email.trim());
      setResetNote({ text: tr('If {0} can receive email from this project, a link is on its way. Open it on this phone: it works once and runs out quickly. Nothing after a few minutes? Check the spam folder, then see the README (email setup).', email.trim()), bad: false });
    } catch (e) { setResetNote({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  return { how, email, setEmail, password, setPassword, password2, setPassword2, busy, forgot, setForgot, resetNote, setResetNote, msg, choose, signIn, signUp, sendReset };
}

type SignInForm = ReturnType<typeof useSignInForm>;

// "Forgot your password?": offers to email a reset link to the address typed above.
function ForgotPanel({ f }: Readonly<{ f: SignInForm }>) {
  const typed = f.email.trim();
  return (
    <div className={ui.newCat} role="group" aria-label={tr('Reset your password')}>
      <p className="text-[13px]">{tr('We will email')}{' '}{typed ? <b>{typed}</b> : 'the address above'}{' '}{tr('a link to choose a new password. Open it on this phone.')}</p>
      <button type="button" className={ui.btn()} disabled={f.busy || !typed} onClick={f.sendReset}>{tr('Email me a reset link')}</button>
      {f.resetNote && <p className={ui.msg(f.resetNote.bad ? 'bad' : 'good')} role={f.resetNote.bad ? 'alert' : 'status'}>{f.resetNote.text}</p>}
      <p className="text-muted text-[13px]">{tr('It reaches the addresses this project\'s email can send to: today that is the project owner\'s. For anyone else, ask whoever runs the project to reset it (README, "If someone forgets their password").')}</p>
    </div>
  );
}

// The email and password boxes of both forms.
function EmailField({ f }: Readonly<{ f: SignInForm }>) {
  return (
    <label className={ui.field}>
      <span>{tr('Email')}</span>
      <input type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => f.setEmail(e.target.value)} disabled={f.busy} />
    </label>
  );
}

// Not signed in: sign in, or make an account (the choice is the two chips), and what the service said if it refused.
function SignedOutCard({ f }: Readonly<{ f: SignInForm }>) {
  const app = useApp();
  const { how } = f;
  const error = app.sync.error;
  const note = (f.msg || error) && <p className={ui.msg(f.msg?.bad || !f.msg ? 'bad' : undefined)} role="alert">{f.msg?.text ?? error}</p>;
  return (
    <div className={ui.card()}>
      <h2>{how === 'signup' ? tr('Create an account') : tr('Sign in to sync')}</h2>
      {app.authNotice && (
        <p className={ui.msg(app.authNotice.bad ? 'bad' : 'good')} role="alert">
          {app.authNotice.text} <button type="button" className={ui.linkBtn} onClick={app.dismissAuthNotice}>{tr('Dismiss')}</button>
        </p>
      )}
      <p className="text-muted text-[13px]">{tr('Your payments are saved on this phone either way. Signing in only adds the cloud copy and your other devices.')}</p>
      <div className={ui.chips} role="group" aria-label={tr('How to sign in')}>
        <button type="button" className={ui.chip} aria-pressed={how === 'signin'} onClick={() => f.choose('signin')}>{tr('Sign in')}</button>
        <button type="button" className={ui.chip} aria-pressed={how === 'signup'} onClick={() => f.choose('signup')}>{tr('Create account')}</button>
      </div>
      {how === 'signin' && (
        <form onSubmit={f.signIn} noValidate>
          <EmailField f={f} />
          <label className={ui.field}>
            <span>{tr('Password')}</span>
            <input type="password" autoComplete="current-password" value={f.password} onChange={(e) => f.setPassword(e.target.value)} disabled={f.busy} />
          </label>
          {note}
          <div className={ui.btnRow}>
            <button type="submit" className={ui.btn()} disabled={f.busy || !f.email.trim() || !f.password}>{tr('Sign in')}</button>
          </div>
          <p className="text-muted text-[13px]"><button type="button" className={ui.linkBtn} aria-expanded={f.forgot} onClick={() => { f.setForgot(!f.forgot); f.setResetNote(null); }}>{tr('Forgot your password?')}</button></p>
          {f.forgot && <ForgotPanel f={f} />}
        </form>
      )}
      {how === 'signup' && (
        <form onSubmit={f.signUp} noValidate>
          <EmailField f={f} />
          <label className={ui.field}>
            <span>{tr('Password (at least {0} characters)', MIN_PASSWORD)}</span>
            <input type="password" autoComplete="new-password" value={f.password} onChange={(e) => f.setPassword(e.target.value)} disabled={f.busy} />
          </label>
          <label className={ui.field}>
            <span>{tr('Repeat the password')}</span>
            <input type="password" autoComplete="new-password" value={f.password2} onChange={(e) => f.setPassword2(e.target.value)} disabled={f.busy} />
          </label>
          {note}
          <div className={ui.btnRow}>
            <button type="submit" className={ui.btn()} disabled={f.busy || !f.email.trim() || !f.password || !f.password2}>{tr('Create account')}</button>
          </div>
          <p className="text-muted text-[13px]">{tr('A few words in a row make a strong password. If you forget it, use "Forgot your password?" on the Sign in form (see the README for who it can reach).')}</p>
        </form>
      )}
    </div>
  );
}

// Signed in: who, how much is waiting to upload, when it last synced, Sync now, and the way to sign out.
function SignedInCard({ leaving, setLeaving }: Readonly<{ leaving: boolean; setLeaving: (v: boolean) => void }>) {
  const app = useApp();
  const s = app.sync;
  return (
    <div className={ui.card()}>
      <h2>{tr('Cloud sync')}</h2>
      <p>{tr('Signed in as')}{' '}<b>{s.email}</b></p>
      <p className="text-muted text-[13px]">
        {s.pending ? tr('{0} change{1} waiting to upload. ', s.pending, s.pending === 1 ? '' : 's') : tr('Everything is uploaded. ')}
        {s.lastSync ? tr('Last sync {0}.', clockLabel(s.lastSync)) : ''}
        {s.mode === 'offline' ? ' You are offline; it will catch up when the connection returns.' : ''}
      </p>
      {s.error && <p className={ui.msg('bad')} role="alert">{s.error}</p>}
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn()} onClick={app.syncNow} disabled={s.mode === 'syncing'}>{tr('Sync now')}</button>
        <button type="button" className={ui.btn('ghost')} aria-expanded={leaving} onClick={() => setLeaving(!leaving)}>{tr('Sign out')}</button>
      </div>
      {leaving && <SignOutPanel onCancel={() => setLeaving(false)} />}
    </div>
  );
}

export function AccountCard() {
  const app = useApp();
  const form = useSignInForm();
  const [leaving, setLeaving] = useState(false); // the sign-out choice is showing
  if (!app.syncEnabled) {
    return (
      <div className={ui.card()}>
        <h2>{tr('Cloud sync')}</h2>
        <p className="text-muted">{tr('Cloud sync is not set up in this build, so payments stay on this phone only. The README explains how to turn it on.')}</p>
      </div>
    );
  }
  if (app.sync.mode === 'signedout') return <SignedOutCard f={form} />;
  return <SignedInCard leaving={leaving} setLeaving={setLeaving} />;
}

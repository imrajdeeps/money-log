import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useApp } from '../../../data/context.tsx';
import { clockLabel } from '../../../core/format.ts';
import { MIN_PASSWORD } from '../../../data/password.ts';
import { errText } from './shared.ts';
import { SignOutPanel } from './SignOutPanel.tsx';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
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
      setResetNote({ text: tr('If {0} can receive email from this project, a link is on its way. Open it on this device: it works once and runs out quickly. Nothing after a few minutes? Check the spam folder, then see the README (email setup).', email.trim()), bad: false });
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
      <p className="text-[13px]">{tr('We will email')}{' '}{typed ? <b>{typed}</b> : 'the address above'}{' '}{tr('a link to choose a new password. Open it on this device.')}</p>
      <button type="button" className={ui.btn()} disabled={f.busy || !typed} onClick={f.sendReset}>{tr('Email me a reset link')}</button>
      {f.resetNote && <p className={ui.msg(f.resetNote.bad ? 'bad' : 'good')} role={f.resetNote.bad ? 'alert' : 'status'}>{f.resetNote.text}</p>}
      <p className="text-muted text-[13px]">{tr('It reaches the addresses this project\'s email can send to: today that is the project owner\'s. For anyone else, ask whoever runs the project to reset it (README, "If someone forgets their password").')}</p>
    </div>
  );
}

// The email box of both forms.
function EmailField({ f }: Readonly<{ f: SignInForm }>) {
  return (
    <label className={ui.fieldBare}>
      <span>{tr('Email')}</span>
      <input type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => f.setEmail(e.target.value)} disabled={f.busy} />
    </label>
  );
}

// A password box; when the service refused, its words sit right under it and the box is edged in red.
function PasswordField({ label, value, onChange, auto, f, error }: Readonly<{ label: string; value: string; onChange: (v: string) => void; auto: string; f: SignInForm; error?: ReactNode }>) {
  return (
    <label className={ui.fieldBare}>
      <span>{label}</span>
      <input type="password" className={error ? '!border-[1.5px] !border-bad' : undefined} autoComplete={auto} value={value} onChange={(e) => onChange(e.target.value)} disabled={f.busy} />
      {error}
    </label>
  );
}

// Not signed in: sign in, or make an account (the choice is the segmented control), and what the service said if it refused.
function SignedOutCard({ f }: Readonly<{ f: SignInForm }>) {
  const app = useApp();
  const { how } = f;
  const errText = f.msg?.text ?? app.sync.error;
  const bad = f.msg ? f.msg.bad : !!app.sync.error;
  const error = errText && bad ? <span className="block mt-1.5 text-[14px] font-semibold text-bad" role="alert">{errText}</span> : undefined;
  return (
    <div className={ps.card}>
      {app.authNotice && (
        <p className={ui.msg(app.authNotice.bad ? 'bad' : 'good')} role="alert">
          {app.authNotice.text} <button type="button" className={ui.linkBtn} onClick={app.dismissAuthNotice}>{tr('Dismiss')}</button>
        </p>
      )}
      <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('Sync keeps a copy of your payments in your own account, so a new device can have them too. Without it everything stays on this device.')}</p>
      <div className={ui.segment(2)} role="radiogroup" aria-label={tr('Sign in or create')}>
        <button type="button" role="radio" className={ui.segBtn} aria-checked={how === 'signin'} onClick={() => f.choose('signin')}>{tr('Sign in')}</button>
        <button type="button" role="radio" className={ui.segBtn} aria-checked={how === 'signup'} onClick={() => f.choose('signup')}>{tr('Create account')}</button>
      </div>
      {how === 'signin' && (
        <form onSubmit={f.signIn} noValidate className="flex flex-col gap-3">
          <EmailField f={f} />
          <PasswordField label={tr('Password')} value={f.password} onChange={f.setPassword} auto="current-password" f={f} error={error} />
          <button type="submit" className={ui.btn('solid', 'none', ps.save)} disabled={f.busy || !f.email.trim() || !f.password}>{tr('Sign in')}</button>
          <button type="button" className="self-center min-h-11 px-2 border-0 bg-transparent text-brand text-[14px] font-semibold underline cursor-pointer [font-family:inherit]" aria-expanded={f.forgot} onClick={() => { f.setForgot(!f.forgot); f.setResetNote(null); }}>{tr('Forgot your password?')}</button>
          {f.forgot && <ForgotPanel f={f} />}
        </form>
      )}
      {how === 'signup' && (
        <form onSubmit={f.signUp} noValidate className="flex flex-col gap-3">
          <EmailField f={f} />
          <PasswordField label={tr('Password (at least {0} characters)', MIN_PASSWORD)} value={f.password} onChange={f.setPassword} auto="new-password" f={f} />
          <PasswordField label={tr('Repeat the password')} value={f.password2} onChange={f.setPassword2} auto="new-password" f={f} error={error} />
          {f.msg && !f.msg.bad && <p className={ui.msg('good')} role="status">{f.msg.text}</p>}
          <button type="submit" className={ui.btn('solid', 'none', ps.save)} disabled={f.busy || !f.email.trim() || !f.password || !f.password2}>{tr('Create account')}</button>
          <p className={ps.small}>{tr('A few words in a row make a strong password. If you forget it, use "Forgot your password?" on the Sign in form (see the README for who it can reach).')}</p>
        </form>
      )}
    </div>
  );
}

// Signed in: when it last synced, who, Sync now; and below, the two ways to sign out.
function SignedInCard() {
  const app = useApp();
  const s = app.sync;
  const waiting = s.pending > 0;
  return (
    <>
      <div className={ps.card}>
        <span className={ui.cx('self-start flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-semibold', waiting || s.error ? 'bg-warn-bg text-warn' : 'bg-good-bg text-good')}>
          <span className={ui.cx('w-[7px] h-[7px] rounded-full', waiting || s.error ? 'bg-warn' : 'bg-good')} aria-hidden="true" />
          {waiting ? tr('{0} waiting', s.pending) : s.lastSync ? tr('Synced {0}', clockLabel(s.lastSync)) : tr('Synced')}
        </span>
        <p className="m-0 text-[15px]">{tr('Signed in as')}{' '}<strong>{s.email}</strong></p>
        <p className={ps.note}>
          {waiting ? tr('{0} change{1} waiting to upload. ', s.pending, s.pending === 1 ? '' : 's') : tr('Everything is uploaded. ')}
          {s.lastSync ? tr('Last sync {0}.', clockLabel(s.lastSync)) : ''}{' '}
          {s.mode === 'offline' ? tr('You are offline; it will catch up when the connection returns.') : tr('Your data goes only to your own account.')}
        </p>
        {s.error && <p className={ui.msg('bad')} role="alert">{s.error}</p>}
        <button type="button" className={ui.btn('solid', 'none', ps.main)} onClick={app.syncNow} disabled={s.mode === 'syncing'}>{tr('Sync now')}</button>
      </div>
      <SignOutPanel />
    </>
  );
}

export function AccountCard() {
  const app = useApp();
  const form = useSignInForm();
  if (!app.syncEnabled) {
    return (
      <div className={ps.card}>
        <p className={ps.note}>{tr('Cloud sync is not set up in this build, so payments stay on this device only. The README explains how to turn it on.')}</p>
      </div>
    );
  }
  if (app.sync.mode === 'signedout') return <SignedOutCard f={form} />;
  return <SignedInCard />;
}

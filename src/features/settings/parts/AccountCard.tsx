import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { clockLabel } from '../../../core/format.ts';
import { MIN_PASSWORD } from '../../../data/password.ts';
import { errText } from './shared.ts';
import * as ui from '../../../ui/styles.ts';

export function AccountCard() {
  const app = useApp();
  const s = app.sync;
  const [how, setHow] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false); // the sign-out choice is showing
  const [forgot, setForgot] = useState(false); // the "send me a reset link" panel is open
  const [resetNote, setResetNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  // a reset note from a moment ago must not still be showing after signing in or out
  useEffect(() => { setForgot(false); setResetNote(null); }, [s.mode === 'signedout']);

  function choose(next: 'signin' | 'signup') {
    setHow(next); setMsg(null); setPassword2('');
  }

  async function signIn(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await app.signInWithPassword(email.trim(), password);
      setPassword('');
      app.toast('Signed in');
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function signUp(ev: FormEvent) {
    ev.preventDefault();
    if (password !== password2) { setMsg({ text: 'The two passwords are not the same.', bad: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await app.signUp(email.trim(), password);
      setPassword(''); setPassword2('');
      if (r === 'signed-in') app.toast('Account created');
      else setMsg({ text: `Almost there: open the confirmation link we emailed to ${email.trim()}, then come back and sign in. If you already have an account with this address, just sign in. No email after a few minutes? This project's email may be limited: see the README (email setup).`, bad: false });
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function sendReset() {
    setBusy(true); setResetNote(null);
    try {
      await app.requestPasswordReset(email.trim());
      setResetNote({ text: `If ${email.trim()} can receive email from this project, a link is on its way. Open it on this phone: it works once and runs out quickly. Nothing after a few minutes? Check the spam folder, then see the README (email setup).`, bad: false });
    } catch (e) { setResetNote({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  if (!app.syncEnabled) {
    return (
      <div className={ui.card()}>
        <h2>Cloud sync</h2>
        <p className="text-muted">Cloud sync is not set up in this build, so payments stay on this phone only. The README explains how to turn it on.</p>
      </div>
    );
  }

  if (s.mode === 'signedout') {
    const note = (msg || s.error) && <p className={ui.msg(msg?.bad || !msg ? 'bad' : undefined)} role="alert">{msg?.text ?? s.error}</p>;
    return (
      <div className={ui.card()}>
        <h2>{how === 'signup' ? 'Create an account' : 'Sign in to sync'}</h2>
        {app.authNotice && (
          <p className={ui.msg(app.authNotice.bad ? 'bad' : 'good')} role="alert">
            {app.authNotice.text} <button type="button" className={ui.linkBtn} onClick={app.dismissAuthNotice}>Dismiss</button>
          </p>
        )}
        <p className="text-muted text-[13px]">Your payments are saved on this phone either way. Signing in only adds the cloud copy and your other devices.</p>
        <div className={ui.chips} role="group" aria-label="How to sign in">
          <button type="button" className={ui.chip} aria-pressed={how === 'signin'} onClick={() => choose('signin')}>Sign in</button>
          <button type="button" className={ui.chip} aria-pressed={how === 'signup'} onClick={() => choose('signup')}>Create account</button>
        </div>
        {how === 'signin' && (
          <form onSubmit={signIn} noValidate>
            <label className={ui.field}>
              <span>Email</span>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
            </label>
            <label className={ui.field}>
              <span>Password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </label>
            {note}
            <div className={ui.btnRow}>
              <button type="submit" className={ui.btn()} disabled={busy || !email.trim() || !password}>Sign in</button>
            </div>
            <p className="text-muted text-[13px]"><button type="button" className={ui.linkBtn} aria-expanded={forgot} onClick={() => { setForgot(!forgot); setResetNote(null); }}>Forgot your password?</button></p>
            {forgot && (
              <div className={ui.newCat} role="group" aria-label="Reset your password">
                <p className="text-[13px]">We will email {email.trim() ? <b>{email.trim()}</b> : 'the address above'} a link to choose a new password. Open it on this phone.</p>
                <button type="button" className={ui.btn()} disabled={busy || !email.trim()} onClick={sendReset}>Email me a reset link</button>
                {resetNote && <p className={ui.msg(resetNote.bad ? 'bad' : 'good')} role={resetNote.bad ? 'alert' : 'status'}>{resetNote.text}</p>}
                <p className="text-muted text-[13px]">It reaches the addresses this project's email can send to: today that is the project owner's. For anyone else, ask whoever runs the project to reset it (README, "If someone forgets their password").</p>
              </div>
            )}
          </form>
        )}
        {how === 'signup' && (
          <form onSubmit={signUp} noValidate>
            <label className={ui.field}>
              <span>Email</span>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
            </label>
            <label className={ui.field}>
              <span>Password (at least {MIN_PASSWORD} characters)</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </label>
            <label className={ui.field}>
              <span>Repeat the password</span>
              <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} disabled={busy} />
            </label>
            {note}
            <div className={ui.btnRow}>
              <button type="submit" className={ui.btn()} disabled={busy || !email.trim() || !password || !password2}>Create account</button>
            </div>
            <p className="text-muted text-[13px]">A few words in a row make a strong password. If you forget it, use "Forgot your password?" on the Sign in form (see the README for who it can reach).</p>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className={ui.card()}>
      <h2>Cloud sync</h2>
      <p>Signed in as <b>{s.email}</b></p>
      <p className="text-muted text-[13px]">
        {s.pending ? `${s.pending} change${s.pending === 1 ? '' : 's'} waiting to upload. ` : 'Everything is uploaded. '}
        {s.lastSync ? `Last sync ${clockLabel(s.lastSync)}.` : ''}
        {s.mode === 'offline' ? ' You are offline; it will catch up when the connection returns.' : ''}
      </p>
      {s.error && <p className={ui.msg('bad')} role="alert">{s.error}</p>}
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn()} onClick={app.syncNow} disabled={s.mode === 'syncing'}>Sync now</button>
        <button type="button" className={ui.btn('ghost')} aria-expanded={leaving} onClick={() => setLeaving(!leaving)}>Sign out</button>
      </div>
      {leaving && (
        <div className={ui.newCat} role="group" aria-label="Sign out">
          <p><b>Also erase this phone's copy of your data?</b></p>
          <p className="text-muted text-[13px]">
            Erase it before someone else uses this phone or you sign in with another account. Everything already in the cloud stays there
            and comes back when you sign in again. Keep it if this is still your phone and you will sign back in.
          </p>
          {s.pending > 0 && (
            <p className={ui.msg('bad')} role="alert">
              {s.pending} change{s.pending === 1 ? ' has' : 's have'} not reached the cloud. Erasing loses {s.pending === 1 ? 'it' : 'them'}; signing out and keeping the data does not.
            </p>
          )}
          <div className={ui.btnRow}>
            <button type="button" className={ui.btn()} onClick={() => { void app.signOut(); }}>Sign out, keep the data</button>
          </div>
          <div className={ui.btnRow}>
            <button type="button" className={ui.btn('danger')} onClick={async () => { await app.eraseAll(); app.toast('Signed out and erased this phone.'); }}>Sign out and erase this phone</button>
          </div>
          <div className={ui.btnRow}>
            <button type="button" className={ui.btn('ghost')} onClick={() => setLeaving(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

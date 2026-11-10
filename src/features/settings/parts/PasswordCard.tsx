import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { MIN_PASSWORD } from '../../../data/password.ts';
import { errText } from './shared.ts';

export function PasswordCard() {
  const app = useApp();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | 'others' | 'everywhere'>(null); // a sign-out waits for a second tap
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  if (!app.syncEnabled || app.sync.mode === 'signedout' || app.sync.mode === 'local') return null;

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (password !== password2) { setMsg({ text: 'The two passwords are not the same.', bad: true }); return; }
    setBusy(true); setMsg(null);
    try {
      await app.changePassword(password);
      setPassword(''); setPassword2('');
      setMsg({ text: 'Password saved. You can now sign in with your email and this password.', bad: false });
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function signOutFrom(which: 'others' | 'everywhere') {
    if (ask !== which) { setAsk(which); return; }
    setBusy(true); setMsg(null); setAsk(null);
    try {
      if (which === 'others') {
        await app.signOutOthers();
        setMsg({ text: 'Your other devices are signed out. A device that is open right now is signed out the next time it renews its sign-in, within about an hour.', bad: false });
      } else {
        await app.signOutEverywhere();
        app.toast('Signed out everywhere');
      }
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Password and sessions</h2>
      {app.recovering && <p className="msg good" role="status">You opened a reset link, so you are signed in. Choose a new password now.</p>}
      <form onSubmit={save} noValidate>
        <h3 className="h2">Change password</h3>
        <p className="muted small">You are signed in, so no old password is needed. Others cannot see the new one and it is not kept on this phone.</p>
        <label className="field">
          <span>New password (at least {MIN_PASSWORD} characters)</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} disabled={busy} />
        </label>
        <label className="field">
          <span>Repeat the new password</span>
          <input type="password" autoComplete="new-password" value={password2} onChange={(e) => { setPassword2(e.target.value); setMsg(null); }} disabled={busy} />
        </label>
        <div className="btnrow">
          <button type="submit" className="btn" disabled={busy || !password || !password2}>Save password</button>
        </div>
      </form>
      {msg && <p className={`msg ${msg.bad ? 'bad' : 'good'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      <h3 className="h2">Where you are signed in</h3>
      <p className="muted small">
        This phone stays signed in and renews its sign-in by itself until you sign out. If you lose a phone, sign out your other devices
        here, or everywhere, then change the password.
      </p>
      <div className="btnrow">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { void signOutFrom('others'); }}>
          {ask === 'others' ? 'Tap again: sign out other devices' : 'Sign out my other devices'}
        </button>
      </div>
      <div className="btnrow">
        <button type="button" className="btn danger" disabled={busy} onClick={() => { void signOutFrom('everywhere'); }}>
          {ask === 'everywhere' ? 'Tap again: sign out everywhere' : 'Sign out everywhere, this phone too'}
        </button>
      </div>
      {ask && <button type="button" className="btn ghost small" onClick={() => setAsk(null)}>Cancel</button>}
    </div>
  );
}

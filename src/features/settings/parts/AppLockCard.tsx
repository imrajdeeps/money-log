import { useEffect, useState } from 'react';
import { useApp } from '../../../data/context.tsx';
import { LOCK_TIMEOUTS, validPin } from '../../../data/lock.ts';

export function AppLockCard() {
  const app = useApp();
  const on = app.lock;
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [cur, setCur] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(on?.timeoutSec ?? 60);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  useEffect(() => { if (on) setTimeoutSec(on.timeoutSec); }, [on]);
  const clear = () => { setPin(''); setPin2(''); setCur(''); };
  const fail = (text: string) => setMsg({ text, bad: true });

  async function turnOn() {
    if (!validPin(pin)) return fail('A PIN is 4 to 8 digits.');
    if (pin !== pin2) return fail('The two PINs are not the same.');
    await app.setPin(pin, timeoutSec);
    clear();
    setMsg({ text: 'PIN lock is on. It will ask for the PIN from now on.', bad: false });
  }

  async function save() {
    if (pin && !validPin(pin)) return fail('A PIN is 4 to 8 digits.');
    if (pin && pin !== pin2) return fail('The two new PINs are not the same.');
    const err = await app.updateLock(cur, { ...(pin ? { pin } : {}), timeoutSec });
    if (err) return fail(err);
    clear();
    setMsg({ text: 'Saved.', bad: false });
  }

  async function turnOff() {
    if (!window.confirm('Turn the PIN lock off?')) return;
    const err = await app.updateLock(cur, 'remove');
    if (err) return fail(err);
    clear();
    setMsg({ text: 'PIN lock is off.', bad: false });
  }

  const timeouts = (
    <label className="field">
      <span>Ask for the PIN</span>
      <select value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))}>
        {LOCK_TIMEOUTS.map((t) => <option key={t.sec} value={t.sec}>{t.label}</option>)}
      </select>
    </label>
  );
  const pinFields = (label: string) => (
    <>
      <label className="field"><span>{label}</span><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="field"><span>Same PIN again</span><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} /></label>
    </>
  );

  return (
    <div className="card">
      <h2>App lock</h2>
      <p className="muted small">
        A PIN screen that covers the app when it opens and when you come back after a while. It stops someone glancing at your
        unlocked phone. It does <b>not</b> encrypt the data stored on the phone, so your phone's own lock is still what protects it.
        If you forget the PIN, the only way back in is to erase this phone's copy and sign in again.
      </p>
      {!on ? (
        <>
          {pinFields('New PIN (4 to 8 digits)')}
          {timeouts}
          {msg && <p className={`msg ${msg.bad ? 'bad' : 'good'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
          <button type="button" className="btn" disabled={!pin} onClick={() => { void turnOn(); }}>Turn on PIN lock</button>
        </>
      ) : (
        <>
          <p><b>On.</b> {LOCK_TIMEOUTS.find((t) => t.sec === on.timeoutSec)?.label ?? ''}.</p>
          <label className="field"><span>Current PIN (needed to change anything)</span><input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ''))} /></label>
          {timeouts}
          {pinFields('New PIN (leave empty to keep the current one)')}
          {msg && <p className={`msg ${msg.bad ? 'bad' : 'good'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
          <div className="btnrow">
            <button type="button" className="btn" disabled={!cur} onClick={() => { void save(); }}>Save changes</button>
            <button type="button" className="btn danger" disabled={!cur} onClick={() => { void turnOff(); }}>Turn off</button>
          </div>
        </>
      )}
    </div>
  );
}

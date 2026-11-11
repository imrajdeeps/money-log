import { useEffect, useState } from 'react';
import { useApp } from '../../../data/context.tsx';
import { LOCK_TIMEOUTS, PIN_LENGTH, validPin } from '../../../data/lock.ts';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

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
    if (!validPin(pin)) return fail(tr('A PIN is 4 digits.'));
    if (pin !== pin2) return fail(tr('The two PINs are not the same.'));
    await app.setPin(pin, timeoutSec);
    clear();
    setMsg({ text: tr('PIN lock is on. It will ask for the PIN from now on.'), bad: false });
  }

  async function save() {
    if (pin && !validPin(pin)) return fail(tr('A PIN is 4 digits.'));
    if (pin && pin !== pin2) return fail(tr('The two new PINs are not the same.'));
    const err = await app.updateLock(cur, { ...(pin ? { pin } : {}), timeoutSec });
    if (err) return fail(err);
    clear();
    setMsg({ text: 'Saved.', bad: false });
  }

  async function turnOff() {
    if (!window.confirm(tr('Turn the PIN lock off?'))) return;
    const err = await app.updateLock(cur, 'remove');
    if (err) return fail(err);
    clear();
    setMsg({ text: tr('PIN lock is off.'), bad: false });
  }

  const timeouts = (
    <label className={ui.field}>
      <span>{tr('Ask for the PIN')}</span>
      <select value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))}>
        {LOCK_TIMEOUTS.map((t) => <option key={t.sec} value={t.sec}>{tr(t.label)}</option>)}
      </select>
      <small className="mt-1.5 block text-muted">{tr('Opening or refreshing the app again inside that time does not ask for the PIN. "Every time" asks whenever the app opens.')}</small>
    </label>
  );
  const pinFields = (label: string) => (
    <>
      <label className={ui.field}><span>{label}</span><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_LENGTH} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      <label className={ui.field}><span>{tr('Same PIN again')}</span><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_LENGTH} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} /></label>
    </>
  );

  return (
    <div className={ui.card()}>
      <h2>{tr('App lock')}</h2>
      <p className="text-muted text-[13px]">
        {tr('A PIN screen that covers the app when it opens and when you come back after a while. It stops someone glancing at your unlocked phone. It does')}{' '}<b>{tr('not')}</b>{' '}{tr('encrypt the data stored on the phone, so your phone\'s own lock is still what protects it. If you forget the PIN, the only way back in is to erase this phone\'s copy and sign in again.')}
      </p>
      {!on ? (
        <>
          {pinFields(tr('New PIN (4 digits)'))}
          {timeouts}
          {msg && <p className={ui.msg(msg.bad ? 'bad' : 'good')} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
          <button type="button" className={ui.btn('solid', 'md', ui.inCard)} disabled={!pin} onClick={() => { void turnOn(); }}>{tr('Turn on PIN lock')}</button>
        </>
      ) : (
        <>
          <p><b>{tr('On.')}</b> {tr(LOCK_TIMEOUTS.find((t) => t.sec === on.timeoutSec)?.label ?? '')}.</p>
          <label className={ui.field}><span>{tr('Current PIN (needed to change anything)')}</span><input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ''))} /></label>
          {timeouts}
          {pinFields(tr('New PIN (leave empty to keep the current one)'))}
          {msg && <p className={ui.msg(msg.bad ? 'bad' : 'good')} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
          <div className={ui.btnRow}>
            <button type="button" className={ui.btn()} disabled={!cur} onClick={() => { void save(); }}>{tr('Save changes')}</button>
            <button type="button" className={ui.btn('danger')} disabled={!cur} onClick={() => { void turnOff(); }}>{tr('Turn off')}</button>
          </div>
        </>
      )}
    </div>
  );
}

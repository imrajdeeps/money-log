import { useEffect, useState } from 'react';
import { useApp } from '../../../data/context.tsx';
import { LOCK_TIMEOUTS, PIN_LENGTH, validPin } from '../../../data/lock.ts';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
import { tr } from '../../../core/i18n.ts';

type Mode = 'on' | 'off' | 'change' | 'timeout' | null; // what the panel under the switch is asking for
type Msg = { text: string; bad: boolean } | null;

const digits = (v: string) => v.replace(/\D/g, '');

// A PIN box: digits only, hidden.
function PinField({ label, value, onChange, auto = 'new-password' }: Readonly<{ label: string; value: string; onChange: (v: string) => void; auto?: string }>) {
  return <label className={ui.fieldBare}><span>{label}</span><input type="password" inputMode="numeric" autoComplete={auto} maxLength={PIN_LENGTH + 4} value={value} onChange={(e) => onChange(digits(e.target.value))} /></label>;
}

// The panel under the switch: choose a PIN (turning on), the current PIN (turning off, or saving a new time), or both (Change PIN).
function LockPanel({ mode, timeoutSec, onDone, onCancel }: Readonly<{ mode: Exclude<Mode, null>; timeoutSec: number; onDone: (m: Msg) => void; onCancel: () => void }>) {
  const app = useApp();
  const [cur, setCur] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const needsCur = mode !== 'on';
  const needsNew = mode === 'on' || mode === 'change';

  async function go() {
    if (needsNew && !validPin(pin)) return setErr(tr('A PIN is 4 digits.'));
    if (needsNew && pin !== pin2) return setErr(tr('The two PINs are not the same.'));
    if (mode === 'on') { await app.setPin(pin, timeoutSec); return onDone({ text: tr('PIN lock is on. It will ask for the PIN from now on.'), bad: false }); }
    const change = mode === 'off' ? 'remove' as const : mode === 'change' ? { pin, timeoutSec } : { timeoutSec };
    const e = await app.updateLock(cur, change);
    if (e) return setErr(e);
    onDone({ text: mode === 'off' ? tr('PIN lock is off.') : tr('Saved.'), bad: false });
  }

  const label = { on: tr('Turn on PIN lock'), off: tr('Turn off'), change: tr('Save the new PIN'), timeout: tr('Save') }[mode];
  return (
    <div className="flex flex-col gap-3 py-3.5 border-t border-line">
      {needsCur && <PinField label={tr('Current PIN')} value={cur} onChange={(v) => { setCur(v); setErr(''); }} auto="off" />}
      {needsNew && <PinField label={mode === 'on' ? tr('New PIN (4 digits)') : tr('New PIN')} value={pin} onChange={(v) => { setPin(v); setErr(''); }} />}
      {needsNew && <PinField label={tr('Same PIN again')} value={pin2} onChange={(v) => { setPin2(v); setErr(''); }} />}
      {err && <p className={ui.msg('bad')} role="alert">{err}</p>}
      <div className="flex gap-2.5 [&>*]:flex-1">
        <button type="button" className={ui.btn(mode === 'off' ? 'danger' : 'solid')} disabled={(needsCur && !cur) || (needsNew && !pin)} onClick={() => { void go(); }}>{label}</button>
        <button type="button" className={ui.btn('outline')} onClick={onCancel}>{tr('Cancel')}</button>
      </div>
    </div>
  );
}

// App lock, as on the design: a switch for the PIN, how soon it locks, and Change PIN. It stops someone glancing at an unlocked
// phone; it does not encrypt the data, so the phone's own lock is still what protects it.
export function AppLockCard() {
  const app = useApp();
  const on = app.lock;
  const [mode, setMode] = useState<Mode>(null);
  const [timeoutSec, setTimeoutSec] = useState(on?.timeoutSec ?? 60);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { if (on) setTimeoutSec(on.timeoutSec); }, [on]);
  const done = (m: Msg) => { setMode(null); setMsg(m); };
  return (
    <>
      <div className={ps.listCard + ' py-1'}>
        <label className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[72px] cursor-pointer">
          <span className="flex flex-col"><span className="text-[16px] font-[650]">{tr('Ask for a PIN')}</span><span className="text-[13px] leading-[18px] text-muted">{tr('A 4-digit PIN when Hisaab opens.')}</span></span>
          <input type="checkbox" role="switch" className={ui.switchBox} aria-label={tr('Ask for a PIN')} checked={on ? mode !== 'off' : mode === 'on'} onChange={() => { setMsg(null); setMode(on ? (mode === 'off' ? null : 'off') : (mode === 'on' ? null : 'on')); }} />
        </label>
        {(mode === 'on' || mode === 'off') && <LockPanel key={mode} mode={mode} timeoutSec={timeoutSec} onDone={done} onCancel={() => setMode(null)} />}
        <label className="grid grid-cols-[minmax(0,1fr)_150px] gap-3 items-center min-h-[72px] border-t border-line">
          <span className="text-[15px] font-semibold">{tr('Lock after')}</span>
          <select value={timeoutSec} onChange={(e) => { setTimeoutSec(Number(e.target.value)); setMsg(null); if (on) setMode('timeout'); }}>
            {LOCK_TIMEOUTS.map((t) => <option key={t.sec} value={t.sec}>{tr(t.label)}</option>)}
          </select>
        </label>
        {mode === 'timeout' && <LockPanel mode="timeout" timeoutSec={timeoutSec} onDone={done} onCancel={() => { setMode(null); setTimeoutSec(on?.timeoutSec ?? 60); }} />}
        {on && (
          <div className="min-h-[60px] flex items-center border-t border-line">
            <button type="button" className="min-h-11 p-0 border-0 bg-transparent text-brand text-[15px] font-[650] cursor-pointer [font-family:inherit]" aria-expanded={mode === 'change'} onClick={() => { setMsg(null); setMode(mode === 'change' ? null : 'change'); }}>{tr('Change PIN')}</button>
          </div>
        )}
        {mode === 'change' && <LockPanel mode="change" timeoutSec={timeoutSec} onDone={done} onCancel={() => setMode(null)} />}
      </div>
      {msg && <p className={ui.msg(msg.bad ? 'bad' : 'good')} role="status">{msg.text}</p>}
      <p className={ps.small}>{tr('Opening or refreshing the app inside that time does not ask again. It does not encrypt the data on the phone, so your phone\'s own lock is still what protects it. If you forget the PIN, the only way back in is to erase this phone\'s copy and sign in again.')}</p>
    </>
  );
}

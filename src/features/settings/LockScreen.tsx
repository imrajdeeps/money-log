import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import * as ui from '../../ui/styles.ts';

// Covers the whole app until the right PIN is typed. It is a privacy screen, not encryption (see src/lock.ts).
export function LockScreen() {
  const app = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = window.setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => window.clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy || wait > 0 || !pin) return;
    setBusy(true);
    const r = await app.unlock(pin);
    setBusy(false);
    if (r.ok) return;
    setPin('');
    setWait(r.waitSec);
    setMsg(r.waitSec > 0 ? 'Too many wrong tries.' : 'That PIN is not right.');
    input.current?.focus();
  }

  async function forgot() {
    if (!window.confirm('Erase everything on this phone and sign out? Data already in the cloud is not touched, and you can sign in again afterwards. Payments that have not been uploaded yet will be lost.')) return;
    await app.eraseAll();
  }

  return (
    <div className="lockscreen" role="dialog" aria-modal="true" aria-label="Enter your PIN">
      <form onSubmit={submit} className="lockbox" noValidate>
        <h1>Money Log</h1>
        <p className="text-muted">Enter your PIN</p>
        <input
          ref={input}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          className="pininput"
          aria-label="PIN"
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setMsg(''); }}
        />
        <p className={ui.msg('bad')} role="alert" hidden={!msg}>{msg}{wait > 0 ? ` Try again in ${wait} second${wait === 1 ? '' : 's'}.` : ''}</p>
        <button type="submit" className={ui.btn('solid', 'big')} disabled={busy || wait > 0 || pin.length < 4}>Unlock</button>
        <details className="forgot">
          <summary>Forgot your PIN?</summary>
          <p className="text-muted text-[13px]">The PIN cannot be recovered. You can erase this phone's copy of your data and sign in again; what is in the cloud stays.</p>
          <button type="button" className={ui.btn('danger')} onClick={() => { void forgot(); }}>Erase this phone and start again</button>
        </details>
      </form>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Covers the whole app until the right PIN is typed. It is a privacy screen, not encryption (see data/lock.ts).
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

  async function attempt(value: string) {
    if (busy || wait > 0 || !value) return;
    setBusy(true);
    const r = await app.unlock(value);
    setBusy(false);
    if (r.ok) return;
    setPin('');
    setWait(r.waitSec);
    setMsg(r.waitSec > 0 ? tr('Too many wrong tries.') : tr('That PIN is not right.'));
    input.current?.focus();
  }

  const submit = (ev: FormEvent) => { ev.preventDefault(); void attempt(pin); };

  // Once the PIN's length is known (every PIN set or used since 1.23), it unlocks by itself at that many digits.
  const len = app.lock?.len;
  function typed(raw: string) {
    const value = raw.replace(/\D/g, '');
    setPin(value);
    setMsg('');
    if (len !== undefined && value.length === len) void attempt(value);
  }

  async function forgot() {
    if (!window.confirm(tr('Erase everything on this phone and sign out? Data already in the cloud is not touched, and you can sign in again afterwards. Payments that have not been uploaded yet will be lost.'))) return;
    await app.eraseAll();
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex items-center justify-center p-6 overflow-auto" role="dialog" aria-modal="true" aria-label={tr('Enter your PIN')}>
      <form onSubmit={submit} className="w-full max-w-[340px] text-center [&_h1]:mb-1" noValidate>
        <h1>{tr('Money Log')}</h1>
        <p className="text-muted">{tr('Enter your PIN')}</p>
        <input
          ref={input}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={len ?? 8}
          className="text-center text-[28px] tracking-[8px] min-h-[60px] mt-3 mx-0 mb-1"
          aria-label="PIN"
          value={pin}
          onChange={(e) => typed(e.target.value)}
        />
        <p className={ui.msg('bad')} role="alert" hidden={!msg}>{msg}{wait > 0 ? ' ' + tr('Try again in {0} second{1}.', wait, wait === 1 ? '' : 's') : ''}</p>
        <button type="submit" className={ui.btn('solid', 'big')} disabled={busy || wait > 0 || pin.length < (len ?? 4)}>{tr('Unlock')}</button>
        <details className="mt-6 text-left [&>summary]:cursor-pointer [&>summary]:text-muted">
          <summary>{tr('Forgot your PIN?')}</summary>
          <p className="text-muted text-[13px]">{tr('The PIN cannot be recovered. You can erase this phone\'s copy of your data and sign in again; what is in the cloud stays.')}</p>
          <button type="button" className={ui.btn('danger')} onClick={() => { void forgot(); }}>{tr('Erase this phone and start again')}</button>
        </details>
      </form>
    </div>
  );
}

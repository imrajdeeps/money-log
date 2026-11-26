import { useEffect, useState } from 'react';
import { Logo } from '../../ui/Logo.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { useApp } from '../../data/context.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Counts the wait (seconds) down once a second for as long as there is one.
function useCountdown(wait: number, setWait: (next: (w: number) => number) => void): void {
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = window.setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => window.clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps
}

// How long to wait before the next try, in words; nothing when there is no wait.
const waitText = (wait: number): string => (wait > 0 ? ' ' + tr('Try again in {0} second{1}.', wait, wait === 1 ? '' : 's') : '');

// The way out for someone who forgot the PIN: erase this phone's copy and sign in again (what is in the cloud stays).
function ForgotPin() {
  const app = useApp();
  async function forgot() {
    if (!window.confirm(tr('Erase everything on this phone and sign out? Data already in the cloud is not touched, and you can sign in again afterwards. Payments that have not been uploaded yet will be lost.'))) return;
    await app.eraseAll();
  }
  return (
    <details className="mt-auto w-full text-[14px] leading-5 text-muted text-center flex flex-col gap-2">
      <summary className="min-h-11 flex items-center justify-center cursor-pointer text-brand font-[650] list-none [&::-webkit-details-marker]:hidden">{tr('Forgot your PIN?')}</summary>
      <p className="m-0 mb-2">{tr('The PIN cannot be recovered. You can erase this phone\'s copy of your data and sign in again; what is in the cloud stays.')}</p>
      <button type="button" className={ui.btn('danger')} onClick={() => { void forgot(); }}>{tr('Erase this phone and start again')}</button>
    </details>
  );
}

// Covers the whole app until the right PIN is typed. It is a privacy screen, not encryption (see data/lock.ts).
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

// The lock screen, as on the design: the mark, four dots that fill as digits are typed (red after a wrong PIN), a round keypad
// (the phone's own keyboard works too), and Forgot your PIN? at the foot. After several wrong tries it makes you wait.
export function LockScreen() {
  const app = useApp();
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  useCountdown(wait, setWait);
  const len = app.lock?.len; // known for every PIN set or used since 1.23: then it unlocks by itself at that many digits
  const dots = len ?? Math.max(4, pin.length);

  async function attempt(value: string) {
    if (busy || wait > 0 || !value) return;
    setBusy(true);
    const r = await app.unlock(value);
    setBusy(false);
    if (r.ok) return;
    setPin('');
    setWrong(true);
    setWait(r.waitSec);
    setMsg(r.waitSec > 0 ? tr('Too many wrong tries.') : tr('That PIN is not right.'));
  }

  function press(k: string) {
    if (busy || wait > 0) return;
    setWrong(false); setMsg('');
    if (k === 'del') { setPin((p) => p.slice(0, -1)); return; }
    const value = (pin + k).slice(0, len ?? 8);
    setPin(value);
    if (len !== undefined && value.length === len) void attempt(value);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter' && len === undefined) void attempt(pin);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-auto flex justify-center" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <div className="w-full max-w-[360px] min-h-full px-6 pt-16 pb-7 flex flex-col items-center gap-[18px]">
        <Logo size={56} />
        <h1 id="lock-title" className="m-0 text-[22px] leading-7 font-bold">{tr('Enter your PIN')}</h1>
        <div role="img" aria-label={tr('{0} of {1} digits entered', pin.length, dots)} className="flex gap-[18px] py-1.5">
          {Array.from({ length: dots }, (_, i) => (
            <span key={i} className={ui.cx('w-4 h-4 rounded-full border-2', wrong ? 'border-bad bg-bad' : i < pin.length ? 'border-ink bg-ink' : 'border-field-line bg-transparent')} />
          ))}
        </div>
        <p className="m-0 min-h-11 text-[15px] leading-[22px] font-semibold text-center text-bad" role="alert">{msg}{waitText(wait)}</p>
        <div className={ui.cx('grid grid-cols-[repeat(3,76px)] gap-x-[22px] gap-y-3', wait > 0 && 'opacity-40')}>
          {KEYS.map((k, i) => k === ''
            ? <span key={i} />
            : (
              <button key={i} type="button" aria-label={k === 'del' ? tr('Delete') : k} disabled={wait > 0 || busy} onClick={() => press(k)}
                className={k === 'del'
                  ? 'w-[76px] h-[76px] rounded-full border-0 bg-transparent text-ink flex items-center justify-center cursor-pointer active:bg-press disabled:cursor-not-allowed'
                  : 'w-[76px] h-[76px] rounded-full border-0 bg-card text-ink text-[28px] font-semibold [font-family:inherit] flex items-center justify-center cursor-pointer active:bg-press disabled:cursor-not-allowed'}>
                {k === 'del' ? <Icon name="backspace" size={30} /> : k}
              </button>
            ))}
        </div>
        {len === undefined && pin.length >= 4 && <button type="button" className={ui.btn('solid', 'none', 'min-h-12 px-8 text-[16px]')} disabled={busy || wait > 0} onClick={() => { void attempt(pin); }}>{tr('Unlock')}</button>}
        <ForgotPin />
      </div>
    </div>
  );
}

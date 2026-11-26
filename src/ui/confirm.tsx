import { useEffect, useRef, useSyncExternalStore } from 'react';
import { tr } from '../core/i18n.ts';
import { splitQuestion } from '../core/question.ts';
import * as ui from './styles.ts';

// The app's own "are you sure?" card, as on the design (instead of the browser's grey box): the question as a heading, what
// follows from it underneath, Cancel, and the action in red (something lost) or lime (nothing lost). ask() takes the question
// as one text: up to the first question mark is the heading, the rest is the line under it.

type Tone = 'bad' | 'go';
interface Pending { title: string; body: string; ok: string; cancel: string; tone: Tone; done: (yes: boolean) => void }

let pending: Pending | null = null;
let mounted = 0;
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };


/** Asks first; resolves true when the person chose the action. Without the card on the page (a test), the browser's own box asks. */
export function ask(text: string, ok: string, tone: Tone = 'bad', cancel = tr('Cancel')): Promise<boolean> {
  if (mounted === 0) return Promise.resolve(window.confirm(text));
  pending?.done(false);
  return new Promise((resolve) => {
    pending = { ...splitQuestion(text), ok, cancel, tone, done: (yes) => { pending = null; emit(); resolve(yes); } };
    emit();
  });
}

/** The card itself, once, at the root of the app. */
export function ConfirmHost() {
  const p = useSyncExternalStore(subscribe, () => pending, () => null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { mounted++; return () => { mounted--; pending?.done(false); }; }, []);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (p && !d.open) d.showModal();
    if (!p && d.open) d.close();
  }, [p]);
  return (
    <dialog ref={dialog} className="max-w-[420px]"
      aria-labelledby="confirm-title" onCancel={(e) => { e.preventDefault(); p?.done(false); }}>
      {p && (
        <div className="flex flex-col gap-2.5">
          <h2 id="confirm-title" className="m-0 text-[20px] leading-[26px] font-bold [overflow-wrap:anywhere]">{p.title}</h2>
          {p.body && <p className="m-0 text-[15px] leading-[22px] text-muted">{p.body}</p>}
          <div className="flex flex-wrap justify-end gap-2.5 pt-2">
            <button type="button" className={ui.btn('outline', 'none', 'min-h-12 px-4 text-[15px]')} onClick={() => p.done(false)} autoFocus>{p.cancel}</button>
            <button type="button" className={ui.btn(p.tone === 'bad' ? 'danger' : 'solid', 'none', 'min-h-12 px-4 text-[15px]')} onClick={() => p.done(true)}>{p.ok}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}

import { useCallback, useEffect, useId, useImperativeHandle, useRef } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';
import { Icon } from './Icon.tsx';

export interface DrawerHandle { open: () => void; close: () => void }

interface Props {
  ref?: Ref<DrawerHandle>;
  title: string;
  initialFocus?: RefObject<HTMLElement | null>; // what gets the focus on opening (else the close button)
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const CLOSE_MS = 320; // a little longer than the closing animation in styles.css, in case its end is never reported

// The Add expense sheet: a panel that slides in from the right on a wide screen and a sheet that rises from the bottom
// on a phone (styles.css picks which). (The other tabs are pages of their own, see App.tsx.) It is the native <dialog>, like the app's other dialogs, so
// the focus stays inside, the page behind is inert, and Escape (or Android's back gesture) closes it, as do the close
// button and a tap on the dimmed page. It stays mounted while closed, so a half-filled form inside it is still there
// when it opens again. Opening is a plain function call so a tap can focus a text field at once: on an iPhone the
// keyboard only comes up when the focus moves during the tap itself.
export function DetailDrawer({ ref, title, initialFocus, onOpenChange, children }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const downOnBackdrop = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const changed = useRef(onOpenChange);
  changed.current = onOpenChange;
  const titleId = useId();

  const finish = useCallback(() => {
    window.clearTimeout(timer.current);
    const d = dlg.current;
    if (d?.open) d.close();
  }, []);

  const close = useCallback(() => {
    const d = dlg.current;
    if (!d?.open || d.classList.contains('closing')) return;
    if (reducedMotion()) { finish(); return; }
    d.classList.add('closing');
    timer.current = window.setTimeout(finish, CLOSE_MS);
  }, [finish]);

  const open = useCallback(() => {
    const d = dlg.current;
    const b = body.current;
    if (!d || !b) return;
    if (d.open) {
      // opened again while it was still sliding away: keep it
      window.clearTimeout(timer.current);
      d.classList.remove('closing');
      return;
    }
    opener.current = document.activeElement;
    d.showModal();
    b.scrollTop = 0; // a closed dialog keeps its scroll position; start from the top
    (initialFocus?.current ?? closeBtn.current)?.focus({ preventScroll: true });
    changed.current?.(true);
  }, [initialFocus]);

  useImperativeHandle(ref, () => ({ open, close }), [open, close]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <dialog
      ref={dlg}
      className="drawer"
      aria-labelledby={titleId}
      // Dialogs opened inside this one (edit a payment, budgets) send their own cancel and close events up through
      // React, so only the ones aimed at this dialog count.
      onCancel={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); close(); }}
      onClose={(e) => {
        if (e.target !== e.currentTarget) return;
        window.clearTimeout(timer.current);
        e.currentTarget.classList.remove('closing');
        // A dialog left open inside a closed sheet would be invisible and still block the whole page.
        e.currentTarget.querySelectorAll('dialog[open]').forEach((inner) => (inner as HTMLDialogElement).close());
        changed.current?.(false);
        const back = opener.current;
        if (back instanceof HTMLElement && back.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
      }}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && e.currentTarget.classList.contains('closing')) finish(); }}
      // A tap on the dimmed page closes it; a press that starts inside (selecting text, say) and ends outside does not.
      onPointerDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnBackdrop.current) close(); }}
    >
      <div className="drawer-panel">
        <header className="drawer-head">
          <span className="drawer-grip" aria-hidden="true" />
          <h2 id={titleId}>{title}</h2>
          <button ref={closeBtn} type="button" className="drawer-x" aria-label={`Close ${title}`} onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-body" ref={body}>{children}</div>
      </div>
    </dialog>
  );
}

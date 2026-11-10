import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode, RefObject } from 'react';
import { Icon } from './Icon.tsx';
import { tr } from '../core/i18n.ts';

const WIDTH = 92; // how far the row slides to show Delete
const INTENT = 8; // how far a finger moves before it counts as a swipe (and not a tap or a scroll)

// A list row that slides left to show a Delete button: drag it (a finger, or a mouse), then tap Delete. Tapping elsewhere or
// swiping back closes it. Delete is also reachable with the keyboard (Tab to it: the row opens). Vertical scrolling still works.
export function SwipeRow({ children, onDelete, label, className, as = 'li' }: { children: ReactNode; onDelete: () => void; label: string; className?: string; as?: 'li' | 'div' }) {
  const [shift, setShift] = useState(0); // 0 closed, -WIDTH open, in between while dragging
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; from: number; id: number } | null>(null);
  const moved = useRef(false); // a drag just happened: swallow the click that follows it
  const root = useRef<HTMLElement>(null);
  const Root = as as 'li'; // a div where the row is not a list item
  const open = shift <= -WIDTH / 2;

  // Tapping anywhere else closes an open row.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) setShift(0); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, from: shift, id: e.pointerId };
    moved.current = false;
  }
  function move(e: PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!dragging) {
      if (Math.abs(dx) < INTENT || Math.abs(dx) < Math.abs(dy)) return; // not a sideways swipe (yet)
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    moved.current = true;
    setShift(Math.max(-WIDTH, Math.min(0, s.from + dx)));
  }
  function up(e: PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    if (dragging) {
      setDragging(false);
      setShift((cur) => (cur <= -WIDTH / 2 ? -WIDTH : 0));
    }
  }

  return (
    <Root ref={root as RefObject<HTMLLIElement>} className="relative overflow-hidden">
      <button
        type="button"
        // hidden until the row moves: at a fractional position its red edge would show round the row's border
        className={`absolute top-0 right-0 bottom-0 w-[92px] flex items-center justify-center border-0 bg-bad text-bad-ink cursor-pointer transition-opacity ${shift === 0 ? 'opacity-0' : 'opacity-100'}`}
        tabIndex={open ? 0 : -1}
        aria-label={tr('Delete: {0}', label)}
        onClick={() => { setShift(0); onDelete(); }}
        onFocus={() => setShift(-WIDTH)}
      >
        <Icon name="trash" size={26} />
      </button>
      <div
        className={`relative bg-card [touch-action:pan-y]${dragging ? '' : ' transition-transform duration-200 ease-[ease]'}${className ? ` ${className}` : ''}`}
        style={{ transform: `translateX(${shift}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } }}
      >
        {children}
      </div>
    </Root>
  );
}

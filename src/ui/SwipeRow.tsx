import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { Icon } from './Icon.tsx';

const WIDTH = 92; // how far the row slides to show Delete
const INTENT = 8; // how far a finger moves before it counts as a swipe (and not a tap or a scroll)

// A list row that slides left to show a Delete button: drag it (a finger, or a mouse), then tap Delete. Tapping elsewhere or
// swiping back closes it. Delete is also reachable with the keyboard (Tab to it: the row opens). Vertical scrolling still works.
export function SwipeRow({ children, onDelete, label, className }: { children: ReactNode; onDelete: () => void; label: string; className?: string }) {
  const [shift, setShift] = useState(0); // 0 closed, -WIDTH open, in between while dragging
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; from: number; id: number } | null>(null);
  const moved = useRef(false); // a drag just happened: swallow the click that follows it
  const root = useRef<HTMLLIElement>(null);
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
    <li ref={root} className="swiperow">
      <button
        type="button"
        className="swipe-del"
        tabIndex={open ? 0 : -1}
        aria-label={`Delete: ${label}`}
        onClick={() => { setShift(0); onDelete(); }}
        onFocus={() => setShift(-WIDTH)}
      >
        <Icon name="trash" size={26} />
      </button>
      <div
        className={`swipe-front${className ? ` ${className}` : ''}${dragging ? ' dragging' : ''}`}
        style={{ transform: `translateX(${shift}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } }}
      >
        {children}
      </div>
    </li>
  );
}

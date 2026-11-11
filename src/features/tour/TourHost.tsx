import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { compareVersions, pickTour, replay } from '../../core/tour.ts';
import type { Tour, TourKind, TourPage } from '../../core/tour.ts';
import { loadTourSeen, saveTourSeen } from '../../data/tour.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The guided tour: a dimmed page with a spotlight on the part being explained and a card beside it. It shows by itself once
// (the full tour to a new person, what is new to someone who already uses the app) and again whenever startTour() is called
// (from Settings, About). It is skippable at every step (Escape too), and moves the page behind it with `go`.
const listeners = new Set<(kind: TourKind) => void>();
export const startTour = (kind: TourKind) => listeners.forEach((l) => l(kind));

interface Rect { top: number; left: number; width: number; height: number }
const PAD = 6; // room round the spotlit part
const CARD_W = 360;

function findTarget(name: string | undefined): HTMLElement | null {
  if (!name) return null;
  // the same part can be in the page twice (a phone's bottom bar and a wide screen's header): the one that is showing
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) ?? null;
}

export function TourHost({ version, ready, hasData, go }: Readonly<{ version: string; ready: boolean; hasData: boolean; go: (to: TourPage) => void }>) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const goRef = useRef(go);
  goRef.current = go;
  const decided = useRef(false);
  const next = useRef<HTMLButtonElement>(null);

  // by itself, once the app is showing and nothing else (the PIN screen, a join link) is in the way
  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    const seen = loadTourSeen();
    const t = pickTour(seen, version, hasData);
    if (t) { setTour(t); setI(0); } else if (seen === null || compareVersions(version, seen) > 0) saveTourSeen(version);
  }, [ready, version, hasData]);

  // when asked to
  useEffect(() => {
    const on = (kind: TourKind) => { const t = replay(kind, version); if (t.steps.length) { setTour(t); setI(0); } };
    listeners.add(on);
    return () => { listeners.delete(on); };
  }, [version]);

  const close = useCallback(() => { saveTourSeen(version); setTour(null); setRect(null); }, [version]);
  const step = tour?.steps[i];

  // show the page of the step, then find the part to point at (the page needs a moment to appear, so look for a little while)
  useEffect(() => {
    if (!step) return;
    if (step.go) goRef.current(step.go);
    let raf = 0;
    let frames = 0;
    let scrolled = false;
    let alive = true;
    const measure = () => {
      const el = findTarget(step.target);
      if (!el) { setRect(null); return; }
      if (!scrolled) { scrolled = true; el.scrollIntoView({ block: 'center' }); }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD });
    };
    const tick = () => { if (!alive) return; measure(); if (++frames < 45) raf = requestAnimationFrame(tick); };
    tick();
    const again = () => measure();
    window.addEventListener('resize', again);
    window.addEventListener('scroll', again, true);
    next.current?.focus({ preventScroll: true });
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', again); window.removeEventListener('scroll', again, true); };
  }, [step]);

  if (!tour || !step) return null;
  const last = i === tour.steps.length - 1;
  const forward = () => { if (last) close(); else setI(i + 1); };
  const back = () => { if (i > 0) setI(i - 1); };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  let place: CSSProperties;
  if (rect) {
    const below = vh - (rect.top + rect.height);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - 12));
    place = below >= 230 || below >= rect.top ? { top: rect.top + rect.height + 12, left, width: w } : { bottom: vh - rect.top + 12, left, width: w };
  } else {
    place = { top: '50%', left: '50%', width: w, transform: 'translate(-50%, -50%)' };
  }

  return (
    <div
      className={`fixed inset-0 z-[80] ${rect ? '' : 'bg-[rgba(0,0,0,0.62)]'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      }}
    >
      {rect && (
        <div
          className="fixed pointer-events-none rounded-xl transition-[top,left,width,height] duration-200 [box-shadow:0_0_0_9999px_rgba(0,0,0,0.62),0_0_0_3px_var(--accent)]"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <div className="fixed z-[81] bg-card text-ink border border-line rounded-2xl p-4 [box-shadow:0_12px_32px_-8px_rgba(0,0,0,0.5)]" style={place}>
        <p className="text-muted text-[13px] m-0 mb-1" aria-live="polite">{tr('Step {0} of {1}{2}', i + 1, tour.steps.length, tour.kind === 'news' ? tr(' · what is new') : '')}</p>
        <h2 id="tour-title" className="m-0 mb-1.5">{tr(step.title)}</h2>
        <p className="text-[15px] m-0 mb-3">{tr(step.text)}</p>
        <div className="flex items-center justify-between gap-2.5">
          <button type="button" className={ui.linkBtn + ' text-muted'} onClick={close}>{last ? tr('Close') : tr('Skip tour')}</button>
          <div className="flex gap-2">
            {i > 0 && <button type="button" className={ui.btn('ghost', 'small')} onClick={back}>{tr('Back')}</button>}
            <button ref={next} type="button" className={ui.btn('solid', 'small')} onClick={forward}>{last ? tr('Done') : tr('Next')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

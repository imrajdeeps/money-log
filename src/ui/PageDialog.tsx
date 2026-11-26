import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import * as ui from './styles.ts';

// A page that opens over the app, as the design draws its forms (Edit item, Check in): the whole screen on a phone with a back link
// and a 24px title, a 640px dialog from 1024px. Closing it (the back link, Escape) calls onClose.
export function PageDialog({ title, back, intro, onClose, children }: Readonly<{ title: string; back: string; intro?: ReactNode; onClose: () => void; children: ReactNode }>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="page" aria-label={title} onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-0.5">
          <button type="button" className={ui.backLink} onClick={() => ref.current?.close()}><Icon name="back" size={20} stroke={2} />{back}</button>
          <h2 className="m-0 text-[24px] leading-[30px] font-bold">{title}</h2>
          {intro && <p className="m-0 mt-1.5 text-[15px] leading-[22px] text-muted">{intro}</p>}
        </div>
        {children}
      </div>
    </dialog>
  );
}

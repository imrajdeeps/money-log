import { Children, useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import * as ui from './styles.ts';
import { tr } from '../core/i18n.ts';

// The dashboard's layout, as drawn on the design canvas: two columns on a phone (12px apart), twelve on a wide screen (20px apart,
// filling gaps). Each tile says how many columns it takes on each. The grid measures its own width (a container query), so it
// works inside anything.
export type Span = 3 | 4 | 6 | 8 | 12;

const SPAN_WIDE: Record<Span, string> = {
  3: '@min-[900px]:col-span-3',
  4: '@min-[900px]:col-span-4',
  6: '@min-[900px]:col-span-6',
  8: '@min-[900px]:col-span-8',
  12: '@min-[900px]:col-span-12',
};

export function BentoGrid({ children, label }: Readonly<{ children: ReactNode; label?: string }>) {
  return (
    <div className="@container">
      <div
        className="grid grid-cols-2 gap-3 items-stretch [grid-auto-flow:row_dense] @min-[900px]:grid-cols-12 @min-[900px]:gap-5"
        role={label ? 'group' : undefined}
        aria-label={label}
      >
        {/* each tile gets its place in the order (--i), so the tiles rise one after another; the wrapper adds no box */}
        {Children.toArray(children).map((child, i) => <div key={i} className="contents" style={{ '--i': Math.min(i, 8) } as CSSProperties}>{child}</div>)}
      </div>
    </div>
  );
}

/** The inside of a tile: 14px all round (small tiles), 14 by 16 (wide tiles), or 14 by 16 with 6 at the bottom (a list whose rows end it). */
export type Pad = 'tight' | 'wide' | 'list';
const PAD: Record<Pad, string> = { tight: 'p-3.5', wide: 'px-4 py-3.5', list: 'px-4 pt-3.5 pb-1.5' };
const GAP = { 0: 'gap-0', 6: 'gap-1.5', 8: 'gap-2', 10: 'gap-2.5' } as const;

interface CardProps {
  title: string;
  span?: Span; // columns on a wide screen (of 12)
  half?: boolean; // one of two side by side on a phone
  tall?: boolean; // two rows on a wide screen
  pad?: Pad;
  gap?: keyof typeof GAP;
  hero?: boolean; // the one big green tile (index.css re-points the colours inside it)
  chevron?: boolean; // the arrow at the top right that says the tile opens a page (the design shows it on a few tiles only)
  onOpen?: () => void; // the whole tile opens its details
  openLabel?: string; // what opening does, for screen readers
  action?: ReactNode; // a control or a note at the right of the title
  children?: ReactNode;
}

const CARD = 'relative flex flex-col min-w-0 bg-card border border-line animate-rise [animation-delay:calc(var(--i,0)*40ms)]';
const CARD_ACTION =
  'group/card transition-[transform,border-color] duration-[180ms] ease-[ease] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] ' +
  'active:[transform:scale(0.995)] motion-reduce:active:[transform:none]';

// One tile: a title, then what it shows. A tile with onOpen is a single big target (an invisible button stretched over it), so its
// text stays plain text for screen readers and the button says what it opens.
export function BentoCard({ title, span = 4, half = false, tall = false, pad = 'wide', gap = 6, hero = false, chevron = false, onOpen, openLabel, action, children }: CardProps) {
  const id = useId();
  const cls = ui.cx(
    CARD, half ? 'col-span-1' : 'col-span-2', SPAN_WIDE[span], tall && '@min-[900px]:row-span-2', GAP[gap],
    hero ? 'hero rounded-card-lg p-[18px]' : `rounded-card ${PAD[pad]}`, onOpen && CARD_ACTION,
  );
  return (
    <section className={cls} aria-labelledby={id}>
      <header className="flex items-center justify-between gap-2">
        <h3 id={id} className={hero ? 'm-0 text-[15px] font-[650] text-ink' : 'm-0 text-[14px] font-[650] text-ink'}>{title}</h3>
        {action}
        {onOpen && chevron && (
          <span className={hero ? 'inline-flex w-11 h-11 -my-3 -mr-3 items-center justify-center text-[#eaf3e4]' : 'inline-flex text-muted'} aria-hidden="true">
            <Icon name="chevron" size={hero ? 20 : 18} />
          </span>
        )}
      </header>
      {children}
      {onOpen && <button type="button" className="absolute inset-0 z-[1] w-full p-0 border-0 rounded-[inherit] bg-transparent cursor-pointer" aria-label={openLabel ?? tr('Open {0}', title)} onClick={onOpen} />}
    </section>
  );
}

// What a tile shows when there is nothing to show yet, and the one thing to do about it (the design's Groups tile: 15px words, a 44px
// outline button).
export function BentoEmpty({ children, cta, onCta }: Readonly<{ children: ReactNode; cta?: string; onCta?: () => void }>) {
  return (
    <>
      <p className="m-0 text-[15px] leading-[22px] text-muted">{children}</p>
      {cta && onCta && <button type="button" className={ui.btn('ghost', 'none', 'relative z-[2] self-start min-h-11 px-4 text-[15px]')} onClick={onCta}>{cta}</button>}
    </>
  );
}

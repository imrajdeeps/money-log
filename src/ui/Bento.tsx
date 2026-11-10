import { Children, useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import * as ui from './styles.ts';
import { tr } from '../core/i18n.ts';

// The dashboard's layout. A wide screen gets 12 columns and each tile spans some of them; narrower screens fold the spans:
// half or full width on a tablet, one column on a phone with small stat tiles two to a row. The grid measures its own width
// (a container query), so it works inside anything.
export type Span = 3 | 4 | 6 | 8 | 12;

const SPAN_WIDE: Record<Span, string> = {
  3: '@min-[900px]:col-span-3',
  4: '@min-[900px]:col-span-4',
  6: '@min-[900px]:col-span-6',
  8: '@min-[900px]:col-span-8',
  12: '@min-[900px]:col-span-12',
};

export function BentoGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="@container">
      <div
        className="grid grid-cols-2 gap-3 @min-[600px]:grid-cols-6 @min-[600px]:gap-4 @min-[600px]:[grid-auto-flow:row_dense] @min-[900px]:grid-cols-12 @min-[900px]:gap-5 @min-[900px]:[grid-auto-flow:row]"
        role={label ? 'group' : undefined}
        aria-label={label}
      >
        {/* each tile gets its place in the order (--i), so the tiles rise one after another; the wrapper adds no box */}
        {Children.toArray(children).map((child, i) => <div key={i} className="contents" style={{ '--i': Math.min(i, 10) } as CSSProperties}>{child}</div>)}
      </div>
    </div>
  );
}

interface CardProps {
  title: string;
  span?: Span;
  compact?: boolean; // a small stat tile: two side by side on a phone
  fill?: boolean; // a compact tile that is the odd one out takes the whole row
  hero?: boolean; // the one big green tile (index.css re-points the colours inside it)
  onOpen?: () => void; // the whole tile opens its details
  openLabel?: string; // what opening does, for screen readers
  action?: ReactNode; // a control in the header, for a tile that holds its own buttons (and so has no onOpen)
  children?: ReactNode;
}

const CARD = 'relative flex flex-col min-w-0 bg-card border border-line rounded-card-lg [box-shadow:var(--shadow),var(--inner)] animate-rise [animation-delay:calc(var(--i,0)*45ms)]';
const CARD_ACTION =
  'group/card transition-[transform,box-shadow,border-color] duration-[180ms] ease-[ease] ' +
  'hover:[transform:translateY(-2px)] hover:[box-shadow:var(--shadow-hover),var(--inner)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] ' +
  'active:[transform:translateY(0)_scale(0.995)] motion-reduce:hover:[transform:none] motion-reduce:active:[transform:none]';

function place(span: Span, compact: boolean, fill: boolean) {
  const pad = compact ? 'p-3.5' : 'p-4';
  if (!compact) return `col-span-2 ${pad} @min-[600px]:p-[18px] ${span >= 8 ? '@min-[600px]:col-span-6' : '@min-[600px]:col-span-3'} ${SPAN_WIDE[span]}`;
  // a compact tile is one of two on a phone; the odd one out (fill) takes the row, and on a tablet spans it
  return fill
    ? `col-[1/-1] ${pad} @min-[600px]:p-[18px] @min-[600px]:@max-[899.98px]:col-span-6`
    : `col-span-1 ${pad} @min-[600px]:p-[18px] ${span >= 8 ? '@min-[600px]:col-span-6' : '@min-[600px]:col-span-3'} ${SPAN_WIDE[span]}`;
}

// One tile: a title, one main figure or picture, and at most a line of status. A tile with onOpen is a single big target
// (an invisible button stretched over it), so its text stays plain text for screen readers and the button says what it opens.
export function BentoCard({ title, span = 4, compact = false, fill = false, hero = false, onOpen, openLabel, action, children }: CardProps) {
  const id = useId();
  const cls = ui.cx(CARD, place(span, compact, fill), onOpen && CARD_ACTION, hero && 'hero');
  return (
    <section className={cls} aria-labelledby={id}>
      <header className="flex items-center justify-between gap-2 min-h-6 mb-2">
        <h3 id={id} className="m-0 text-[13px] font-semibold tracking-[0.02em] text-muted">{title}</h3>
        {action}
        {onOpen && (
          <span className="inline-flex text-muted transition-[transform,color] duration-[180ms] ease-[ease] group-hover/card:text-accent group-hover/card:[transform:translateX(2px)]" aria-hidden="true">
            <Icon name="chevron" size={18} />
          </span>
        )}
      </header>
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
      {onOpen && <button type="button" className="absolute inset-0 z-[1] w-full p-0 border-0 rounded-[inherit] bg-transparent cursor-pointer" aria-label={openLabel ?? tr('Open {0}', title)} onClick={onOpen} />}
    </section>
  );
}

// What a tile shows when there is nothing to show yet, and the one thing to do about it.
export function BentoEmpty({ children, cta, onCta }: { children: ReactNode; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-start justify-center gap-3 [&>p]:m-0 [&>p]:text-[14px]">
      <p className="text-muted">{children}</p>
      {cta && onCta && <button type="button" className={ui.btn('ghost', 'small', 'relative z-[2]')} onClick={onCta}>{cta}</button>}
    </div>
  );
}

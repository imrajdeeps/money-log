import { Children, useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import * as ui from './styles.ts';

// The dashboard's layout. A wide screen gets 12 columns and each tile spans some of them; narrower screens fold the spans
// (styles.css, "Bento dashboard"): half or full width on a tablet, one column on a phone with small stat tiles two to a row.
export type Span = 3 | 4 | 6 | 8 | 12;

export function BentoGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="bento-wrap">
      <div className="bento" role={label ? 'group' : undefined} aria-label={label}>
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
  onOpen?: () => void; // the whole tile opens its details
  openLabel?: string; // what opening does, for screen readers
  action?: ReactNode; // a control in the header, for a tile that holds its own buttons (and so has no onOpen)
  className?: string;
  children?: ReactNode;
}

// One tile: a title, one main figure or picture, and at most a line of status. A tile with onOpen is a single big target
// (an invisible button stretched over it), so its text stays plain text for screen readers and the button says what it opens.
export function BentoCard({ title, span = 4, compact = false, onOpen, openLabel, action, className, children }: CardProps) {
  const id = useId();
  const cls = ['bento-card', `span-${span}`, compact ? 'compact' : '', onOpen ? 'is-action' : '', 'animate-rise [animation-delay:calc(var(--i,0)*45ms)]', className ?? ''].filter(Boolean).join(' ');
  return (
    <section className={cls} aria-labelledby={id}>
      <header className="bento-head">
        <h3 id={id}>{title}</h3>
        {action}
        {onOpen && <span className="bento-chev" aria-hidden="true"><Icon name="chevron" size={18} /></span>}
      </header>
      <div className="bento-body">{children}</div>
      {onOpen && <button type="button" className="bento-hit" aria-label={openLabel ?? `Open ${title}`} onClick={onOpen} />}
    </section>
  );
}

// What a tile shows when there is nothing to show yet, and the one thing to do about it.
export function BentoEmpty({ children, cta, onCta }: { children: ReactNode; cta?: string; onCta?: () => void }) {
  return (
    <div className="bento-empty">
      <p className="text-muted">{children}</p>
      {cta && onCta && <button type="button" className={ui.btn('ghost', 'small')} onClick={onCta}>{cta}</button>}
    </div>
  );
}

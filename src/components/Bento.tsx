import { useId } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';

// The dashboard's layout. A wide screen gets 12 columns and each tile spans some of them; narrower screens fold the spans
// (styles.css, "Bento dashboard"): half or full width on a tablet, one column on a phone with small stat tiles two to a row.
export type Span = 3 | 4 | 6 | 8 | 12;

export function BentoGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="bento-wrap">
      <div className="bento" role={label ? 'group' : undefined} aria-label={label}>{children}</div>
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
  const cls = ['bento-card', `span-${span}`, compact ? 'compact' : '', onOpen ? 'is-action' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <section className={cls} aria-labelledby={id}>
      <header className="bento-head">
        <h3 id={id}>{title}</h3>
        {action}
        {onOpen && <span className="bento-chev" aria-hidden="true"><Icon name="chevron" size={18} /></span>}
      </header>
      <div className="bento-body">{children}</div>
      {onOpen && <button type="button" className="bento-hit" aria-label={openLabel ?? `Open ${title}`} aria-haspopup="dialog" onClick={onOpen} />}
    </section>
  );
}

// What a tile shows when there is nothing to show yet, and the one thing to do about it.
export function BentoEmpty({ children, cta, onCta }: { children: ReactNode; cta?: string; onCta?: () => void }) {
  return (
    <div className="bento-empty">
      <p className="muted">{children}</p>
      {cta && onCta && <button type="button" className="btn ghost small" onClick={onCta}>{cta}</button>}
    </div>
  );
}

// Placeholder tiles in the dashboard's own shapes while the payments are read from the phone.
const SHAPES: { span: Span; compact?: boolean; kind: 'hero' | 'stat' | 'list' }[] = [
  { span: 8, kind: 'hero' }, { span: 4, kind: 'stat' },
  { span: 3, compact: true, kind: 'stat' }, { span: 3, compact: true, kind: 'stat' }, { span: 3, compact: true, kind: 'stat' }, { span: 3, compact: true, kind: 'stat' },
  { span: 8, kind: 'list' }, { span: 4, kind: 'list' },
  { span: 4, kind: 'stat' }, { span: 4, kind: 'stat' }, { span: 4, kind: 'stat' },
];

export function BentoSkeleton({ label }: { label: string }) {
  return (
    <div role="status">
      <span className="sr">{label}</span>
      <BentoGrid>
        {SHAPES.map((s, i) => (
          <div key={i} className={`bento-card span-${s.span}${s.compact ? ' compact' : ''} skel-card`} aria-hidden="true">
            <span className="skel skel-title" />
            <span className={`skel ${s.kind === 'hero' ? 'skel-hero' : 'skel-figure'}`} />
            {s.kind === 'hero' && <span className="skel skel-chart" />}
            {s.kind === 'list' && <><span className="skel skel-line" /><span className="skel skel-line" /><span className="skel skel-line short" /></>}
            {s.kind === 'stat' && <span className="skel skel-line short" />}
          </div>
        ))}
      </BentoGrid>
    </div>
  );
}

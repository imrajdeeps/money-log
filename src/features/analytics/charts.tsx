import { compactINR } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';

// Small hand-written charts (the page loads no chart library). They draw with the app's colours, so they follow light and dark,
// and each says what it shows in words for screen readers (the figures are also written out in the cards around them).

export interface Bar { key: string; label: string; value: number; partial?: boolean }

/** Bars side by side, tallest = the biggest value. A `partial` bar (the month that is not over) is drawn lighter. */
export function BarChart({ items, label, values = true, height = 132 }: { items: Bar[]; label: string; values?: boolean; height?: number }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div role="img" aria-label={`${label}: ${items.map((i) => `${i.label} ${fmtINR(i.value)}`).join(', ')}`}>
      <div className="flex items-stretch gap-1.5" style={{ height }} aria-hidden="true">
        {items.map((i) => (
          <div key={i.key} className="flex-1 min-w-0 flex flex-col">
            {values && <span className="block h-4 text-center text-[10px] leading-4 text-muted tabular-nums whitespace-nowrap overflow-hidden">{i.value > 0 ? compactINR(i.value) : ''}</span>}
            <div className="flex-1 flex items-end">
              <div className={`w-full rounded-t-md bg-accent ${i.partial ? 'opacity-50' : ''}`} style={{ height: `${Math.max(i.value > 0 ? 3 : 0, (i.value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1" aria-hidden="true">
        {items.map((i) => <span key={i.key} className="flex-1 min-w-0 text-center text-[11px] text-muted overflow-hidden text-ellipsis whitespace-nowrap">{i.label}</span>)}
      </div>
    </div>
  );
}

/** A tiny line of a few values, for a row of a table. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 60;
  const H = 18;
  const max = Math.max(1, ...values);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * W : W / 2);
  const y = (v: number) => H - 2 - (v / max) * (H - 4);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="block flex-none text-accent" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {values.length > 0 && <circle cx={x(values.length - 1)} cy={y(values[values.length - 1] ?? 0)} r="2" fill="currentColor" />}
    </svg>
  );
}

// The classes inside the Overview's tiles (shared with the Recurring tile). The tile grid is in Bento.tsx, the shared pieces in styles.ts.
import { cx } from './styles.ts';

/** a line of small muted text in a tile (inside a tile's body it sits 2px below what is above it) */
export const note = 'text-muted text-[13px] mt-0.5 mb-0';
/** the same, pushed to the bottom of the tile */
export const noteFoot = 'text-muted text-[13px] mt-auto mb-0 pt-2.5';
export const heroTop = 'flex items-start justify-between gap-x-3 gap-y-2 flex-wrap';
export const heroNum = 'text-[clamp(36px,7vw,52px)] font-bold leading-[1.05] tracking-[-0.02em] mt-0 mx-0 mb-1';
export const statNum = (compact?: boolean) => cx(compact ? 'text-[21px]' : 'text-[26px]', 'font-bold leading-[1.2] tracking-[-0.01em] m-0 [overflow-wrap:anywhere]');
export const statUnit = 'text-[14px] font-semibold text-muted tracking-[0]';
export const status = (tone?: 'bad' | 'warn' | '') => cx('text-[15px] font-semibold m-0', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : '');
export const delta = (tone?: 'bad' | 'good' | '') =>
  cx('inline-block px-2.5 py-[5px] rounded-full text-[13px] font-bold whitespace-nowrap', tone === 'bad' ? 'bg-bad-bg text-bad' : tone === 'good' ? 'bg-good-bg text-good' : 'bg-bg text-muted');
export const goal = 'mt-2.5';
export const netFacts =
  'list-none mt-3 mx-0 mb-0 p-0 text-[14px] [&>li]:flex [&>li]:justify-between [&>li]:gap-3 [&>li]:py-1.5 [&>li]:px-0 [&>li]:border-t [&>li]:border-line [&_span]:text-muted [&_span]:min-w-0 [&_b]:font-semibold [&_b]:whitespace-nowrap';
export const paceAxis = 'flex justify-between mt-1 text-[11px] text-muted';
export const legend =
  'list-none flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5 mx-0 mb-0 p-0 text-[13px] text-muted [&>li]:inline-flex [&>li]:items-center [&>li]:gap-1.5 [&_b]:text-ink [&_b]:font-semibold';
const KEY = 'inline-block w-4';
export const key = {
  now: `${KEY} [border-top:2px_solid_var(--accent)]`,
  last: `${KEY} [border-top:2px_solid_var(--chart-ref)]`,
  budget: `${KEY} [border-top:2px_dashed_var(--muted)]`,
  proj: `${KEY} [border-top:2px_dashed_var(--accent)]`,
};
export const shares = 'list-none flex flex-col gap-2.5 mt-0.5 mx-0 mb-0 p-0';
export const shareLine = 'flex items-baseline gap-2 text-[14px]';
export const shareName = 'flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis';
export const shareBar =
  'block h-1.5 mt-1 rounded-full overflow-hidden bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] [&>i]:block [&>i]:h-full [&>i]:bg-accent [&>i]:rounded-[0_4px_4px_0] [&>i]:origin-left [&>i]:[animation:grow_700ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]';
export const mini = 'list-none mt-2.5 mx-0 mb-0 p-0 [&>li]:flex [&>li]:items-center [&>li]:gap-2.5 [&>li]:py-2 [&>li]:px-0 [&>li]:border-t [&>li]:border-line';
/** the small "See all" / "Manage" button in a tile's header */
export const seeAll = 'relative z-[2] min-h-11 -mt-2.5 -mr-2.5 -mb-2.5 ml-0 px-3 py-0 border-0 rounded-[10px] bg-transparent text-accent [font-family:inherit] [line-height:inherit] text-[14px] font-semibold cursor-pointer';

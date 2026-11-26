// The classes inside the Overview's tiles (shared with the Recurring tile), as drawn on the design canvas. The tile frame is in
// Bento.tsx, the shared pieces in styles.ts.
import { cx } from './styles.ts';

/** a line of small muted text in a tile */
export const note = 'm-0 text-[13px] leading-[18px] text-muted';
/** a line of small text in the ink colour */
export const noteInk = 'm-0 text-[13px] leading-[18px] text-ink';
/** a 14px line of muted text (Insights) */
export const line14 = 'm-0 text-[14px] leading-5 text-muted';
/** the figure of a wide tile (Last week, Net worth): 26/32, 750 */
export const bigNum = 'm-0 text-[26px] leading-8 font-[750] tracking-normal [overflow-wrap:anywhere]';
/** the figure of a small tile: 21/26, 700 */
export const statNum = 'm-0 text-[21px] leading-[26px] font-bold [overflow-wrap:anywhere]';
/** the words after a figure ("a usual month") */
export const statUnit = 'text-[14px] font-medium text-muted';
/** a small tinted tag under a figure: 13px, 6px corners */
export const tag = (tone: 'good' | 'bad' | 'warn' | 'muted') =>
  cx('self-start m-0 px-2 py-0.5 rounded-md text-[13px] leading-[17px] font-[650]',
    tone === 'good' ? 'text-good bg-good-bg' : tone === 'bad' ? 'text-bad bg-bad-bg' : tone === 'warn' ? 'text-warn bg-warn-bg' : 'text-muted bg-press');
/** a 13px line in a colour, semibold */
export const toneLine = (tone: 'good' | 'bad' | 'warn' | '') => cx('m-0 text-[13px] leading-[18px] font-semibold', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-muted');
/** the 11px caps line at the foot of a tile ("AS OF 25 NOV") */
export const micro = 'm-0 text-[11px] leading-[14px] font-semibold tracking-[0.06em] uppercase text-muted';

// ---- the hero ----------------------------------------------------------------------------------------------------------
export const heroTop = 'flex flex-wrap items-end justify-between gap-x-4 gap-y-2';
export const heroNum = 'block text-[42px] @min-[900px]:text-[52px] leading-[1.05] font-extrabold tracking-[-0.01em]';
export const heroSub = 'block text-[13px] leading-[18px] text-muted';
export const heroPill = (tone: 'good' | 'bad') =>
  cx('px-2.5 py-[5px] rounded-full text-[13px] font-bold whitespace-nowrap', tone === 'good' ? 'bg-[rgba(201,233,106,0.16)] text-[#c9e96a]' : 'bg-[rgba(255,180,186,0.18)] text-[#ffc2c7]');
export const heroStatus = (tone: '' | 'bad' | 'warn') =>
  cx('m-0 text-[17px] leading-[23px] font-bold', tone === 'bad' ? 'text-[#ffc2c7]' : tone === 'warn' ? 'text-[#ffd27a]' : 'text-white');
export const heroSafe = 'm-0 text-[14px] leading-5 text-muted';
export const paceAxis = 'flex justify-between text-[11px] text-muted';
export const legend = 'list-none m-0 p-0 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] leading-4 text-muted [&>li]:flex [&>li]:items-center [&>li]:gap-1.5';
const KEY = 'inline-block w-3.5 flex-none';
export const key = {
  now: `${KEY} [border-top:3px_solid_#c9e96a]`,
  last: `${KEY} [border-top:3px_solid_rgba(234,243,228,0.45)]`,
  proj: `${KEY} [border-top:2px_dashed_#c9e96a]`,
  budget: `${KEY} [border-top:2px_dashed_rgba(234,243,228,0.7)]`,
};

// ---- lists in tiles ----------------------------------------------------------------------------------------------------
/** "Where it went": a category, its share and amount, and a 6px bar */
export const shares = 'list-none m-0 p-0 flex flex-col gap-2.5';
export const shareLine = 'flex justify-between gap-2 text-[14px] [&>span:first-child]:font-semibold [&>span:first-child]:min-w-0 [&>span:first-child]:truncate';
export const bar = 'mt-1 flex h-1.5 rounded-full bg-track overflow-hidden [&>i]:block [&>i]:rounded-full [&>i]:bg-accent [&>i]:origin-left [&>i]:[animation:grow_700ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]';
/** rows that start with a hairline (Recurring payments): 58px tall */
export const rows = 'list-none m-0 p-0 [&>li]:grid [&>li]:grid-cols-[minmax(0,1fr)_auto] [&>li]:gap-3 [&>li]:items-center [&>li]:min-h-[58px] [&>li]:border-t [&>li]:border-line';
export const rowTitle = 'block text-[15px] font-semibold';
/** the "See all" / "Dismiss" link at the right of a tile's title */
export const seeAll = 'relative z-[2] min-h-11 -my-3 -mr-2 px-2 py-0 border-0 bg-transparent text-brand [font-family:inherit] [line-height:inherit] text-[14px] font-semibold cursor-pointer';

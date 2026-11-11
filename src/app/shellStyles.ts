// The page frame's own classes (header, section links, bottom bar, toast, the back link). The shared building blocks are in ui/styles.ts.
import { cx } from '../ui/styles.ts';

/** the page: header on top, then the pages, then the bottom bar; more room and no bottom bar from 1024px */
export const app = 'max-w-[1240px] mx-auto min-h-dvh px-4 pt-0 pb-[calc(100px+env(safe-area-inset-bottom))] lg:px-8 lg:pb-12';
/** the header stays at the top while the page scrolls; it has the page's own background so nothing shows through */
export const top =
  'sticky top-0 z-[6] flex items-center justify-between gap-3 px-0 pt-[calc(env(safe-area-inset-top)+8px)] pb-3 bg-bg [box-shadow:0_1px_0_var(--line)] lg:pt-5 lg:pb-3.5';
export const brand = 'flex-1 min-w-0 whitespace-nowrap max-lg:[&_h1]:text-[17px] lg:flex-none';
export const topNav = 'hidden lg:flex flex-1 justify-center gap-0.5';
const NAV_BTN = 'min-h-11 px-3.5 py-0 [line-height:inherit] border-0 rounded-[10px] [font-family:inherit] text-[15px] font-semibold cursor-pointer';
/** a section link in the header (wide screens only) */
export const topNavBtn = (active: boolean) =>
  cx(NAV_BTN, active ? 'bg-card text-ink [box-shadow:inset_0_0_0_1px_var(--line)]' : 'bg-transparent text-muted hover:bg-card hover:text-ink');
export const topActions = 'flex items-center gap-1.5 lg:gap-2';
/** the Add expense button of the header (wide screens only); used with btn('solid', 'none', ...) */
export const addBtn = 'max-lg:hidden gap-1.5 min-h-11 pl-3 pr-4 py-2';
/** the Settings button of the header (a phone has its sections in the bottom bar) */
export const gear = 'lg:hidden';
export const main = 'lg:pt-2.5';
export const narrow = 'max-w-[600px] mx-auto';
export const page = 'max-w-[720px] mx-auto';
  'inline-flex items-center gap-0.5 mt-0.5 mr-0 mb-3 -ml-1.5 py-2 pr-3 pl-1 border-0 bg-transparent text-accent [font-family:inherit] [font-size:inherit] [line-height:inherit] font-semibold cursor-pointer [&>svg]:[transform:rotate(180deg)]';

/** the bottom bar of a phone: Home, Month, the raised Add button, Plan, Groups */
export const tabs =
  'fixed inset-x-0 bottom-0 z-[5] flex bg-card border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden ' +
  'min-[600px]:left-1/2 min-[600px]:right-auto min-[600px]:w-[560px] min-[600px]:[transform:translateX(-50%)] min-[600px]:border-x min-[600px]:border-line';
export const tabBtn = (active: boolean, add?: boolean) =>
  cx(
    'flex-1 min-w-0 min-h-[62px] border-0 bg-transparent [font-family:inherit] [line-height:inherit] text-[12px] font-semibold flex flex-col items-center justify-center gap-[3px] cursor-pointer transition-colors duration-150',
    active ? 'text-accent' : add ? 'text-ink' : 'text-muted',
    add && 'group/fab focus-visible:outline-none',
  );
export const fabCircle =
  'w-14 h-14 -mt-[34px] rounded-[50%] flex items-center justify-center bg-primary text-primary-ink ' +
  '[box-shadow:0_0_0_4px_var(--card),inset_0_0_0_1px_var(--primary-ring),0_8px_18px_-6px_rgba(16,40,28,0.55)] ' +
  'transition-transform duration-150 group-active/fab:[transform:scale(0.94)] motion-reduce:group-active/fab:[transform:none] ' +
  'group-focus-visible/fab:[outline:3px_solid_var(--accent)] group-focus-visible/fab:outline-offset-[3px]';
/** the button in a message (Undo): the message itself ignores taps, the button does not */
export const toastButton = 'pointer-events-auto ml-3 px-2.5 py-1 min-h-9 rounded-lg border-0 bg-[color-mix(in_srgb,var(--bg)_16%,transparent)] text-inherit [font-family:inherit] text-[14px] font-bold cursor-pointer';
export const toast =
  'fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] max-w-[528px] mx-auto px-4 py-3 rounded-xl bg-ink text-bg text-[14px] text-center z-10 pointer-events-none empty:hidden lg:bottom-6';

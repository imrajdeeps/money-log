// The page frame's own classes (header, section links, bottom bar, toast, the back link). The shared building blocks are in ui/styles.ts.
import { cx } from '../ui/styles.ts';

/** the page: header on top, then the pages, then the bottom bar; more room and no bottom bar from 1024px */
export const app = 'min-h-dvh pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-0';
/** the header stays at the top while the page scrolls; it has the page's own background so nothing shows through */
export const top = 'sticky top-0 z-[6] bg-bg border-b border-line pt-[env(safe-area-inset-top)]';
/** the header's row: 56px on a phone (16px in, 6px on the right for the icon buttons), 68px and 1180px wide from 1024px */
export const topRow = 'h-14 pl-4 pr-1.5 flex items-center justify-between gap-3 lg:max-w-[1244px] lg:mx-auto lg:h-[68px] lg:px-8 lg:gap-5';
export const brand =
  'flex-1 min-w-0 whitespace-nowrap flex items-center gap-2 [&_h1]:m-0 [&_h1]:text-[17px] [&_h1]:font-[750] [&_h1]:leading-none ' +
  'lg:flex-none lg:gap-2.5 lg:[&_h1]:text-[18px] lg:[&>svg]:w-8 lg:[&>svg]:h-8';
export const topNav = 'hidden lg:flex flex-1 justify-center gap-1';
const NAV_BTN = 'min-h-11 px-3.5 py-0 [line-height:inherit] border-0 rounded-[10px] [font-family:inherit] text-[15px] cursor-pointer';
/** a section link in the header (wide screens only) */
export const topNavBtn = (active: boolean) =>
  cx(NAV_BTN, active ? 'bg-tab-pill text-brand font-bold' : 'bg-transparent text-muted font-semibold hover:bg-card hover:text-ink');
export const topActions = 'flex items-center lg:gap-1.5';
/** the Add expense button of the header (wide screens only); used with btn('solid', 'none', ...) */
export const addBtn = 'max-lg:hidden gap-1.5 min-h-11 h-11 pl-3 pr-4 py-0 rounded-xl text-[15px] font-[650] whitespace-nowrap [&>svg]:[stroke-width:2.2]';
/** the Settings button of the header (a phone has its sections in the bottom bar) */
export const gear = 'lg:hidden';
/** the pages: 16px in on a phone; 1180px wide with 32px in from 1024px */
export const main = 'px-4 pt-3.5 pb-2 lg:max-w-[1180px] lg:mx-auto lg:px-8 lg:pt-7 lg:pb-14';
/** Add expense: a screen of its own on a phone (8px from the top, room at the foot); on a wide screen the pages' frame with 24px on top */
export const mainAdd = 'px-4 pt-[calc(8px+env(safe-area-inset-top))] pb-7 lg:max-w-[1180px] lg:mx-auto lg:px-8 lg:pt-6 lg:pb-16';
export const narrow = 'max-w-[600px] mx-auto';
export const page = 'max-w-[720px] mx-auto';
  'inline-flex items-center gap-0.5 mt-0.5 mr-0 mb-3 -ml-1.5 py-2 pr-3 pl-1 border-0 bg-transparent text-accent [font-family:inherit] [font-size:inherit] [line-height:inherit] font-semibold cursor-pointer [&>svg]:[transform:rotate(180deg)]';

/** the bottom bar of a phone: Home, Month, the raised Add button, Plan, Groups */
export const tabs =
  'fixed inset-x-0 bottom-0 z-[5] grid grid-cols-5 items-center h-[calc(76px+env(safe-area-inset-bottom))] bg-card border-t border-line pb-[calc(8px+env(safe-area-inset-bottom))] lg:hidden ' +
  'min-[600px]:left-1/2 min-[600px]:right-auto min-[600px]:w-[560px] min-[600px]:[transform:translateX(-50%)] min-[600px]:border-x min-[600px]:border-line';
export const tabBtn = (active: boolean) =>
  cx(
    'min-w-0 min-h-[60px] border-0 bg-transparent [font-family:inherit] [line-height:inherit] text-[12px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors duration-150',
    active ? 'text-brand font-bold' : 'text-muted font-medium', // the open tab: pill, bold word, aria-current
  );
/** the pill behind a tab's icon (52 by 30), filled on the open tab */
export const tabIcon = (active: boolean) => cx('w-[52px] h-[30px] rounded-full flex items-center justify-center', active ? 'bg-tab-pill' : 'bg-transparent');
/** the raised Add button in the middle of the bottom bar: a 60px lime circle with a 4px ring of the bar's colour */
export const fab =
  'justify-self-center w-[60px] h-[60px] -mt-[30px] rounded-full border-4 border-card bg-primary text-primary-ink flex items-center justify-center cursor-pointer p-0 ' +
  '[box-shadow:var(--fab-shadow)] transition-transform duration-150 active:scale-[0.94] motion-reduce:active:[transform:none] ' +
  'focus-visible:[outline:3px_solid_var(--accent)] focus-visible:outline-offset-[3px]';
/** the button in a message (Undo): the message itself ignores taps, the button does not */
export const toastButton = 'pointer-events-auto -my-2 -mr-2.5 ml-3 px-3.5 min-h-11 flex-none rounded-[10px] border-0 bg-transparent text-toast-action [font-family:inherit] text-[15px] font-bold cursor-pointer';
export const toast =
  'fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] max-w-[528px] mx-auto px-4 py-3 rounded-[14px] bg-ink text-bg text-[15px] font-semibold ' +
  'flex items-center justify-between [box-shadow:var(--shadow-pop)] z-10 pointer-events-none empty:hidden lg:bottom-6';

// The building blocks every screen uses (buttons, cards, fields, messages, lists), written as Tailwind utility classes.
// Each variant is a COMPLETE class string, never "base + override": two utilities for the same property are decided by the order
// of the generated stylesheet, not by the order in the string. The numbers are the old hand-written values (see docs/structure.md).

export type Cls = string | false | null | undefined;
export const cx = (...parts: Cls[]) => parts.filter(Boolean).join(' ');

// text: a colour or a size only (the named Tailwind sizes also set a line height, so sizes are written in px)
export const muted = 'text-muted';
export const small = 'text-[13px]';
export const mutedSmall = 'text-muted text-[13px]';
export const amt = 'font-bold tabular-nums';
/** the heading above a block of a page (an h3 that looks like a small h2) */
export const blockTitle = 'text-[16px] mt-5 mb-2';

// ---- buttons ----------------------------------------------------------------------------------------------------------
const BTN =
  'inline-flex items-center justify-center rounded-xl border cursor-pointer text-center font-semibold [font-family:inherit] [line-height:inherit] ' +
  'disabled:opacity-45 disabled:cursor-not-allowed transition-[transform,background-color,border-color] duration-[120ms] enabled:active:scale-[0.97]';
const BTN_COLOUR = {
  solid: 'bg-primary text-primary-ink border-transparent [box-shadow:inset_0_0_0_1px_var(--primary-ring)]', // a pale lime fill gets a soft ring for an edge
  ghost: 'bg-transparent text-ink border-line',
  danger: 'bg-transparent text-bad border-bad',
} as const;
const BTN_SIZE = {
  md: 'min-h-12 px-[18px] py-2.5 [font-size:inherit]',
  big: 'min-h-[54px] px-[18px] py-2.5 w-full mt-3.5 text-[17px]',
  small: 'min-h-11 px-3 py-0 flex-none w-auto text-[14px]',
  sq: 'min-w-12 min-h-12 p-0 text-[22px]',
  none: '[font-size:inherit]', // the caller sets the height and padding
} as const;
/** A button (or a label that looks like one). `extra` is for what only this place needs: a margin, a width. */
export function btn(colour: keyof typeof BTN_COLOUR = 'solid', size: keyof typeof BTN_SIZE = 'md', extra?: Cls) {
  return cx(BTN, BTN_COLOUR[colour], BTN_SIZE[size], extra);
}
/** A row of buttons side by side, sharing the width. */
export const btnRowOf = (margin: string) => `flex gap-2.5 ${margin} [&>*]:flex-1`;
export const btnRow = btnRowOf('mt-3.5 mb-2.5');

// ---- chips and fields -------------------------------------------------------------------------------------------------
export const chip =
  'border border-line bg-card text-ink rounded-full min-h-11 px-3.5 py-1.5 text-[14px] cursor-pointer [font-family:inherit] [line-height:inherit] ' +
  'aria-pressed:bg-brand aria-pressed:text-brand-ink aria-pressed:border-brand transition-[transform,background-color,border-color] duration-[120ms] active:scale-[0.97]';
/** a fieldset of chips; its legend is the label */
export const chips =
  'border-0 p-0 mx-0 mt-3 mb-0 flex flex-wrap gap-2 [&>legend]:w-full [&>legend]:block [&>legend]:text-[13px] [&>legend]:text-muted [&>legend]:mb-1 [&>legend]:p-0 [&+form]:mt-3 [&+p]:mt-3';
const FIELD_LABEL = '[&>span]:block [&>span]:text-[13px] [&>span]:text-muted [&>span]:mb-1 [&>span]:p-0';
/** a label with its input; `half` shares a row (inside a btnRow) */
export const field = `block mt-3 ${FIELD_LABEL}`;
export const fieldHalf = `block flex-1 m-0 ${FIELD_LABEL}`;

// ---- messages and cards -----------------------------------------------------------------------------------------------
const MSG_TONE = {
  none: 'mt-2.5 mx-0 mb-0 p-0 text-[14px]',
  bad: 'mt-2.5 mx-0 mb-0 p-0 text-[14px] text-bad',
  good: 'mt-2.5 mx-0 mb-2.5 px-3 py-2.5 text-[14px] text-good bg-good-bg rounded-[10px] [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-1',
} as const;
/** a line of feedback under a form: plain, an error, or a success box */
export function msg(tone?: 'bad' | 'good' | false | null) {
  return MSG_TONE[tone || 'none'];
}
export const banner = 'bg-bad-bg text-bad px-3 py-2.5 rounded-[10px] mt-0 mx-0 mb-3 text-[14px] font-semibold';
export function card(tone?: 'notice') {
  return cx('border rounded-card p-4 mb-3.5 [ul+&]:mt-3.5', tone === 'notice' ? 'bg-warn-bg border-transparent' : 'bg-card border-line');
}
/** a button that sits straight inside a card gets room above it and the card's width */
export const inCard = 'mt-1.5 w-full';

// ---- lists ------------------------------------------------------------------------------------------------------------
const LIST = 'list-none p-0 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line';
/** the boxed list; `plain` has no box (a list inside something that is already a box) */
export function list(plain?: boolean, margin = 'm-0') {
  return cx(LIST, margin, plain ? 'bg-transparent border-0 rounded-none' : 'bg-card border border-line rounded-card');
}
const ROW_BASE =
  'flex w-full items-center gap-2.5 border-0 bg-transparent text-inherit text-left cursor-pointer [font-family:inherit] [font-size:inherit] [line-height:inherit] ' +
  '[&>svg]:flex-none [&>svg]:text-muted [@media(hover:hover)]:hover:bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]';
export const row = `${ROW_BASE} min-h-[58px] px-3.5 py-2.5`;
/** a row that is not a button (no pointer) */
export const rowStatic = `${ROW_BASE.replace('cursor-pointer', 'cursor-default')} min-h-[58px] px-3.5 py-2.5`;
/** a row of the short list on the Overview: tighter, with rounded corners for the hover */
export const rowCompact = `${ROW_BASE} min-h-[54px] p-2 rounded-xl`;
const ROW_SMALL = '[&_small]:text-muted [&_small]:overflow-hidden [&_small]:text-ellipsis';
/** the text part of a row; the small line under the title stays on one line unless `wrap` */
export function rowMain(wrap?: boolean) {
  return cx('flex flex-1 min-w-0 flex-col', ROW_SMALL, wrap ? '[&_small]:whitespace-normal' : '[&_small]:whitespace-nowrap');
}
/** a line with a name on the left and an amount on the right: bare, inside a boxed list, or inside a plain list (no side padding) */
export const catLine = 'flex justify-between gap-3 tabular-nums';
export const catLineBox = 'flex justify-between gap-3 tabular-nums px-3.5 py-3';
export const catLineFlush = 'flex justify-between gap-3 tabular-nums py-2.5 px-0';
/** the colour of an amount someone is owed, or owes */
export const owed = 'text-good font-semibold';

// ---- small parts that several screens share ---------------------------------------------------------------------------
/** red and semibold: something overdue */
export const late = 'text-bad font-semibold';
/** a square icon button (44px target) */
export const icoBtn = 'min-w-11 min-h-11 flex-none border border-line rounded-[10px] bg-transparent text-[18px] cursor-pointer';
/** a small pill of text beside a heading */
export const tag = 'ml-2 text-[12px] font-bold px-2 py-0.5 rounded-full bg-bad-bg text-bad align-middle';
/** a "Finished" fold: a details element with a muted summary */
export function finished(margin = 'my-3.5') {
  return cx(margin, '[&>summary]:cursor-pointer [&>summary]:py-2 [&>summary]:text-muted [&>summary]:font-semibold');
}
/** a short list of facts (a ul) */
export const facts = 'list-none mt-0 mx-0 mb-2 p-0 [&>li]:mb-1';
/** a numbered list of steps */
export const steps = 'pl-5 my-2.5 mx-0 [&>li]:mb-1';
/** a line of a due list or a list of balances: an icon or tick, the text, and a button */
export function dueRow(done?: boolean) {
  return cx('flex items-center gap-2.5 px-3 py-2 [&_b]:[overflow-wrap:anywhere]', done && '[&_b]:line-through [&_b]:text-muted');
}

// ---- the page frame ---------------------------------------------------------------------------------------------------
/** a square icon button in the header (44px) */
export const iconBtn =
  'inline-flex w-11 h-11 items-center justify-center border border-line rounded-xl bg-card text-ink cursor-pointer hover:bg-bg hover:text-ink aria-[current=page]:text-accent aria-[current=page]:border-accent';
const PILL =
  'relative rounded-full px-3 py-1.5 min-h-[34px] text-[13px] font-semibold cursor-pointer border ' +
  "after:content-[''] after:absolute after:-inset-x-0.5 after:-inset-y-[5px] " + // a 44px target without a taller pill
  'transition-[transform,background-color,border-color] duration-[120ms] active:scale-[0.97]';
const PILL_TONE = {
  idle: 'border-line bg-card text-ink',
  good: 'border-line bg-card text-good',
  warn: 'border-transparent bg-warn-bg text-warn',
  bad: 'border-transparent bg-bad-bg text-bad',
  busy: 'border-line bg-card text-accent',
  muted: 'border-line bg-card text-muted',
} as const;
/** the sync pill in the header */
export const pill = (tone: keyof typeof PILL_TONE) => cx(PILL, PILL_TONE[tone]);
export type PillTone = keyof typeof PILL_TONE;

// ---- meters (budget bars) ---------------------------------------------------------------------------------------------
const GROW = 'origin-left [animation:grow_700ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]'; // the fill grows from the left when it appears
/** a plain bar: put an <i style={{ width }}> with barFill() inside */
export const bar = 'h-2 rounded-full bg-line overflow-hidden mt-2 mb-1';
export const barFill = (tone?: 'good' | 'bad') => cx('block h-full rounded-full', tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-bad' : 'bg-muted', GROW);
const METER_TONE = {
  accent: '[--meter:var(--accent)]',
  warn: '[--meter:var(--warn)]',
  bad: '[--meter:var(--bad)]',
  good: '[--meter:var(--good)]',
  idle: '[--meter:var(--muted)]',
} as const;
export type MeterTone = keyof typeof METER_TONE;
/** a budget meter: the track is a light step of the fill's own colour; put an <i style={{ width }}> inside */
export const meter = (tone: MeterTone, margin = 'mt-2 mb-1') =>
  cx('h-2 rounded-full overflow-hidden bg-[color-mix(in_srgb,var(--meter)_16%,transparent)]', margin, METER_TONE[tone],
    '[&>i]:block [&>i]:h-full [&>i]:rounded-[0_4px_4px_0] [&>i]:bg-[var(--meter)]', `[&>i]:${GROW.split(' ').join(' [&>i]:')}`);
/** the words beside a meter ("2,000 left") */
export const leftText = (tone?: 'good' | 'bad' | 'warn' | '') => cx('text-[13px] font-semibold', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-muted');

// ---- the page heading and the bits of a row ---------------------------------------------------------------------------
export const pageHead = 'flex items-baseline justify-between gap-3 mt-0.5 mb-3.5 mx-0 [&_h2]:text-[24px] [&_h2]:m-0 [&_h2]:tracking-[-0.01em] [&_p]:m-0';
export const dot = 'w-2.5 h-2.5 rounded-[50%] bg-warn flex-none';

// ---- more shared pieces -----------------------------------------------------------------------------------------------
export const backLink =
  'inline-flex items-center gap-0.5 mt-0.5 mr-0 mb-3 -ml-1.5 py-2 pr-3 pl-1 border-0 bg-transparent text-accent [font-family:inherit] [font-size:inherit] [line-height:inherit] font-semibold cursor-pointer [&>svg]:[transform:rotate(180deg)]';
/** a button that looks like a link, inside a line of text */
export const linkBtn = 'bg-transparent border-0 p-0 [font-family:inherit] [font-size:inherit] [font-weight:inherit] [line-height:inherit] text-brand underline cursor-pointer';
/** the big figure of a small card */
export const bigNum = 'text-[22px] font-bold m-0 tabular-nums';
/** a dashed box that holds a small form (a new category, a password reset) */
export const newCat = 'mt-2.5 px-3 pt-2.5 pb-0.5 border border-dashed border-line rounded-xl';
/** a checkbox with its label */
export const check = 'flex items-center gap-2.5 min-h-11 [&>input]:w-[22px] [&>input]:h-[22px] [&>input]:flex-none';
/** a small card in a grid of two (the Month page's group tiles); `picked` outlines the one the page is filtered to */
export const groupTile = (picked?: boolean) =>
  cx('border rounded-card bg-card border-line m-0 px-3.5 py-3', picked && '[box-shadow:0_0_0_2px_var(--accent)]');

// ---- groups -----------------------------------------------------------------------------------------------------------
export const settleForm = 'mt-3 pt-1 border-t border-line';
export const codeBox = 'text-[24px] font-bold tracking-[2px] text-center p-3 my-2 mx-0 border border-dashed border-line rounded-xl tabular-nums select-all';
export const coupleLine = (tone: 'owed' | 'late' | 'muted') => cx('mt-0 mx-0 mb-1.5 text-[20px] font-bold tracking-[-0.01em]', tone === 'owed' ? 'text-good' : tone === 'late' ? 'text-bad' : 'text-muted');
export const closedBanner = 'mt-0 mx-0 mb-3 px-3 py-2.5 rounded-xl bg-[var(--card-2,var(--bg))] border border-line text-[14px]';
/** a fieldset of choice cards (the kinds of group); the legend is the label */
export const kinds = 'border-0 p-0 mx-0 mt-3 mb-0 grid gap-2 [&>legend]:block [&>legend]:text-[13px] [&>legend]:text-muted [&>legend]:mb-1 [&>legend]:p-0';
export const kindCard =
  'flex flex-col items-start gap-0.5 w-full min-h-14 px-3.5 py-2.5 border border-line rounded-[14px] bg-card text-ink text-left cursor-pointer ' +
  '[font-family:inherit] [font-size:inherit] [font-weight:inherit] [line-height:inherit] [&_span]:text-[13px] [&_span]:text-muted ' +
  'aria-pressed:border-brand aria-pressed:[box-shadow:inset_0_0_0_2px_var(--brand)]';
/** the who-pays and who-owes split of an expense */
export const split = 'mt-3';
export const splitRow = 'flex items-center gap-2.5 px-3 py-2';

// ---- payments ---------------------------------------------------------------------------------------------------------
/** the receipt photos of an expense: a label, the thumbnails, the add button */
export const photoStrip = 'mt-3.5 [&+button]:mt-3 [&+p]:mt-3 [&+form]:mt-3';
export const fieldLabel = 'text-[13px] text-muted mt-0 mx-0 mb-1.5';
export const thumbs = 'flex flex-wrap gap-2 items-stretch';
export const thumb =
  'relative w-[84px] h-[84px] p-0 border border-line rounded-xl bg-card overflow-hidden cursor-pointer flex items-center justify-center text-center text-inherit ' +
  '[font-family:inherit] [font-size:inherit] [font-weight:inherit] [line-height:inherit] [&>img]:w-full [&>img]:h-full [&>img]:object-cover [&>img]:block';
export const thumbTag = 'absolute inset-x-0 bottom-0 px-1 py-0.5 text-[10px] font-bold bg-warn-bg text-warn';
export const thumbX =
  "absolute top-1 right-1 w-7 h-7 rounded-[50%] border-0 bg-[rgba(0,0,0,0.65)] text-[#fff] text-[14px] cursor-pointer after:content-[''] after:absolute after:-inset-2"; // the ::after makes a 44px target
export const addPhoto = (busy: boolean) => btn('ghost', 'none', cx('relative min-h-[84px] w-auto px-3.5 py-0 m-0', busy ? 'opacity-50 disabled:opacity-50 pointer-events-none' : ''));
/** the photo viewer and the camera dialog (the dialog's own box is the base dialog style) */
export const viewer = 'max-w-[96vw] [&_img]:block [&_img]:w-full [&_img]:max-h-[70vh] [&_img]:object-contain [&_img]:rounded-[10px] [&_img]:bg-[#000] [&_img]:mb-2.5';
export const camera = '[&_video]:block [&_video]:w-full [&_video]:max-h-[70vh] [&_video]:object-contain [&_video]:rounded-[10px] [&_video]:bg-[#000]';
export const histRow = 'px-3 py-2.5 [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-0.5';
export const pasteBox =
  'mt-0 mx-0 mb-3.5 px-3.5 py-3 border border-line rounded-[14px] bg-card [&>summary]:min-h-7 [&>summary]:cursor-pointer [&>summary]:font-semibold [&>summary]:text-accent ' +
  '[&_textarea]:w-full [&_textarea]:box-border [&_textarea]:mt-1';
/** the big amount field of Add expense */
export const amount =
  'flex items-center gap-1.5 border border-line rounded-xl px-3.5 py-1 bg-bg focus-within:[outline:3px_solid_var(--accent)] focus-within:outline-offset-2 ' +
  '[&_span]:text-[30px] [&_span]:text-muted [&_input]:border-0 [&_input]:bg-transparent [&_input]:text-[34px] [&_input]:font-bold [&_input]:min-h-[60px] [&_input]:p-0 [&_input:focus-visible]:outline-none';
export const payFilters = 'mb-3 [&_p]:m-0';
export const paySelects = 'grid grid-cols-3 gap-2 my-2 mx-0 [&_select]:px-2';

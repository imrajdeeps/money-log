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
  return cx('border rounded-card p-4 mb-3.5', tone === 'notice' ? 'bg-warn-bg border-transparent' : 'bg-card border-line');
}
/** a button that sits straight inside a card gets room above it and the card's width */
export const inCard = 'mt-1.5 w-full';

// ---- lists ------------------------------------------------------------------------------------------------------------
const LIST = 'list-none p-0 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line';
/** the boxed list; `plain` has no box (a list inside something that is already a box) */
export function list(plain?: boolean, margin = 'm-0') {
  return cx(LIST, margin, plain ? 'bg-transparent border-0 rounded-none' : 'bg-card border border-line rounded-card');
}
export const row =
  'flex w-full items-center gap-2.5 min-h-[58px] px-3.5 py-2.5 border-0 bg-transparent text-inherit text-left cursor-pointer [font-family:inherit] [font-size:inherit] [line-height:inherit] ' +
  '[&>svg]:flex-none [&>svg]:text-muted [@media(hover:hover)]:hover:bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]';
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

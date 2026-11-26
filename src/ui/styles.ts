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
  'relative inline-flex items-center justify-center gap-2 rounded-xl border cursor-pointer text-center font-[650] [font-family:inherit] [line-height:inherit] whitespace-nowrap ' +
  'disabled:bg-disabled-bg disabled:text-disabled-ink disabled:border-transparent disabled:[box-shadow:none] disabled:cursor-not-allowed ' +
  'transition-[translate,background-color,border-color] duration-[120ms] enabled:active:translate-y-px'; // pressed: one step darker and 1px down
const BTN_COLOUR = {
  solid: 'bg-primary text-primary-ink border-primary enabled:active:bg-primary-press enabled:active:border-primary-press',
  ghost: 'bg-card text-brand border-control-line enabled:active:bg-press',
  outline: 'bg-transparent text-brand border-control-line enabled:active:bg-press', // on a card's own colour (photo buttons, Create a group)
  dangerOutline: 'bg-transparent text-bad border-bad enabled:active:bg-bad-bg', // Delete payment: red words and edge
  danger: 'bg-danger-bg text-danger-ink border-danger-line enabled:active:bg-danger-press enabled:active:border-danger-press', // solid red in light, a red tint in dark
} as const;
const BTN_SIZE = {
  md: 'min-h-12 px-5 py-2 text-[16px]',
  big: 'min-h-14 px-7 py-2 w-full mt-3.5 text-[17px]',
  small: "min-h-9 h-9 px-3.5 py-0 flex-none w-auto text-[14px] after:content-[''] after:absolute after:inset-x-0 after:-inset-y-1", // 36 tall, a 44px target
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
const CHIP =
  'inline-flex items-center border border-control-line bg-card text-ink rounded-full min-h-10 px-3.5 py-0 text-[15px] font-semibold cursor-pointer [font-family:inherit] [line-height:inherit] ' +
  'aria-[pressed=false]:active:bg-press aria-pressed:bg-brand aria-pressed:text-brand-ink aria-pressed:border-brand ' +
  'disabled:bg-[#f2f3f0] disabled:text-[#8c948d] disabled:border-line disabled:cursor-not-allowed transition-[background-color,border-color] duration-[120ms]';
/** a chip (method, day, filter): 40px, the chosen one filled with the brand colour */
export const chip = CHIP;
/** a category chip: the chosen one also has a tick */
export const chipTick = CHIP + " aria-pressed:before:content-['✓'] aria-pressed:before:mr-1.5 aria-pressed:before:font-bold";
/** the dashed "+ New category" chip */
export const chipNew = 'inline-flex items-center min-h-10 px-3.5 py-0 rounded-full border border-dashed border-control-line bg-transparent text-brand text-[15px] font-semibold cursor-pointer [font-family:inherit] [line-height:inherit]';
/** a row of chips (a fieldset with its legend: 13px, 600, 8px above the chips) */
const CHIPS = 'border-0 p-0 flex flex-wrap gap-2 [&>legend]:w-full [&>legend]:block [&>legend]:text-[13px] [&>legend]:font-semibold [&>legend]:text-ink [&>legend]:mb-2 [&>legend]:p-0';
export const chips = `${CHIPS} mx-0 mt-3 mb-0`;
/** the same with no margin, for a form that spaces its parts with a gap */
export const chipsBare = `${CHIPS} m-0`;
const FIELD_LABEL = '[&>span]:block [&>span]:text-[13px] [&>span]:font-semibold [&>span]:text-ink [&>span]:mb-1.5 [&>span]:p-0';
/** the label above a field when it is not inside the label (13px, 600) */
export const label = 'block m-0 mb-1.5 text-[13px] font-semibold text-ink';
/** the line of help under a field */
export const hint = 'm-0 mt-1.5 text-[13px] leading-[18px] text-muted';
/** a two-way (or three-way) switch: a grey track with the chosen one raised in white */
export const segment = (n: 2 | 3 = 2) => cx('grid gap-1 p-1 rounded-[14px] bg-press', n === 3 ? 'grid-cols-3' : 'grid-cols-2');
const SEG_BTN =
  'h-11 rounded-[10px] border-0 bg-transparent text-muted font-[650] cursor-pointer [font-family:inherit] ' +
  'aria-checked:bg-card aria-checked:text-ink aria-checked:[box-shadow:0_1px_3px_rgba(16,40,28,0.12)] aria-pressed:bg-card aria-pressed:text-ink aria-pressed:[box-shadow:0_1px_3px_rgba(16,40,28,0.12)]';
export const segBtn = `${SEG_BTN} text-[16px]`;
/** the same at 15px (three choices) */
export const segBtnSm = `${SEG_BTN} text-[15px]`;
/** a label with its input; `half` shares a row (inside a btnRow) */
export const field = `block mt-3 ${FIELD_LABEL}`;
export const fieldHalf = `block flex-1 m-0 ${FIELD_LABEL}`;
/** a label with its input, no margin: for a form that spaces its parts with a gap */
export const fieldBare = `block m-0 ${FIELD_LABEL}`;

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
export const icoBtn = 'inline-flex items-center justify-center p-0 leading-none min-w-11 min-h-11 flex-none border border-line rounded-[10px] bg-transparent text-[18px] cursor-pointer';
/** a small pill of text beside a heading */
export const tag = 'ml-2 text-[12px] font-semibold px-2 py-0.5 rounded-md bg-bad-bg text-bad align-middle';
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
  'inline-flex w-11 h-11 items-center justify-center border-0 rounded-xl bg-transparent text-ink cursor-pointer hover:bg-press active:bg-press aria-[current=page]:text-brand aria-[current=page]:bg-tab-pill';
const PILL =
  'relative inline-flex items-center rounded-full px-3 py-0 h-[34px] text-[13px] font-semibold whitespace-nowrap cursor-pointer border max-lg:h-[30px] max-lg:px-2.5 max-lg:text-[12px] ' +
  "after:content-[''] after:absolute after:-inset-x-0.5 after:-inset-y-[5px] " + // a 44px target without a taller pill
  'transition-[transform,background-color,border-color] duration-[120ms] active:scale-[0.97]';
const DOT = "before:content-[''] before:inline-block before:w-[7px] before:h-[7px] before:rounded-full before:mr-1.5 before:align-[1px]";
const PILL_TONE = {
  idle: 'border-line bg-card text-ink',
  good: `border-transparent bg-good-bg text-good ${DOT} before:bg-good`,
  warn: 'border-transparent bg-warn-bg text-warn',
  bad: 'border-transparent bg-bad-bg text-bad',
  busy: 'border-transparent bg-press text-ink',
  muted: 'border-control-line bg-transparent text-muted',
  signin: 'border-control-line bg-transparent text-brand',
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
  warn: '[--meter:var(--meter-warn)]',
  bad: '[--meter:var(--bad)]',
  good: '[--meter:var(--good)]',
  idle: '[--meter:var(--muted)]',
} as const;
export type MeterTone = keyof typeof METER_TONE;
/** a budget meter: the track is a light step of the fill's own colour; put an <i style={{ width }}> inside */
export const meter = (tone: MeterTone, margin = 'mt-2 mb-1.5') =>
  cx('h-1.5 rounded-full overflow-hidden bg-track', margin, METER_TONE[tone],
    '[&>i]:block [&>i]:h-full [&>i]:rounded-full [&>i]:bg-[var(--meter)]', `[&>i]:${GROW.split(' ').join(' [&>i]:')}`);
/** the words beside a meter ("2,000 left") */
/** the words beside a budget meter, as a small tinted tag, so "nearly used" and "over" read even without the bar's colour */
export const meterWords = (tone?: 'good' | 'bad' | 'warn' | '') =>
  cx('inline-block self-start px-2 py-0.5 rounded-md text-[13px] leading-[17px] font-[650]', tone === 'good' ? 'text-good bg-good-bg' : tone === 'bad' ? 'text-bad bg-bad-bg' : tone === 'warn' ? 'text-warn bg-warn-bg' : 'text-muted bg-press');
export const leftText = (tone?: 'good' | 'bad' | 'warn' | '') => cx('text-[13px] font-semibold', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-muted');

// ---- the page heading and the bits of a row ---------------------------------------------------------------------------
export const pageHead = 'flex items-center justify-between gap-3 mt-0.5 mb-3.5 mx-0 [&_h2]:text-[24px] [&_h2]:m-0 [&_h2]:tracking-[-0.01em] [&_p]:m-0';
export const dot = 'w-2.5 h-2.5 rounded-[50%] bg-warn flex-none';

// ---- more shared pieces -----------------------------------------------------------------------------------------------
export const backLink =
  'self-start inline-flex items-center gap-0.5 min-h-11 -ml-1.5 p-0 pr-2 border-0 bg-transparent text-brand [font-family:inherit] text-[15px] font-[650] cursor-pointer';
/** a button that looks like a link, inside a line of text */
export const linkBtn = 'bg-transparent border-0 p-0 [font-family:inherit] [font-size:inherit] [font-weight:inherit] [line-height:inherit] text-brand underline cursor-pointer';
/** the big figure of a small card */
export const bigNum = 'text-[22px] font-bold m-0 tabular-nums';
/** a dashed box that holds a small form (a new category, a password reset) */
export const newCat = 'mt-2.5 px-3 pt-2.5 pb-0.5 border border-dashed border-line rounded-xl';
/** the card that holds Add expense's ticks (Repeat every month, Split with others), one per line (version 2.0) */
export const tickCard = 'flex flex-col px-3.5 bg-card border border-line rounded-card [&>*+*]:border-t [&>*+*]:border-line';
/** one tick in a tick card: the box, a title and a line under it */
export const tickRow = 'grid grid-cols-[26px_minmax(0,1fr)] gap-3 items-center min-h-16 py-2 cursor-pointer [&>span]:flex [&>span]:flex-col [&>span]:gap-0.5 [&_b]:text-[16px] [&_b]:font-semibold [&_small]:text-[13px] [&_small]:leading-[18px] [&_small]:text-muted';
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
export const addPhoto = (busy: boolean) =>
  cx('w-[84px] h-[84px] rounded-xl border border-dashed border-control-line bg-transparent text-brand text-[13px] font-[650] flex flex-col items-center justify-center gap-1 p-1 text-center cursor-pointer [font-family:inherit] [line-height:1.2]',
    busy ? 'opacity-50 pointer-events-none' : '');
/** the head of a sheet: its title (18px) and the close cross */
export const sheetHead = 'flex justify-between items-center [&>h2]:m-0 [&>h2]:text-[18px] [&>h2]:font-bold';
/** the photo viewer and the camera dialog (the dialog's own box is the base dialog style) */
export const viewer = 'max-w-[96vw] [&_img]:block [&_img]:w-full [&_img]:max-h-[70vh] [&_img]:object-contain [&_img]:rounded-[10px] [&_img]:bg-[#000] [&_img]:mb-2.5';
export const camera = '[&_video]:block [&_video]:w-full [&_video]:max-h-[70vh] [&_video]:object-contain [&_video]:rounded-[10px] [&_video]:bg-[#000]';
export const histRow = 'px-3 py-2.5 [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-0.5';
export const pasteBox =
  'mt-0 mx-0 mb-3.5 px-3.5 py-3 border border-line rounded-[14px] bg-card [&>summary]:min-h-7 [&>summary]:cursor-pointer [&>summary]:font-semibold [&>summary]:text-accent ' +
  '[&_textarea]:w-full [&_textarea]:box-border [&_textarea]:mt-1';
/** the big amount field of Add expense */
export const amount =
  'flex items-center gap-1.5 min-h-[72px] border-[1.5px] border-field-line rounded-card px-4 py-0 bg-card focus-within:border-accent focus-within:[box-shadow:0_0_0_3px_var(--amount-ring)] ' +
  '[&_span]:text-[30px] [&_span]:font-semibold [&_span]:text-muted [&_input]:flex-1 [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:text-[40px] [&_input]:leading-[44px] [&_input]:font-extrabold [&_input]:min-h-[60px] [&_input]:p-0 ' +
  '[&_input:focus-visible]:outline-none [&_input:focus-visible]:[box-shadow:none]';
/** the amount field of an edit sheet: 64px, 36px figures */
export const amountSm =
  'flex items-center gap-1.5 min-h-16 border border-field-line rounded-card px-4 py-0 bg-card focus-within:border-accent focus-within:[box-shadow:0_0_0_3px_var(--amount-ring)] ' +
  '[&_span]:text-[26px] [&_span]:text-muted [&_input]:flex-1 [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:text-[36px] [&_input]:font-extrabold [&_input]:min-h-[56px] [&_input]:p-0 ' +
  '[&_input:focus-visible]:outline-none [&_input:focus-visible]:[box-shadow:none]';
export const payFilters = 'mb-3 [&_p]:m-0';
/** a search field with its magnifier inside (the design's All payments) */
export const search =
  'flex items-center gap-2 min-h-12 px-3 border border-field-line rounded-field bg-card text-muted focus-within:border-accent focus-within:[box-shadow:0_0_0_3px_var(--amount-ring)] ' +
  '[&>input]:flex-1 [&>input]:min-w-0 [&>input]:min-h-0 [&>input]:border-0 [&>input]:p-0 [&>input]:bg-transparent [&>input]:text-ink [&>input:focus-visible]:outline-none [&>input:focus-visible]:[box-shadow:none]';
/** a filter as a pill with a small arrow (a select); filled with the brand colour once something is chosen */
export const pillSelect = (on: boolean) =>
  cx('w-auto [field-sizing:content] min-h-10 h-10 rounded-full pl-3.5 pr-8 py-0 text-[14px] font-semibold bg-[length:16px_16px] bg-[position:right_10px_center]',
    on ? 'bg-brand text-brand-ink border-brand [background-image:var(--chevron-on)]' : 'bg-card text-ink border-control-line');
export const paySelects = 'grid grid-cols-2 gap-2 my-2 mx-0 sm:grid-cols-4 [&_select]:pl-2';

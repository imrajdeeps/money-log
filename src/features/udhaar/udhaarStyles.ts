// The buttons and cards of the Udhaar page, as on the design. Each is a complete class string.
const ACTION = 'min-h-10 px-3 rounded-[10px] text-[14px] font-[650] [font-family:inherit] cursor-pointer inline-flex items-center justify-center no-underline disabled:opacity-50 disabled:cursor-not-allowed ';
/** an entry's buttons: Settled (lime), the others outlined, Delete in red words only */
export const action = (kind: 'primary' | 'plain' | 'bad' = 'plain') =>
  ACTION + {
    primary: 'border-0 bg-primary text-primary-ink enabled:active:bg-primary-press',
    plain: 'border border-control-line bg-transparent text-brand enabled:active:bg-press',
    bad: 'border-0 bg-transparent text-bad enabled:active:bg-bad-bg',
  }[kind];
export const card = 'bg-card border border-line rounded-card p-4 flex flex-col gap-3';
export const title = 'm-0 text-[16px] leading-[22px] font-[650] text-ink';
/** the small tag under an entry: shared and accepted (green), waiting (amber), private (grey) */
export const tag = (tone: 'good' | 'wait' | 'plain') =>
  'self-start px-2 py-[3px] rounded-md text-[12px] font-semibold ' + { good: 'bg-good-bg text-good', wait: 'bg-warn-bg text-warn', plain: 'bg-press text-ink' }[tone];
/** the round pictures' colours, in turn */
export const AVATAR = ['bg-good-bg text-good', 'bg-warn-bg text-warn', 'bg-tint-blue text-tint-blue-ink', 'bg-press text-ink', 'bg-[#104A30] text-[#C9E96A]'];

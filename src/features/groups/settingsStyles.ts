// The cards of a group's settings page, as on the design: white cards with a 16px title and a muted line under it.
export const section = 'bg-card border border-line rounded-card p-4 flex flex-col gap-2.5';
export const title = 'm-0 text-[16px] leading-[22px] font-[650] text-ink';
export const note = 'm-0 text-[14px] leading-5 text-muted';
export const small = 'm-0 text-[13px] leading-[18px] text-muted';
/** an outline button 44 tall (Copy link, Copy code) */
export const outline44 = 'min-h-11 px-4 text-[15px]';
/** an outline button 40 tall on a person's line (Make admin, Remove): red for removing; one that cannot be used yet is faded, never filled */
export const personBtn = (bad?: 'bad') =>
  'min-h-10 px-3 rounded-[10px] border bg-transparent text-[14px] font-[650] [font-family:inherit] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ' +
  (bad ? 'border-bad text-bad enabled:active:bg-bad-bg' : 'border-control-line text-brand enabled:active:bg-press');

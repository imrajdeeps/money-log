import type { ReactNode } from 'react';
import { fmtINR } from '../../core/logic.ts';
import * as us from './udhaarStyles.ts';
import { tr } from '../../core/i18n.ts';

// One open entry as a card: who, which way and when, the amount and what it means for you, a tag, and its buttons.
export function EntryCard({ who, sub, amount, lent, tag, children }: Readonly<{
  who: string; sub: string; amount: number; lent: boolean; tag: { text: string; tone: 'good' | 'wait' | 'plain' }; children: ReactNode;
}>) {
  const fg = lent ? 'text-good' : 'text-bad';
  return (
    <li className="bg-card border border-line rounded-card px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex justify-between items-start gap-3">
        <span className="flex flex-col gap-0.5 min-w-0"><span className="text-[16px] font-[650] [overflow-wrap:anywhere]">{who}</span><span className="text-[13px] text-muted">{sub}</span></span>
        <span className="flex flex-col items-end flex-none"><span className={`text-[18px] font-[750] tabular-nums ${fg}`}>{fmtINR(amount)}</span><span className={`text-[12px] font-semibold ${fg}`}>{lent ? tr('owes you') : tr('you owe')}</span></span>
      </div>
      <span className={us.tag(tag.tone)}>{tag.text}</span>
      <div className="flex flex-wrap gap-2 empty:hidden">{children}</div>
    </li>
  );
}

// A settled entry, in a line under "Settled": who, which way and how much, and when; with Open again.
export function SettledLine({ text, onOpen }: Readonly<{ text: string; onOpen?: () => void }>) {
  return (
    <li className="min-h-9 flex items-center justify-between gap-3 text-[14px] text-muted">
      <span>{text}</span>
      {onOpen && <button type="button" className="min-h-9 px-2 border-0 bg-transparent text-brand text-[13px] font-semibold cursor-pointer [font-family:inherit]" onClick={onOpen}>{tr('Open again')}</button>}
    </li>
  );
}

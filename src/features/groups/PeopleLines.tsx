import { useSharedUdhaar } from '../udhaar/index.ts';
import { personLines } from '../../core/sharedUdhaar.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// "With people, outside groups" (version 2.0): one line per Circle person you have an open shared udhaar entry with, and its net.
// Group balances are not touched: these entries belong to the two people only. Nothing is drawn when there is nothing open.
export function PeopleLines({ onOpen }: Readonly<{ onOpen: () => void }>) {
  const { shared } = useSharedUdhaar();
  const lines = personLines(shared);
  if (lines.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('With people, outside groups')}</h3>
      <ul className="list-none m-0 px-4 bg-card border border-line rounded-card">
        {lines.map((p, i) => (
          <li key={p.whoId}>
            <button type="button" className={ui.cx('w-full grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center min-h-[66px] border-0 bg-transparent p-0 text-left text-ink cursor-pointer [font-family:inherit]', i > 0 && 'border-t border-line')} onClick={onOpen}>
              <span className={ui.cx('w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold', i % 2 ? 'bg-tint-blue text-tint-blue-ink' : 'bg-press text-ink')} aria-hidden="true">{p.who.slice(0, 2).toUpperCase()}</span>
              <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold">{tr('Between you and {0}', p.who)}</span><span className="text-[13px] text-muted">{p.waiting ? tr('Udhaar · waiting for {0} to accept', p.who) : tr('Udhaar')}</span></span>
              <span className={ui.cx('text-[15px] font-bold text-right tabular-nums', p.net > 0 ? 'text-good' : 'text-bad')}>{p.net > 0 ? tr('owes you {0}', fmtINR(p.net)) : tr('you owe {0}', fmtINR(-p.net))}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[13px] leading-[18px] text-muted">{tr('Shared udhaar entries with people in your Circle. Private entries stay only in Udhaar.')}</p>
    </section>
  );
}

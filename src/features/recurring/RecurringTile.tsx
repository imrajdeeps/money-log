import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { BentoCard } from '../../ui/Bento.tsx';
import { shortDate, monthLabel } from '../../core/format.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { activeRecurring, recurringThisMonth } from '../../core/recurring.ts';
import * as ui from '../../ui/styles.ts';
import * as hs from '../../ui/tileStyles.ts';
import { tr } from '../../core/i18n.ts';

const SHOWN = 4;

// The Overview's one-tap list: what repeats every month and has not been logged yet this month. Shown only when something
// is set up; the rest of the time the Overview stays as it was.
export function RecurringTile() {
  const app = useApp();
  const today = isoDate();
  const todo = useMemo(() => recurringThisMonth(app.recurring, today), [app.recurring, today]);
  const any = useMemo(() => activeRecurring(app.recurring).length > 0, [app.recurring]);
  if (!any) return null;
  const rows = [...todo.filter((t) => t.state === 'due'), ...todo.filter((t) => t.state === 'upcoming')].slice(0, SHOWN);

  async function act(id: string, how: 'log' | 'skip', label: string) {
    try {
      await app.logRecurring(id, how);
      app.toast(how === 'log' ? tr('Logged {0}', label) : tr('Skipped {0} this month', label));
    } catch {
      app.toast(tr('Could not log it. Try again.'));
    }
  }

  const left = todo.length;
  return (
    <BentoCard title={tr('Recurring payments')} span={4} pad="list" gap={0} action={<span className="text-[13px] text-muted">{left === 0 ? tr('All logged') : tr('{0} due this month', left)}</span>}>
      <div className="pb-1.5" />
      {rows.length === 0 ? (
        <p className="m-0 py-3 border-t border-line text-[13px] text-muted">{tr('All recurring payments are logged for {0}.', monthLabel(today.slice(0, 7)))}</p>
      ) : (
        <ul className={hs.rows}>
          {rows.map(({ item, date }) => (
            <li key={item.id}>
              <span className="flex flex-col min-w-0">
                <span className={hs.rowTitle}>{item.n || item.c}</span>
                <span className="text-[13px] text-muted truncate">{[fmtINR(item.a), tr('due {0}', shortDate(date)), item.n ? item.c : ''].filter(Boolean).join(' · ')}</span>
              </span>
              <button type="button" className={ui.btn('solid', 'small', 'px-4')} onClick={() => act(item.id, 'log', `${item.n || item.c} ${fmtINR(item.a)}`)} aria-label={tr('Log {0} {1}', item.n || item.c, fmtINR(item.a))}>{tr('Log')}</button>
            </li>
          ))}
        </ul>
      )}
      {todo.length > SHOWN && <p className={hs.note}>{tr('+{0} more this month', todo.length - SHOWN)}</p>}
    </BentoCard>
  );
}

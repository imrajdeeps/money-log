import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { BentoCard } from '../../ui/Bento.tsx';
import { describeRecurring } from './RecurringCard.tsx';
import { shortDate, monthLabel } from '../../core/format.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { activeRecurring, recurringThisMonth } from '../../core/recurring.ts';
import * as ui from '../../ui/styles.ts';
import * as hs from '../../ui/tileStyles.ts';
import { tr } from '../../core/i18n.ts';

const SHOWN = 4;

// The Overview's one-tap list: what repeats every month and has not been logged yet this month. Shown only when something
// is set up; the rest of the time the Overview stays as it was.
export function RecurringTile({ onManage }: Readonly<{ onManage: () => void }>) {
  const app = useApp();
  const today = isoDate();
  const todo = useMemo(() => recurringThisMonth(app.recurring, today), [app.recurring, today]);
  const any = useMemo(() => activeRecurring(app.recurring).length > 0, [app.recurring]);
  if (!any) return null;
  const due = todo.filter((t) => t.state === 'due');
  const rows = [...due, ...todo.filter((t) => t.state === 'upcoming')].slice(0, SHOWN);

  async function act(id: string, how: 'log' | 'skip', label: string) {
    try {
      await app.logRecurring(id, how);
      app.toast(how === 'log' ? tr('Logged {0}', label) : tr('Skipped {0} this month', label));
    } catch {
      app.toast(tr('Could not log it. Try again.'));
    }
  }

  return (
    <BentoCard title={tr('Recurring')} span={12} action={<button type="button" className={hs.seeAll} onClick={onManage}>{tr('Manage')}</button>}>
      {rows.length === 0 ? (
        <p className={hs.note}>{tr('All recurring payments are logged for {0}.', monthLabel(today.slice(0, 7)))}</p>
      ) : (
        <>
          <p className={hs.statNum()}>{due.length === 0 ? tr('Nothing due yet') : tr('{0} to log', due.length)}</p>
          <ul className={hs.mini}>
            {rows.map(({ item, date, state }) => (
              <li key={item.id}>
                <span className={ui.rowMain()}><b>{item.c}</b><small>{state === 'due' ? describeRecurring(item) : tr('{0} · due {1}', fmtINR(item.a), shortDate(date))}</small></span>
                {state === 'due' && (
                  <>
                    <button type="button" className={ui.btn('ghost', 'small')} onClick={() => act(item.id, 'skip', item.c)} aria-label={tr('Skip {0} this month', item.c)}>{tr('Skip')}</button>
                    <button type="button" className={ui.btn('solid', 'small')} onClick={() => act(item.id, 'log', `${item.c} ${fmtINR(item.a)}`)} aria-label={tr('Log {0} {1}', item.c, fmtINR(item.a))}>{tr('Log')}</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {todo.length > SHOWN && <p className={hs.note}>{tr('+{0} more this month', todo.length - SHOWN)}</p>}
        </>
      )}
    </BentoCard>
  );
}

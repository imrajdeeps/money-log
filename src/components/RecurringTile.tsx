import { useMemo } from 'react';
import { useApp } from '../context.tsx';
import { BentoCard } from './Bento.tsx';
import { describeRecurring } from './RecurringCard.tsx';
import { shortDate, monthLabel } from '../format.ts';
import { fmtINR, isoDate } from '../logic.ts';
import { activeRecurring, recurringThisMonth } from '../recurring.ts';

const SHOWN = 4;

// The Overview's one-tap list: what repeats every month and has not been logged yet this month. Shown only when something
// is set up; the rest of the time the Overview stays as it was.
export function RecurringTile({ onManage }: { onManage: () => void }) {
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
      app.toast(how === 'log' ? `Logged ${label}` : `Skipped ${label} this month`);
    } catch {
      app.toast('Could not log it. Try again.');
    }
  }

  return (
    <BentoCard title="Recurring" span={12} action={<button type="button" className="seeall" onClick={onManage}>Manage</button>}>
      {rows.length === 0 ? (
        <p className="muted small">All recurring payments are logged for {monthLabel(today.slice(0, 7))}.</p>
      ) : (
        <>
          <p className="stat-num">{due.length === 0 ? 'Nothing due yet' : `${due.length} to log`}</p>
          <ul className="mini">
            {rows.map(({ item, date, state }) => (
              <li key={item.id}>
                <span className="row-main"><b>{item.c}</b><small>{state === 'due' ? describeRecurring(item) : `${fmtINR(item.a)} · due ${shortDate(date)}`}</small></span>
                {state === 'due' && (
                  <>
                    <button type="button" className="btn small ghost" onClick={() => act(item.id, 'skip', item.c)} aria-label={`Skip ${item.c} this month`}>Skip</button>
                    <button type="button" className="btn small" onClick={() => act(item.id, 'log', `${item.c} ${fmtINR(item.a)}`)} aria-label={`Log ${item.c} ${fmtINR(item.a)}`}>Log</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {todo.length > SHOWN && <p className="muted small">+{todo.length - SHOWN} more this month</p>}
        </>
      )}
    </BentoCard>
  );
}

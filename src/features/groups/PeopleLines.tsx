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
    <div>
      <h3 className={ui.blockTitle}>{tr('With people, outside groups')}</h3>
      <ul className={ui.list()}>
        {lines.map((p) => (
          <li key={p.whoId}>
            <button type="button" className={ui.row} onClick={onOpen}>
              <span className={ui.rowMain()}><b>{tr('Between you and {0}', p.who)}</b><small>{p.waiting ? tr('Udhaar · waiting for {0} to accept', p.who) : tr('Udhaar')}</small></span>
              <span className={`tabular-nums ${p.net > 0 ? ui.owed : ui.late}`}>{p.net > 0 ? tr('owes you {0}', fmtINR(p.net)) : tr('you owe {0}', fmtINR(-p.net))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { groupLookup } from '../../core/analytics.ts';
import { shortDate } from '../../core/format.ts';
import { budgetEntries, fmtINR, isoDate } from '../../core/logic.ts';
import { isRecapDay, weekRecap } from '../../core/weekRecap.ts';
import { localPref } from '../../data/localPref.ts';
import { BentoCard } from '../../ui/Bento.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The week recapped last, so a dismissed recap does not come back (this phone only).
const recapSeen = localPref<string>('money-log.recap-seen', (v) => (typeof v === 'string' ? v : ''), '');

// Monday and Tuesday: last week's spending in a few lines, against a usual week. Worked out on this phone from the payments already here.
export function WeekRecapCard() {
  const app = useApp();
  const spend = useSpendEntries();
  const seen = recapSeen.use();
  const today = isoDate();
  const recap = useMemo(
    () => (isRecapDay(today) ? weekRecap(budgetEntries(spend, app.me), groupLookup(app.categories), today) : null),
    [spend, app.me, app.categories, today],
  );
  if (!recap || seen === recap.weekOf) return null;
  const pct = recap.change === null ? null : Math.round(Math.abs(recap.change) * 100);
  return (
    <BentoCard title={tr('Last week')} span={12} action={<button type="button" className={ui.linkBtn} onClick={() => recapSeen.save(recap.weekOf)}>{tr('Dismiss')}</button>}>
      <p className="m-0 text-[28px] font-bold tabular-nums">{fmtINR(recap.total)} <small className="text-[14px] font-normal text-muted">{tr('spent, {0} to {1}', shortDate(recap.from), shortDate(recap.to))}</small></p>
      {pct !== null && (
        <p className={`m-0 text-[14px] font-semibold ${recap.change! > 0 ? 'text-bad' : 'text-good'}`}>
          {pct === 0 ? tr('The same as a usual week') : recap.change! > 0 ? tr('{0}% more than a usual week ({1})', pct, fmtINR(recap.usual)) : tr('{0}% less than a usual week ({1})', pct, fmtINR(recap.usual))}
        </p>
      )}
      <ul className="m-0 mt-2 list-none p-0 text-[14px]">
        {recap.top.map((c) => <li key={c.category} className="flex justify-between py-0.5"><span>{c.category}</span><b className="tabular-nums">{fmtINR(c.amount)}</b></li>)}
      </ul>
    </BentoCard>
  );
}

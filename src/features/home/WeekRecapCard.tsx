import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { groupLookup } from '../../core/analytics.ts';
import { shortDate } from '../../core/format.ts';
import { budgetEntries, fmtINR, isoDate } from '../../core/logic.ts';
import { isRecapDay, weekRecap } from '../../core/weekRecap.ts';
import type { WeekRecap } from '../../core/weekRecap.ts';
import { localPref } from '../../data/localPref.ts';
import { BentoCard } from '../../ui/Bento.tsx';
import * as hs from '../../ui/tileStyles.ts';
import { tr } from '../../core/i18n.ts';

// The week recapped last, so a dismissed recap does not come back (this phone only).
const recapSeen = localPref<string>('money-log.recap-seen', (v) => (typeof v === 'string' ? v : ''), '');

/** Monday and Tuesday: last week's recap, or null (another day, or dismissed). The Overview asks first, so it knows whether the tile shows. */
export function useWeekRecap(): WeekRecap | null {
  const app = useApp();
  const spend = useSpendEntries();
  const seen = recapSeen.use();
  const today = isoDate();
  const recap = useMemo(
    () => (isRecapDay(today) ? weekRecap(budgetEntries(spend, app.me), groupLookup(app.categories), today) : null),
    [spend, app.me, app.categories, today],
  );
  return recap && seen !== recap.weekOf ? recap : null;
}

// Last week's spending in a few lines, against a usual week. Worked out on this device from the payments already here.
export function WeekRecapCard({ recap }: Readonly<{ recap: WeekRecap }>) {
  const diff = recap.change === null ? null : Math.round(recap.total - recap.usual);
  return (
    <BentoCard title={tr('Last week')} span={4} gap={8} action={<button type="button" className={hs.seeAll} onClick={() => recapSeen.save(recap.weekOf)}>{tr('Dismiss')}</button>}>
      <div className="flex flex-wrap items-baseline gap-2.5"><span className={hs.bigNum}>{fmtINR(recap.total)}</span><span className="text-[13px] text-muted">{tr('{0} to {1}', recap.from.slice(0, 7) === recap.to.slice(0, 7) ? String(Number(recap.from.slice(8))) : shortDate(recap.from), shortDate(recap.to))}</span></div>
      {diff !== null && (
        <span className={hs.tag(diff > 0 ? 'warn' : 'good')}>
          {diff === 0 ? tr('The same as a usual week') : diff > 0 ? tr('{0} more than a usual week', fmtINR(diff)) : tr('{0} less than a usual week', fmtINR(-diff))}
        </span>
      )}
      <ul className="m-0 list-none p-0 pt-1 flex flex-col gap-1 text-[14px]">
        {recap.top.map((c) => <li key={c.category} className="flex justify-between gap-2"><span>{c.category}</span><strong>{fmtINR(c.amount)}</strong></li>)}
      </ul>
    </BentoCard>
  );
}

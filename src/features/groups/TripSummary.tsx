import { SummaryCard } from './SummaryCard.tsx';
import type { Group } from '../../core/groups.ts';
import { tripLength } from '../../core/groupSummary.ts';
import { fmtINR } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';

// A trip at a glance, over its whole life; with dates it also says how many days and what that is a day.
export function TripSummary({ group }: Readonly<{ group: Group }>) {
  const days = tripLength(group.starts_on, group.ends_on);
  return (
    <SummaryCard
      group={group}
      title={tr('Trip summary')}
      byDay
      empty={tr('Nothing has been spent yet. The summary appears with the first shared expense.')}
      extra={days ? (total) => tr(' over {0} day{1} · {2} a day', days, days === 1 ? '' : 's', fmtINR(Math.round(total / days))) : undefined}
    />
  );
}

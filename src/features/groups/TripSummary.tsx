import { SummaryCard } from './SummaryCard.tsx';
import type { Group } from '../../core/groups.ts';
import { tripLength } from '../../core/groupSummary.ts';
import { fmtINR } from '../../core/logic.ts';

// A trip at a glance, over its whole life; with dates it also says how many days and what that is a day.
export function TripSummary({ group }: { group: Group }) {
  const days = tripLength(group.starts_on, group.ends_on);
  return (
    <SummaryCard
      group={group}
      title="Trip summary"
      byDay
      empty="Nothing has been spent yet. The summary appears with the first shared expense."
      extra={days ? (total) => ` over ${days} ${days === 1 ? 'day' : 'days'} · ${fmtINR(Math.round(total / days))} a day` : undefined}
    />
  );
}

import { SummaryCard } from './SummaryCard.tsx';
import type { Group } from '../../core/groups.ts';
import { monthLabel } from '../../core/format.ts';
import { isoDate, monthOf } from '../../core/logic.ts';

// A family's "This month": what the group spent this calendar month.
export function FamilyMonth({ group }: { group: Group }) {
  const month = monthOf(isoDate());
  return <SummaryCard group={group} title={`This month · ${monthLabel(month)}`} month={month} byDay={false} empty="Nothing has been shared this month yet." />;
}

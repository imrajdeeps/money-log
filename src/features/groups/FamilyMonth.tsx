import { SummaryCard } from './SummaryCard.tsx';
import type { Group } from '../../core/groups.ts';
import { monthLabel } from '../../core/format.ts';
import { isoDate, monthOf } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';

// A family's "This month": what the group spent this calendar month.
export function FamilyMonth({ group }: Readonly<{ group: Group }>) {
  const month = monthOf(isoDate());
  return <SummaryCard group={group} title={tr('This month · {0}', monthLabel(month))} month={month} byDay={false} empty={tr('Nothing has been shared this month yet.')} />;
}

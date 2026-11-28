import { ordinal } from '../../core/format.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

/** The group a repeating shared expense goes to, as the tick describes it (2.2). */
export interface RepeatGroup { name: string; payer: string; people: number } // payer: "you" or the payer's name; people: how many are in the split

function hintFor(day: number, group: RepeatGroup | null): string {
  if (!group) return tr('It comes up on the {0} each month, to log with one tap.', ordinal(day));
  return group.people === 2
    ? tr('It comes up in {0} on the {1} each month, paid by {2} and split the same way. Either of you can log it with one tap.', group.name, ordinal(day), group.payer)
    : tr('It comes up in {0} on the {1} each month, paid by {2} and split the same way. Anyone in it can log it with one tap.', group.name, ordinal(day), group.payer);
}

// "Repeat every month" in Add expense: a private payment that comes up to log, or (2.2) a shared expense that comes up in its group.
export function RepeatTick({ checked, onChange, date, group }: Readonly<{ checked: boolean; onChange: (on: boolean) => void; date: string; group: RepeatGroup | null }>) {
  return (
    <label className={ui.tickRow}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><b>{tr('Repeat every month')}</b><small>{hintFor(Number(date.slice(8, 10)), group)}</small></span>
    </label>
  );
}

/** Under Save, when a shared expense is set to repeat: what saving does, named by its note (as typed) or its category. */
export function repeatSaveNote(note: string, category: string, date: string, today: string): string {
  const name = note || category.toLocaleLowerCase() || tr('expense');
  return date.slice(0, 7) === today.slice(0, 7)
    ? tr("Saving adds this month's {0} now, and sets it up for next month.", name)
    : tr('Saving adds this expense now, and sets it up for the months after.');
}

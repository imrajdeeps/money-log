import { CategorySelect } from '../../ui/CategorySelect.tsx';
import { IncomeCategorySelect } from '../../ui/IncomeCategorySelect.tsx';
import type { EntryKind } from '../../core/logic.ts';

// The category picker for whichever kind is chosen: spending categories for Spent, income categories for Received.
export function KindCategory({ kind, id, value, onChange }: Readonly<{ kind: EntryKind; id: string; value: string; onChange: (v: string) => void }>) {
  return kind === 'in'
    ? <IncomeCategorySelect id={id} value={value} onChange={onChange} />
    : <CategorySelect id={id} value={value} onChange={onChange} />;
}

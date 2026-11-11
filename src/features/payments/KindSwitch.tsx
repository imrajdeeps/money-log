import type { EntryKind } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Spent or Received: the first thing on the Add page and the Edit dialog. Income is private to its owner and has its own categories.
// onChange is called only when the other one is picked.
export function KindSwitch({ value, onChange }: Readonly<{ value: EntryKind; onChange: (k: EntryKind) => void }>) {
  const pick = (k: EntryKind) => { if (k !== value) onChange(k); };
  return (
    <div className={ui.chips} role="group" aria-label={tr('Money going out or coming in')}>
      <button type="button" className={ui.chip} aria-pressed={value === 'out'} onClick={() => pick('out')}>{tr('Spent')}</button>
      <button type="button" className={ui.chip} aria-pressed={value === 'in'} onClick={() => pick('in')}>{tr('Received')}</button>
    </div>
  );
}

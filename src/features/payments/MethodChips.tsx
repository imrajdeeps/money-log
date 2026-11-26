import type { Method } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

interface Props {
  value: Method | null;
  onChange: (m: Method | null) => void;
  options: readonly Method[];
  bare?: boolean; // no margin: the form spaces its parts with a gap
}

// Tap a method to choose it, tap it again to clear it.
export function MethodChips({ value, onChange, options, bare = false }: Props) {
  return (
    <fieldset className={bare ? ui.chipsBare : ui.chips}>
      <legend>{tr('Method')}</legend>
      {options.map((m) => (
        <button key={m} type="button" className={ui.chip} aria-pressed={value === m} onClick={() => onChange(value === m ? null : m)}>
          {m}
        </button>
      ))}
    </fieldset>
  );
}

import type { Method } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

interface Props {
  value: Method | null;
  onChange: (m: Method | null) => void;
  options: readonly Method[];
}

// Tap a method to choose it, tap it again to clear it.
export function MethodChips({ value, onChange, options }: Props) {
  return (
    <fieldset className={ui.chips}>
      <legend>Payment method</legend>
      {options.map((m) => (
        <button key={m} type="button" className={ui.chip} aria-pressed={value === m} onClick={() => onChange(value === m ? null : m)}>
          {m}
        </button>
      ))}
    </fieldset>
  );
}

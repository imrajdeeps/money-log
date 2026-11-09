import type { Method } from '../logic.ts';

interface Props {
  value: Method | null;
  onChange: (m: Method | null) => void;
  options: readonly Method[];
}

// Tap a method to choose it, tap it again to clear it.
export function MethodChips({ value, onChange, options }: Props) {
  return (
    <fieldset className="chips">
      <legend>Paid by</legend>
      {options.map((m) => (
        <button key={m} type="button" className="chip" aria-pressed={value === m} onClick={() => onChange(value === m ? null : m)}>
          {m}
        </button>
      ))}
    </fieldset>
  );
}

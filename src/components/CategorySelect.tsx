import { GROUPS } from '../logic.ts';
import type { Plan } from '../logic.ts';

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  plan: Plan | null;
}

// Categories come from the imported plan, grouped as in the spreadsheet (Spending, EMI, Family, Saving).
export function CategorySelect({ id, value, onChange, plan }: Props) {
  const rows = plan?.rows ?? [];
  const known = rows.some((r) => r.c === value);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={!rows.length && !value}>
      <option value="" disabled>Choose category…</option>
      {value && !known && <option value={value}>{value} (not in plan)</option>}
      {GROUPS.map((g) => {
        const items = rows.filter((r) => r.g === g);
        return items.length ? (
          <optgroup key={g} label={g}>
            {items.map((r) => <option key={r.c} value={r.c}>{r.c}</option>)}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

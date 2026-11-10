import { computeShares, equalShares, fromPaise, sharesPaise, toPaise, usualSplitValues } from '../../core/groups.ts';
import type { Member, SplitMode, UsualSplit } from '../../core/groups.ts';
import { fmtINR } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

// Everything the person has chosen about who paid and how the expense is divided.
export interface SplitState { paidBy: string; mode: SplitMode; included: string[]; values: Record<string, string> }

// A new expense in a group: you paid and everyone shares equally, or (flatmates) the group's usual percentages.
export function freshSplit(me: string, people: Member[], usual: UsualSplit | null = null): SplitState {
  const ids = people.map((m) => m.user_id);
  const values = usualSplitValues(usual, ids);
  return values ? { paidBy: me, mode: 'percent', included: ids, values } : { paidBy: me, mode: 'equal', included: ids, values: {} };
}

// Starts the editor from an existing expense: an even split shows as Equal, anything else as exact amounts.
export function splitFromEntry(e: Entry, people: Member[]): SplitState {
  const shares = e.shares ?? {};
  const ids = Object.keys(shares);
  const even = sharesPaise(equalShares(e.amount, ids)) === toPaise(e.amount) && ids.every((id) => shares[id] === equalShares(e.amount, ids)[id]);
  const values: Record<string, string> = {};
  for (const m of people) values[m.user_id] = shares[m.user_id] !== undefined ? String(shares[m.user_id]) : '';
  return { paidBy: e.paid_by ?? '', mode: even ? 'equal' : 'exact', included: ids.filter((id) => people.some((m) => m.user_id === id)), values };
}

const MODES: { id: SplitMode; label: string }[] = [{ id: 'equal', label: 'Equal' }, { id: 'exact', label: 'Amounts' }, { id: 'percent', label: 'Percent' }];

interface Props {
  people: Member[]; // the group's current members
  me: string;
  total: number; // the amount typed above, 0 when empty
  value: SplitState;
  onChange: (next: SplitState) => void;
}

export function SplitEditor({ people, me, total, value, onChange }: Props) {
  const ids = people.map((m) => m.user_id);
  const result = computeShares(value.mode, total, ids, new Set(value.included), value.values);
  const set = (patch: Partial<SplitState>) => onChange({ ...value, ...patch });
  const name = (m: Member) => (m.user_id === me ? `${m.display_name} (you)` : m.display_name);

  return (
    <div className={ui.split}>
      <label className={ui.field}>
        <span>Who paid</span>
        <select value={value.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
          {people.map((m) => <option key={m.user_id} value={m.user_id}>{name(m)}</option>)}
        </select>
      </label>

      <fieldset className={ui.chips}>
        <legend>Split</legend>
        {MODES.map((m) => (
          <button key={m.id} type="button" className={ui.chip} aria-pressed={value.mode === m.id} onClick={() => set({ mode: m.id })}>{m.label}</button>
        ))}
      </fieldset>

      <ul className={ui.list(false, 'mt-2 mx-0 mb-0')}>
        {people.map((m) => {
          const share = result.shares?.[m.user_id];
          return (
            <li key={m.user_id} className={ui.splitRow}>
              {value.mode === 'equal' ? (
                <label className={ui.check + ' flex-1'}>
                  <input
                    type="checkbox"
                    checked={value.included.includes(m.user_id)}
                    onChange={(e) => set({ included: e.target.checked ? [...value.included, m.user_id] : value.included.filter((x) => x !== m.user_id) })}
                  />
                  <span>{name(m)}</span>
                </label>
              ) : (
                <>
                  <span className="flex-1">{name(m)}</span>
                  <input
                    className="w-24 text-right"
                    inputMode="decimal"
                    aria-label={`${value.mode === 'percent' ? 'Percent' : 'Amount'} for ${m.display_name}`}
                    placeholder={value.mode === 'percent' ? '%' : '₹'}
                    value={value.values[m.user_id] ?? ''}
                    onChange={(e) => set({ values: { ...value.values, [m.user_id]: e.target.value } })}
                  />
                </>
              )}
              <span className="font-bold tabular-nums min-w-[72px] text-right">{share !== undefined ? fmtINR(share) : '–'}</span>
            </li>
          );
        })}
      </ul>
      {total > 0 && result.problem && <p className={ui.msg('bad')} role="status">{result.problem}</p>}
      {total > 0 && result.shares && <p className="text-muted text-[13px]">Adds up to {fmtINR(fromPaise(sharesPaise(result.shares)))}.</p>}
    </div>
  );
}

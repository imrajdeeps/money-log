import { computeShares, equalShares, fromPaise, sharesPaise, toPaise, usualSplitValues } from '../../core/groups.ts';
import type { Member, SplitMode, UsualSplit } from '../../core/groups.ts';
import { fmtINR } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import type { ReactNode } from 'react';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

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

const MODES: { id: SplitMode; label: string }[] = [{ id: 'equal', label: 'Equal' }, { id: 'percent', label: 'Percent' }, { id: 'exact', label: 'Amount' }];

interface Props {
  people: Member[]; // the group's current members
  me: string;
  total: number; // the amount typed above, 0 when empty
  value: SplitState;
  onChange: (next: SplitState) => void;
  beside?: ReactNode; // a field shown beside Who paid (Add expense: the group)
}

// One person in the split, as on the design: a tick (equal split) or a box for their percent or amount, and what their share comes to.
function SplitRow({ m, label, value, share, set }: Readonly<{ m: Member; label: string; value: SplitState; share: number | undefined; set: (patch: Partial<SplitState>) => void }>) {
  const inShare = value.included.includes(m.user_id);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[52px] border-b border-line">
      {value.mode === 'equal' ? (
        <label className="flex items-center gap-2.5 min-h-11 cursor-pointer">
          <input
            type="checkbox"
            checked={inShare}
            onChange={(e) => set({ included: e.target.checked ? [...value.included, m.user_id] : value.included.filter((x) => x !== m.user_id) })}
          />
          <span className="text-[16px] font-semibold">{label}</span>
        </label>
      ) : <span className="text-[16px] font-semibold">{label}</span>}
      {value.mode === 'equal'
        ? <span className={ui.cx('text-[16px] font-bold tabular-nums', inShare ? 'text-ink' : 'text-muted')}>{share !== undefined ? fmtINR(share) : '–'}</span>
        : (
          <span className="flex items-center gap-2.5">
            <input
              className="w-[72px] min-h-11 rounded-[10px] px-2.5 text-right tabular-nums"
              inputMode="decimal"
              aria-label={tr('{0} for {1}', value.mode === 'percent' ? tr('Percent') : tr('Amount'), m.display_name)}
              placeholder={value.mode === 'percent' ? '%' : '₹'}
              value={value.values[m.user_id] ?? ''}
              onChange={(e) => set({ values: { ...value.values, [m.user_id]: e.target.value } })}
            />
            <span className="min-w-[52px] text-right text-[14px] text-muted tabular-nums">{share !== undefined ? fmtINR(share) : '–'}</span>
          </span>
        )}
    </li>
  );
}

export function SplitEditor({ people, me, total, value, onChange, beside }: Props) {
  const ids = people.map((m) => m.user_id);
  const result = computeShares(value.mode, total, ids, new Set(value.included), value.values);
  const set = (patch: Partial<SplitState>) => onChange({ ...value, ...patch });
  const name = (m: Member) => (m.user_id === me ? tr('You') : m.display_name);
  const paid = (
    <label className={ui.fieldBare}>
      <span>{tr('Who paid')}</span>
      <select value={value.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
        {people.map((m) => <option key={m.user_id} value={m.user_id}>{name(m)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-3.5">
      {beside ? <div className="grid grid-cols-2 gap-2.5">{beside}{paid}</div> : paid}
      <div className={ui.segment(3)} role="radiogroup" aria-label={tr('Split')}>
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" className={ui.segBtnSm} aria-checked={value.mode === m.id} onClick={() => set({ mode: m.id })}>{tr(m.label)}</button>
        ))}
      </div>
      <ul className="list-none m-0 p-0 flex flex-col">
        {[...people].sort((a, b) => Number(b.user_id === me) - Number(a.user_id === me)).map((m) => <SplitRow key={m.user_id} m={m} label={name(m)} value={value} share={result.shares?.[m.user_id]} set={set} />)}
      </ul>
      {total > 0 && result.problem && <p className="m-0 text-[14px] font-[650] text-bad" role="status">{result.problem}</p>}
      {total > 0 && result.shares && <p className="m-0 text-[14px] font-[650] text-good tabular-nums" role="status">{tr('Adds up to {0}.', fmtINR(fromPaise(sharesPaise(result.shares))))}</p>}
    </div>
  );
}

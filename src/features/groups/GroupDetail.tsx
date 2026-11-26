import { Icon } from '../../ui/Icon.tsx';
import { ask } from '../../ui/confirm.tsx';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { EditDialog, ExpenseDialog } from '../payments/index.ts';
import { shortDate } from '../../core/format.ts';
import { activeMembers, fromPaise, groupBalances, ledger, memberName, simplifyDebts } from '../../core/groups.ts';
import type { Group, Member, Settlement } from '../../core/groups.ts';
import { coupleLine } from '../../core/couple.ts';
import { expenseEffect } from '../../core/groupHistory.ts';
import { kindLabel } from '../../core/groupKinds.ts';
import { fmtINR, isValidDate, isoDate, parseAmount } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import { ActivityBanner } from './ActivityBanner.tsx';
import { DebtRow } from './DebtRow.tsx';
import { TripSummary } from './TripSummary.tsx';
import { FamilyMonth } from './FamilyMonth.tsx';
import { tripDatesLabel } from '../../core/groupSummary.ts';
import { personLetters } from '../../core/profile.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const owes = (paise: number): string => (paise === 0 ? tr('All settled') : paise > 0 ? tr('is owed {0}', fmtINR(fromPaise(paise))) : tr('owes {0}', fmtINR(fromPaise(-paise))));

type LedgerItem = { kind: 'expense'; date: string; at: string; e: Entry } | { kind: 'settle'; date: string; at: string; s: Settlement };

// Who stands where in one group: a line for each person with their initials, or for a couple the one sentence between the two of you.
function BalancesCard({ people, former, bal, me, nameOf, partnerLine }: Readonly<{
  group: Group; people: Member[]; former: Member[]; bal: Record<string, number>; me: string; nameOf: (uid: string) => string; partnerLine: ReturnType<typeof coupleLine> | null;
}>) {
  if (partnerLine) {
    return <p className={ui.cx('m-0 bg-card border border-line rounded-card px-4 py-3.5 text-[16px] font-bold', partnerLine.tone === 'owed' ? 'text-good' : partnerLine.tone === 'late' ? 'text-bad' : 'text-muted')}>{partnerLine.text}</p>;
  }
  const tints = ['bg-good-bg text-good', 'bg-warn-bg text-warn', 'bg-tint-blue text-tint-blue-ink', 'bg-press text-ink'];
  const rows = [...people.map((m) => ({ id: m.user_id, label: nameOf(m.user_id), name: m.display_name })), ...former.filter((m) => (bal[m.user_id] ?? 0) !== 0).map((m) => ({ id: m.user_id, label: tr('{0} (left)', m.display_name), name: m.display_name }))]
    .sort((a, b) => Number(a.id === me) - Number(b.id === me));
  const mine = (b: number) => (b === 0 ? tr('Settled') : b > 0 ? tr('You are owed {0}', fmtINR(fromPaise(b))) : tr('You owe {0}', fmtINR(fromPaise(-b))));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Balances')}</h3>
      <ul className="list-none m-0 px-4 bg-card border border-line rounded-card">
        {rows.map((p, i) => {
          const b = bal[p.id] ?? 0;
          return (
            <li key={p.id} className={ui.cx('grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center min-h-[62px]', i > 0 && 'border-t border-line')}>
              <span className={ui.cx('w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold', p.id === me ? 'bg-[#104A30] text-[#C9E96A]' : tints[i % tints.length])} aria-hidden="true">{personLetters(p.name)}</span>
              <span className="text-[16px] font-semibold truncate">{p.label}</span>
              <span className={ui.cx('text-[15px] font-bold tabular-nums text-right', b > 0 ? 'text-good' : b < 0 ? 'text-bad' : 'text-muted')}>{p.id === me ? mine(b) : owes(b)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}


// One line of the group's history, as on the design: the day, what it was and who paid, and on the right what it means for you.
function LedgerRow({ it, first, me, people, nameOf, onOpen }: Readonly<{ it: LedgerItem; first: boolean; me: string; people: { user_id: string }[]; nameOf: (uid: string) => string; onOpen: (e: Entry) => void }>) {
  const app = useApp();
  const ROW = ui.cx('w-full grid grid-cols-[52px_minmax(0,1fr)_auto] gap-2.5 items-center min-h-[66px] py-2 px-0 border-0 bg-transparent text-ink text-left [font-family:inherit] [line-height:inherit]', first ? '' : 'border-t border-line');
  const day = (d: string) => <span className="text-[12px] leading-[15px] font-semibold text-muted uppercase tracking-[0.04em]">{shortDate(d)}</span>;
  if (it.kind === 'settle') {
    const s = it.s;
    const canRemove = s.created_by === me && [s.from_user, s.to_user].every((u) => people.some((m) => m.user_id === u));
    return (
      <li className={ROW}>
        {day(s.settle_date)}
        <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold truncate">{tr('{0} paid {1}', nameOf(s.from_user), nameOf(s.to_user))}</span><span className="text-[13px] text-muted">{tr('payment recorded')}</span></span>
        <span className="flex items-center gap-1">
          <span className="text-[15px] font-bold tabular-nums">{fmtINR(s.amount)}</span>
          {canRemove && <button type="button" className="w-9 h-9 border-0 bg-transparent text-muted flex items-center justify-center cursor-pointer" aria-label={tr('Remove this payment')} onClick={() => { void ask('Remove this recorded payment? The balances change back.', tr('Remove')).then((yes) => { if (yes) void app.removeSettlement(s.id); }); }}><Icon name="close" size={16} /></button>}
        </span>
      </li>
    );
  }
  const e = it.e;
  const effect = expenseEffect(e, me); // green where you are owed, red where you owe
  return (
    <li>
      <button type="button" className={ui.cx(ROW, 'cursor-pointer')} onClick={() => onOpen(e)}>
        {day(e.entry_date)}
        <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold truncate">{e.note ? e.note.split(' · ')[0] : e.category}</span><span className="text-[13px] text-muted truncate">{tr('{0} paid {1}', nameOf(e.paid_by ?? ''), fmtINR(e.amount))}</span></span>
        <span className="flex flex-col items-end">
          <span className={ui.cx('text-[15px] font-bold tabular-nums', effect.side === 'owed' ? 'text-good' : effect.side === 'owe' ? 'text-bad' : '')}>{effect.side === 'none' ? fmtINR(e.amount) : fmtINR(effect.amount)}</span>
          {effect.side !== 'none' && <span className={ui.cx('text-[12px] font-semibold', effect.side === 'owed' ? 'text-good' : 'text-bad')}>{effect.side === 'owed' ? tr('you are owed') : tr('you owe')}</span>}
        </span>
      </button>
    </li>
  );
}

export function GroupDetail({ group, onBack, onSettings, onAdd }: Readonly<{ group: Group; onBack: () => void; onSettings: () => void; onAdd: () => void }>) {
  const app = useApp();
  const me = app.me ?? '';
  const [editing, setEditing] = useState<Entry | null>(null);
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [settle, setSettle] = useState<{ dir: 'paid' | 'received'; other: string; amount: string; date: string } | null>(null);
  const [settleError, setSettleError] = useState('');

  const people = useMemo(() => activeMembers(app.members, group.id), [app.members, group.id]);
  const former = app.members.filter((m) => m.group_id === group.id && m.left_at); // left, but may still be owed or owe
  const bal = useMemo(() => groupBalances(group.id, app.groupEntries, app.settlements), [group.id, app.groupEntries, app.settlements]);
  const debts = useMemo(() => simplifyDebts(bal), [bal]);
  const nameOf = (uid: string) => (uid === me ? tr('You') : memberName(app.members, group.id, uid));
  const partner = group.kind === 'couple' && people.length === 2 ? people.find((m) => m.user_id !== me) : undefined; // the other half of a couple
  const line = coupleLine(bal[me] ?? 0, partner?.display_name ?? '');
  const closed = group.closed_at !== null; // a closed trip: no new expenses, no new people
  const dates = group.kind === 'trip' ? tripDatesLabel(group.starts_on, group.ends_on) : null;

  const items = useMemo<LedgerItem[]>(() => [
    ...ledger(app.groupEntries, group.id).map((e): LedgerItem => ({ kind: 'expense', date: e.entry_date, at: e.created_at, e })),
    ...app.settlements.filter((s) => s.group_id === group.id && !s.deleted_at).map((s): LedgerItem => ({ kind: 'settle', date: s.settle_date, at: s.created_at, s })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.at < b.at ? 1 : -1)), [app.groupEntries, app.settlements, group.id]);

  async function record(ev: FormEvent) {
    ev.preventDefault();
    if (!settle) return;
    const amt = parseAmount(settle.amount);
    if (amt === null) return setSettleError(tr('Amount must be a positive number with at most 2 decimals.'));
    if (!settle.other) return setSettleError(tr('Pick the other person.'));
    if (!isValidDate(settle.date) || settle.date > isoDate()) return setSettleError(tr('Pick a date that is today or earlier.'));
    await app.addSettlement({
      group_id: group.id,
      from_user: settle.dir === 'paid' ? me : settle.other,
      to_user: settle.dir === 'paid' ? settle.other : me,
      amount: amt,
      settle_date: settle.date,
    });
    app.toast(tr('Recorded {0}', fmtINR(amt)));
    setSettle(null);
    setSettleError('');
  }

  const startSettle = (d: { from: string; to: string; amount: number }) =>
    setSettle({ dir: d.from === me ? 'paid' : 'received', other: d.from === me ? d.to : d.from, amount: String(d.amount), date: isoDate() });

  const memberNames = [...people].sort((a, b) => Number(b.user_id === me) - Number(a.user_id === me)).map((m) => (m.user_id === me ? tr('You') : m.display_name));

  return (
    <section aria-label={tr('Group {0}', group.name)} className="flex flex-col gap-4 -mt-2">
      <div className="flex flex-col gap-0.5">
        <button type="button" className={ui.backLink} onClick={onBack}><Icon name="back" size={20} stroke={2} />{tr('Groups')}</button>
        <div className="flex justify-between items-center gap-3">
          <h2 className="m-0 flex items-center gap-2.5 text-[24px] leading-[30px] font-bold min-w-0"><span className="truncate">{group.name}</span><span className="px-2 py-0.5 rounded-md bg-press text-[12px] font-semibold leading-normal">{kindLabel(group.kind)}</span>{closed && <span className="px-2 py-0.5 rounded-md bg-press text-[12px] font-semibold leading-normal">{tr('Closed')}</span>}</h2>
          <button type="button" className={ui.icoBtn + ' rounded-xl border-control-line text-ink'} aria-label={tr('Group settings')} onClick={onSettings}><Icon name="settings" size={22} /></button>
        </div>
        <p className="m-0 text-[14px] text-muted">{dates ? `${dates} · ` : ''}{memberNames.length <= 4 ? memberNames.join(', ').replace(/, ([^,]*)$/, ` ${tr('and')} $1`) : ''}{memberNames.length <= 4 ? ' · ' : ''}{tr('{0} people', people.length)}{closed ? ` · ${tr('closed: it takes no new expenses')}` : ''}</p>
      </div>
      {!closed && <button type="button" className={ui.btn('solid', 'none', 'min-h-[52px] text-[16px] lg:max-w-[320px]')} onClick={onAdd}><Icon name="plus" size={20} stroke={2.2} />{tr('Add a shared expense')}</button>}

      <ActivityBanner group={group} />

      <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-2 lg:gap-x-7">
      <div className="flex flex-col gap-4">
      <BalancesCard group={group} people={people} former={former} bal={bal} me={me} nameOf={nameOf} partnerLine={partner && group.kind === 'couple' ? line : null} />

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('To settle up')}</h3>
        <div className="bg-card border border-line rounded-card px-4">
          {debts.length > 0 ? (
            <ul className="list-none m-0 p-0 [&>li+li]:border-t [&>li+li]:border-line">
              {debts.map((d) => <DebtRow key={`${d.from}>${d.to}`} debt={d} group={group.name} me={me} myName={people.find((m) => m.user_id === me)?.display_name ?? ''} nameOf={nameOf} onRecord={() => startSettle(d)} />)}
            </ul>
          ) : <p className="m-0 py-3.5 text-[14px] text-muted">{tr('Nobody owes anybody anything.')}</p>}
          {!settle && !debts.some((d) => d.from === me || d.to === me) && <button type="button" className={ui.btn('outline', 'none', 'min-h-11 px-4 text-[15px] mb-3.5')} onClick={() => setSettle({ dir: 'paid', other: people.find((m) => m.user_id !== me)?.user_id ?? '', amount: '', date: isoDate() })}>{tr('Record a payment')}</button>}
          {settle && (
            <form onSubmit={record} noValidate className="flex flex-col gap-3.5 border-t border-line py-3.5">
              <h3 className="m-0 text-[16px] font-[650] text-ink">{tr('Record a payment')}</h3>
              <p className="m-0 text-muted text-[13px]">{tr('Money never moves through this app: this only notes that it happened, outside it.')}</p>
              <div className={ui.segment(2)} role="radiogroup" aria-label={tr('Who paid')}>
                <button type="button" role="radio" className={ui.segBtn} aria-checked={settle.dir === 'paid'} onClick={() => setSettle({ ...settle, dir: 'paid' })}>{tr('I paid')}</button>
                <button type="button" role="radio" className={ui.segBtn} aria-checked={settle.dir === 'received'} onClick={() => setSettle({ ...settle, dir: 'received' })}>{tr('I received')}</button>
              </div>
              <label className={ui.fieldBare}>
                <span>{settle.dir === 'paid' ? tr('Paid to') : tr('Received from')}</span>
                <select value={settle.other} onChange={(e) => setSettle({ ...settle, other: e.target.value })}>
                  {people.filter((m) => m.user_id !== me).map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <label className={ui.fieldBare}><span>{tr('Amount')}</span><input inputMode="decimal" value={settle.amount} onChange={(e) => { setSettle({ ...settle, amount: e.target.value }); setSettleError(''); }} /></label>
                <label className={ui.fieldBare}><span>{tr('Date')}</span><input type="date" value={settle.date} max={isoDate()} onChange={(e) => setSettle({ ...settle, date: e.target.value })} /></label>
              </div>
              {settleError && <p className={ui.msg('bad')} role="alert">{settleError}</p>}
              <div className="flex gap-2.5 [&>*]:flex-1">
                <button type="submit" className={ui.btn()}>{tr('Save payment')}</button>
                <button type="button" className={ui.btn('outline')} onClick={() => { setSettle(null); setSettleError(''); }}>{tr('Cancel')}</button>
              </div>
            </form>
          )}
        </div>
      </section>

      {group.kind === 'trip' && <TripSummary group={group} />}
      {group.kind === 'family' && <FamilyMonth group={group} />}

      </div>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Expenses and payments')}</h3>
        {items.length === 0 ? <p className="m-0 text-muted">{tr('Nothing yet.')}</p> : (
          <ul className="list-none m-0 px-4 bg-card border border-line rounded-card">
            {items.map((it, i) => <LedgerRow key={it.kind === 'settle' ? it.s.id : it.e.id} it={it} first={i === 0} me={me} people={people} nameOf={nameOf} onOpen={(e) => (e.owner_id === me ? setEditing(e) : setViewing(e))} />)}
          </ul>
        )}
      </section>
      </div>

      {editing && <EditDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
      {viewing && <ExpenseDialog key={viewing.id} entry={viewing} group={group} onClose={() => setViewing(null)} />}
    </section>
  );
}

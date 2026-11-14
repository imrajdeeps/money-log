import { Icon } from '../../ui/Icon.tsx';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { EditDialog, ExpenseDialog } from '../payments/index.ts';
import { shortDate } from '../../core/format.ts';
import { activeMembers, fromPaise, groupBalances, ledger, memberName, simplifyDebts } from '../../core/groups.ts';
import type { Group, Settlement } from '../../core/groups.ts';
import { coupleLine } from '../../core/couple.ts';
import { kindLabel } from '../../core/groupKinds.ts';
import { fmtINR, isValidDate, isoDate, myShare, parseAmount } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import { TripSummary } from './TripSummary.tsx';
import { FamilyMonth } from './FamilyMonth.tsx';
import { tripDatesLabel } from '../../core/groupSummary.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const owes = (paise: number): string => (paise === 0 ? tr('All settled') : paise > 0 ? tr('is owed {0}', fmtINR(fromPaise(paise))) : tr('owes {0}', fmtINR(fromPaise(-paise))));

type LedgerItem = { kind: 'expense'; date: string; at: string; e: Entry } | { kind: 'settle'; date: string; at: string; s: Settlement };

export function GroupDetail({ group, onBack, onSettings }: Readonly<{ group: Group; onBack: () => void; onSettings: () => void }>) {
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

  return (
    <section aria-label={tr('Group {0}', group.name)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" className={ui.btn('ghost', 'md', 'w-auto')} onClick={onBack}><span className="inline-flex rotate-180"><Icon name="chevron" size={18} /></span>{' '}{tr('All groups')}</button>
        <button type="button" className={ui.btn('ghost', 'md', 'w-auto')} onClick={onSettings}>{tr('Group settings')}</button>
      </div>
      <h2>{group.name} <span className={ui.tag}>{kindLabel(group.kind)}</span>{closed && <> <span className={ui.tag}>{tr('Closed')}</span></>}</h2>
      {dates && <p className="text-muted text-[13px]">{dates}</p>}
      <p className="text-muted text-[13px]">
        {people.length} {people.length === 1 ? 'person' : 'people'}.
        {closed ? ' This trip is closed: it takes no new expenses.' : ' Add a shared expense with + Add expense by choosing this group under "Share with".'}
      </p>

      <div className={ui.card()}>
        {partner && group.kind === 'couple' ? (
          <p className={ui.coupleLine(line.tone)}>{line.text}</p>
        ) : (
          <>
            <h3>{tr('Balances')}</h3>
            <ul className={ui.list(true)}>
              {[...people.map((m) => ({ id: m.user_id, label: nameOf(m.user_id), left: false })), ...former.filter((m) => (bal[m.user_id] ?? 0) !== 0).map((m) => ({ id: m.user_id, label: tr('{0} (left)', m.display_name), left: true }))].map((p) => {
                const b = bal[p.id] ?? 0;
                return <li key={p.id} className={ui.catLineFlush}><span>{p.label}</span><b className={b > 0 ? ui.owed : b < 0 ? ui.late : 'text-muted'}>{p.id === me ? (b === 0 ? tr('All settled') : b > 0 ? tr('You are owed {0}', fmtINR(fromPaise(b))) : tr('You owe {0}', fmtINR(fromPaise(-b)))) : owes(b)}</b></li>;
              })}
            </ul>
          </>
        )}
        {debts.length > 0 ? (
          <>
            <h3 className="text-[16px] mt-5 mb-2">{tr('To settle up')}</h3>
            <ul className={ui.list(true)}>
              {debts.map((d) => (
                <li key={`${d.from}>${d.to}`} className={ui.dueRow()}>
                  <span className={ui.rowMain(true)}><b>{nameOf(d.from)} {d.from === me ? 'pay' : 'pays'} {nameOf(d.to)}</b></span>
                  <span className="font-bold tabular-nums">{fmtINR(d.amount)}</span>
                  {(d.from === me || d.to === me) && <button type="button" className={ui.btn('ghost', 'small')} onClick={() => startSettle(d)}>{tr('Record')}</button>}
                </li>
              ))}
            </ul>
          </>
        ) : <p className="text-muted text-[13px]">{tr('Nobody owes anybody anything.')}</p>}
        {!settle && <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} onClick={() => setSettle({ dir: 'paid', other: people.find((m) => m.user_id !== me)?.user_id ?? '', amount: '', date: isoDate() })}>{tr('Record a payment')}</button>}
        {settle && (
          <form onSubmit={record} noValidate className={ui.settleForm}>
            <h3>{tr('Record a payment')}</h3>
            <p className="text-muted text-[13px]">{tr('Money never moves through this app: this only notes that it happened, outside it.')}</p>
            <fieldset className={ui.chips}>
              <legend>{tr('Who paid')}</legend>
              <button type="button" className={ui.chip} aria-pressed={settle.dir === 'paid'} onClick={() => setSettle({ ...settle, dir: 'paid' })}>{tr('I paid')}</button>
              <button type="button" className={ui.chip} aria-pressed={settle.dir === 'received'} onClick={() => setSettle({ ...settle, dir: 'received' })}>{tr('I received')}</button>
            </fieldset>
            <label className={ui.field}>
              <span>{settle.dir === 'paid' ? tr('Paid to') : tr('Received from')}</span>
              <select value={settle.other} onChange={(e) => setSettle({ ...settle, other: e.target.value })}>
                {people.filter((m) => m.user_id !== me).map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
              </select>
            </label>
            <label className={ui.field}><span>{tr('Amount (₹)')}</span><input inputMode="decimal" value={settle.amount} onChange={(e) => { setSettle({ ...settle, amount: e.target.value }); setSettleError(''); }} /></label>
            <label className={ui.field}><span>{tr('Date')}</span><input type="date" value={settle.date} max={isoDate()} onChange={(e) => setSettle({ ...settle, date: e.target.value })} /></label>
            {settleError && <p className={ui.msg('bad')} role="alert">{settleError}</p>}
            <div className={ui.btnRow}>
              <button type="submit" className={ui.btn()}>{tr('Save payment')}</button>
              <button type="button" className={ui.btn('ghost')} onClick={() => { setSettle(null); setSettleError(''); }}>{tr('Cancel')}</button>
            </div>
          </form>
        )}
      </div>

      {group.kind === 'trip' && <TripSummary group={group} />}
      {group.kind === 'family' && <FamilyMonth group={group} />}

      <h3 className="text-[16px] mt-5 mb-2">{tr('Expenses and payments')}</h3>
      {items.length === 0 ? <p className="text-muted">{tr('Nothing yet.')}</p> : (
        <ul className={ui.list()}>
          {items.map((it) => {
            if (it.kind === 'settle') {
              const s = it.s;
              const canRemove = s.created_by === me && [s.from_user, s.to_user].every((u) => people.some((m) => m.user_id === u));
              return (
                <li key={s.id} className={ui.dueRow()}>
                  <span className={ui.rowMain(true)}><b>{tr('{0} paid {1}', nameOf(s.from_user), nameOf(s.to_user))}</b><small>{tr('{0} · payment recorded', shortDate(s.settle_date))}</small></span>
                  <span className="font-bold tabular-nums">{fmtINR(s.amount)}</span>
                  {canRemove && <button type="button" className={ui.icoBtn} aria-label={tr('Remove this payment')} onClick={() => { if (window.confirm('Remove this recorded payment? The balances change back.')) void app.removeSettlement(s.id); }}><Icon name="close" size={18} /></button>}
                </li>
              );
            }
            const e = it.e;
            const share = myShare(e, me);
            const body = (
              <>
                <span className={ui.rowMain()}>
                  <b>{e.category}{e.note ? ` · ${e.note}` : ''}</b>
                  <small>{tr('{0} · {1} paid{2}', shortDate(e.entry_date), nameOf(e.paid_by ?? ''), share > 0 ? tr(' · your share {0}', fmtINR(share)) : '')}</small>
                </span>
                <span className="font-bold tabular-nums">{fmtINR(e.amount)}</span>
              </>
            );
            return <li key={e.id}><button type="button" className={ui.row} onClick={() => (e.owner_id === me ? setEditing(e) : setViewing(e))}>{body}</button></li>;
          })}
        </ul>
      )}

      {editing && <EditDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
      {viewing && <ExpenseDialog key={viewing.id} entry={viewing} group={group} onClose={() => setViewing(null)} />}
    </section>
  );
}

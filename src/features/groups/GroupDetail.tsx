import { Icon } from '../../ui/Icon.tsx';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { EditDialog } from '../payments/index.ts';
import { ExpenseDialog } from '../payments/index.ts';
import { copyText } from '../../ui/files.ts';
import { shortDate } from '../../core/format.ts';
import { activeMembers, formatCode, fromPaise, groupBalances, inviteLink, ledger, memberName, simplifyDebts } from '../../core/groups.ts';
import type { Group, Settlement } from '../../core/groups.ts';
import { coupleLine } from '../../core/couple.ts';
import { hasRoom, kindLabel, kindMax } from '../../core/groupKinds.ts';
import { BASEPATH, appRootUrl } from '../../core/paths.ts';
import { fmtINR, isValidDate, isoDate, myShare, parseAmount } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import { TripSettings } from './TripSettings.tsx';
import { TripSummary } from './TripSummary.tsx';
import { FamilyMonth } from './FamilyMonth.tsx';
import { UsualSplitCard } from './UsualSplitCard.tsx';
import { tripDatesLabel } from '../../core/groupSummary.ts';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';

const owes = (paise: number): string => (paise === 0 ? 'All settled' : paise > 0 ? `is owed ${fmtINR(fromPaise(paise))}` : `owes ${fmtINR(fromPaise(-paise))}`);

type LedgerItem = { kind: 'expense'; date: string; at: string; e: Entry } | { kind: 'settle'; date: string; at: string; s: Settlement };

export function GroupDetail({ group, onBack }: { group: Group; onBack: () => void }) {
  const app = useApp();
  const me = app.me ?? '';
  const act = useAction();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [settle, setSettle] = useState<{ dir: 'paid' | 'received'; other: string; amount: string; date: string } | null>(null);
  const [settleError, setSettleError] = useState('');

  const people = useMemo(() => activeMembers(app.members, group.id), [app.members, group.id]);
  const former = app.members.filter((m) => m.group_id === group.id && m.left_at);
  const mine = people.find((m) => m.user_id === me);
  const isAdmin = mine?.role === 'admin';
  const bal = useMemo(() => groupBalances(group.id, app.groupEntries, app.settlements), [group.id, app.groupEntries, app.settlements]);
  const debts = useMemo(() => simplifyDebts(bal), [bal]);
  const nameOf = (uid: string) => (uid === me ? 'You' : memberName(app.members, group.id, uid));
  const invite = app.invites.find((i) => i.group_id === group.id);
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
    if (amt === null) return setSettleError('Amount must be a positive number with at most 2 decimals.');
    if (!settle.other) return setSettleError('Pick the other person.');
    if (!isValidDate(settle.date) || settle.date > isoDate()) return setSettleError('Pick a date that is today or earlier.');
    await app.addSettlement({
      group_id: group.id,
      from_user: settle.dir === 'paid' ? me : settle.other,
      to_user: settle.dir === 'paid' ? settle.other : me,
      amount: amt,
      settle_date: settle.date,
    });
    app.toast(`Recorded ${fmtINR(amt)}`);
    setSettle(null);
    setSettleError('');
  }

  const startSettle = (d: { from: string; to: string; amount: number }) =>
    setSettle({ dir: d.from === me ? 'paid' : 'received', other: d.from === me ? d.to : d.from, amount: String(d.amount), date: isoDate() });

  const myBalance = bal[me] ?? 0;

  async function copy(text: string, what: string) {
    app.toast((await copyText(text)) ? `${what} copied.` : 'Could not copy. Select it and copy it by hand.');
  }

  return (
    <section aria-label={`Group ${group.name}`}>
      <button type="button" className={ui.btn('ghost', 'md', 'w-auto mb-2')} onClick={onBack}><span className="inline-flex rotate-180"><Icon name="chevron" size={18} /></span> All groups</button>
      <h2>{group.name} <span className={ui.tag}>{kindLabel(group.kind)}</span>{closed && <> <span className={ui.tag}>Closed</span></>}</h2>
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
            <h3>Balances</h3>
            <ul className={ui.list(true)}>
              {[...people.map((m) => ({ id: m.user_id, label: nameOf(m.user_id), left: false })), ...former.filter((m) => (bal[m.user_id] ?? 0) !== 0).map((m) => ({ id: m.user_id, label: `${m.display_name} (left)`, left: true }))].map((p) => {
                const b = bal[p.id] ?? 0;
                return <li key={p.id} className={ui.catLineFlush}><span>{p.label}</span><b className={b > 0 ? ui.owed : b < 0 ? ui.late : 'text-muted'}>{p.id === me ? (b === 0 ? 'All settled' : b > 0 ? `You are owed ${fmtINR(fromPaise(b))}` : `You owe ${fmtINR(fromPaise(-b))}`) : owes(b)}</b></li>;
              })}
            </ul>
          </>
        )}
        {debts.length > 0 ? (
          <>
            <h3 className="text-[16px] mt-5 mb-2">To settle up</h3>
            <ul className={ui.list(true)}>
              {debts.map((d) => (
                <li key={`${d.from}>${d.to}`} className={ui.dueRow()}>
                  <span className={ui.rowMain(true)}><b>{nameOf(d.from)} {d.from === me ? 'pay' : 'pays'} {nameOf(d.to)}</b></span>
                  <span className="font-bold tabular-nums">{fmtINR(d.amount)}</span>
                  {(d.from === me || d.to === me) && <button type="button" className={ui.btn('ghost', 'small')} onClick={() => startSettle(d)}>Record</button>}
                </li>
              ))}
            </ul>
          </>
        ) : <p className="text-muted text-[13px]">Nobody owes anybody anything.</p>}
        {!settle && <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} onClick={() => setSettle({ dir: 'paid', other: people.find((m) => m.user_id !== me)?.user_id ?? '', amount: '', date: isoDate() })}>Record a payment</button>}
        {settle && (
          <form onSubmit={record} noValidate className={ui.settleForm}>
            <h3>Record a payment</h3>
            <p className="text-muted text-[13px]">Money never moves through this app: this only notes that it happened, outside it.</p>
            <fieldset className={ui.chips}>
              <legend>Who paid</legend>
              <button type="button" className={ui.chip} aria-pressed={settle.dir === 'paid'} onClick={() => setSettle({ ...settle, dir: 'paid' })}>I paid</button>
              <button type="button" className={ui.chip} aria-pressed={settle.dir === 'received'} onClick={() => setSettle({ ...settle, dir: 'received' })}>I received</button>
            </fieldset>
            <label className={ui.field}>
              <span>{settle.dir === 'paid' ? 'Paid to' : 'Received from'}</span>
              <select value={settle.other} onChange={(e) => setSettle({ ...settle, other: e.target.value })}>
                {people.filter((m) => m.user_id !== me).map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
              </select>
            </label>
            <label className={ui.field}><span>Amount (₹)</span><input inputMode="decimal" value={settle.amount} onChange={(e) => { setSettle({ ...settle, amount: e.target.value }); setSettleError(''); }} /></label>
            <label className={ui.field}><span>Date</span><input type="date" value={settle.date} max={isoDate()} onChange={(e) => setSettle({ ...settle, date: e.target.value })} /></label>
            {settleError && <p className={ui.msg('bad')} role="alert">{settleError}</p>}
            <div className={ui.btnRow}>
              <button type="submit" className={ui.btn()}>Save payment</button>
              <button type="button" className={ui.btn('ghost')} onClick={() => { setSettle(null); setSettleError(''); }}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {group.kind === 'trip' && <TripSummary group={group} />}
      {group.kind === 'family' && <FamilyMonth group={group} />}
      {group.kind === 'flatmates' && <UsualSplitCard group={group} people={people} isAdmin={isAdmin} />}

      <h3 className="text-[16px] mt-5 mb-2">Expenses and payments</h3>
      {items.length === 0 ? <p className="text-muted">Nothing yet.</p> : (
        <ul className={ui.list()}>
          {items.map((it) => {
            if (it.kind === 'settle') {
              const s = it.s;
              const canRemove = s.created_by === me && [s.from_user, s.to_user].every((u) => people.some((m) => m.user_id === u));
              return (
                <li key={s.id} className={ui.dueRow()}>
                  <span className={ui.rowMain(true)}><b>{nameOf(s.from_user)} paid {nameOf(s.to_user)}</b><small>{shortDate(s.settle_date)} · payment recorded</small></span>
                  <span className="font-bold tabular-nums">{fmtINR(s.amount)}</span>
                  {canRemove && <button type="button" className={ui.icoBtn} aria-label="Remove this payment" onClick={() => { if (window.confirm('Remove this recorded payment? The balances change back.')) void app.removeSettlement(s.id); }}><Icon name="close" size={18} /></button>}
                </li>
              );
            }
            const e = it.e;
            const share = myShare(e, me);
            const body = (
              <>
                <span className={ui.rowMain()}>
                  <b>{e.category}{e.note ? ` · ${e.note}` : ''}</b>
                  <small>{shortDate(e.entry_date)} · {nameOf(e.paid_by ?? '')} paid{share > 0 ? ` · your share ${fmtINR(share)}` : ''}</small>
                </span>
                <span className="font-bold tabular-nums">{fmtINR(e.amount)}</span>
              </>
            );
            return <li key={e.id}><button type="button" className={ui.row} onClick={() => (e.owner_id === me ? setEditing(e) : setViewing(e))}>{body}</button></li>;
          })}
        </ul>
      )}

      {group.kind === 'trip' && <TripSettings group={group} isAdmin={isAdmin} />}

      {isAdmin && (
        <div className={ui.card()}>
          <h3>Invite people</h3>
          {closed ? (
            <p className="text-muted text-[13px]">This trip is closed, so nobody can join it. Reopen it to invite someone.</p>
          ) : !hasRoom(group.kind, people.length) ? (
            <p className="text-muted text-[13px]">A {kindLabel(group.kind).toLowerCase()} group holds at most {kindMax(group.kind)} people and this one is full. If someone leaves, a new code can be made here.</p>
          ) : invite && Date.parse(invite.expires_at) > Date.now() ? (
            <>
              <p className={ui.codeBox} aria-label="Join code">{formatCode(invite.code)}</p>
              <p className="text-muted text-[13px]">Valid until {shortDate(invite.expires_at.slice(0, 10))}. Anyone with the code can join, so send it only to people you mean to add.</p>
              <div className={ui.btnRow}>
                <button type="button" className={ui.btn()} onClick={() => { void copy(inviteLink(appRootUrl(window.location.href, BASEPATH), invite.code), 'Link'); }}>Copy link</button>
                <button type="button" className={ui.btn('ghost')} onClick={() => { void copy(formatCode(invite.code), 'Code'); }}>Copy code</button>
              </div>
            </>
          ) : <p className="text-muted text-[13px]">The code has expired. Make a new one to invite someone.</p>}
          {!closed && hasRoom(group.kind, people.length) && <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} disabled={act.busy} onClick={() => { if (window.confirm('Make a new code? The old one stops working.')) void act.run(() => app.resetInvite(group.id), 'New code made'); }}>Make a new code</button>}
          {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
        </div>
      )}

      <div className={ui.card()}>
        <h3>People</h3>
        <ul className={ui.list(true)}>
          {people.map((m) => {
            const b = bal[m.user_id] ?? 0;
            return (
              <li key={m.user_id} className={ui.dueRow()}>
                <span className={ui.rowMain(true)}><b>{m.display_name}{m.user_id === me ? ' (you)' : ''}</b><small>{m.role === 'admin' ? 'Admin' : 'Member'}</small></span>
                {m.user_id === me && <button type="button" className={ui.btn('ghost', 'small')} onClick={() => setRenaming(m.display_name)}>Rename</button>}
                {isAdmin && m.user_id !== me && m.role === 'member' && <button type="button" className={ui.btn('ghost', 'small')} disabled={act.busy} onClick={() => { if (window.confirm(`Make ${m.display_name} an admin? Admins can invite and remove people.`)) void act.run(() => app.makeAdmin(group.id, m.user_id), 'Done'); }}>Make admin</button>}
                {isAdmin && m.user_id !== me && <button type="button" className={ui.btn('danger', 'small')} disabled={act.busy || b !== 0} title={b !== 0 ? 'They must settle up first' : undefined} onClick={() => { if (window.confirm(`Remove ${m.display_name} from ${group.name}? The invite code changes too.`)) void act.run(() => app.removeMember(group.id, m.user_id), 'Removed'); }}>Remove</button>}
              </li>
            );
          })}
        </ul>
        {renaming !== null && (
          <form className={ui.settleForm} onSubmit={(ev) => { ev.preventDefault(); if (renaming.trim()) void act.run(() => app.setDisplayName(group.id, renaming.trim()), 'Name changed').then((ok) => { if (ok) setRenaming(null); }); }}>
            <label className={ui.field}><span>Your name in this group</span><input value={renaming} maxLength={40} onChange={(e) => setRenaming(e.target.value)} /></label>
            <div className={ui.btnRow}><button type="submit" className={ui.btn()} disabled={act.busy}>Save name</button><button type="button" className={ui.btn('ghost')} onClick={() => setRenaming(null)}>Cancel</button></div>
          </form>
        )}
        {former.length > 0 && <p className="text-muted text-[13px]">Left the group: {former.map((m) => m.display_name).join(', ')}. Their earlier expenses stay in the list.</p>}
        {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
        <button type="button" className={ui.btn('danger', 'md', ui.inCard)} disabled={act.busy || myBalance !== 0}
          onClick={() => { if (window.confirm(`Leave ${group.name}? You will stop seeing it. Expenses you added stay in the group for the others.`)) void act.run(() => app.leaveGroup(group.id), 'You left the group').then((ok) => { if (ok) onBack(); }); }}>
          Leave this group
        </button>
        {myBalance !== 0 && <p className="text-muted text-[13px]">You can leave once you have settled up: your balance here is {myBalance > 0 ? `${fmtINR(fromPaise(myBalance))} owed to you` : `${fmtINR(fromPaise(-myBalance))} that you owe`}.</p>}
      </div>
      {editing && <EditDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
      {viewing && <ExpenseDialog key={viewing.id} entry={viewing} group={group} onClose={() => setViewing(null)} />}
    </section>
  );
}

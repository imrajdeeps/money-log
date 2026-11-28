import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { ask } from '../../ui/confirm.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { changeFrom, inRepeat, prevMonth, scaleShares, sharesTotal, skipMonth } from '../../core/groupRepeats.ts';
import type { GroupRepeat } from '../../core/groupRepeats.ts';
import { monthName, ordinal } from '../../core/format.ts';
import { activeMembers } from '../../core/groups.ts';
import type { Group } from '../../core/groups.ts';
import { fmtINR, isoDate, parseAmount, round2 } from '../../core/logic.ts';
import type { Shares } from '../../core/logic.ts';
import { errorStatus, payerLine, peopleIn, repeatError, repeatName } from './repeatText.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The sheet behind a repeat's ⋯ (version 2.2, from the design): change the amount, day or split; skip a month; stop repeating.
// Someone not in it sees what it is and who can change it; an admin of the group may also stop it.

const FIELD = 'min-h-12 rounded-field border border-field-line bg-card text-ink px-3 text-[16px] [font-family:inherit]';

const share = (text: string): number | null => (text.trim() === '' || /^0*(\.0*)?$/.test(text.trim()) ? 0 : parseAmount(text));
const asText = (shares: Shares): Record<string, string> => Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, String(v)]));

/** The typed split as shares, or null when a share is not an amount. */
function typedShares(values: Record<string, string>): Shares | null {
  const out: Shares = {};
  for (const [id, text] of Object.entries(values)) {
    const v = share(text);
    if (v === null) return null;
    out[id] = v;
  }
  return out;
}

function checkEdit(amount: number | null, day: number, shares: Shares | null): string | null {
  if (amount === null) return tr('Enter an amount above zero, with at most two decimals.');
  if (!Number.isInteger(day) || day < 1 || day > 31) return tr('The day must be between 1 and 31.');
  if (!shares) return tr('Each share must be an amount, or 0.');
  return round2(sharesTotal(shares)) === amount ? null : tr('The shares add up to {0}, not {1}.', fmtINR(sharesTotal(shares)), fmtINR(amount));
}

/** What is sent: someone who has left the group drops out with a share of 0 (the server takes current members only); you never do. */
const sendable = (shares: Shares, current: ReadonlySet<string>, me: string): Shares =>
  Object.fromEntries(Object.entries(shares).filter(([id, v]) => v > 0 || current.has(id) || id === me));

function EditRepeat({ r, group, me, nameOf, onDone, onCancel }: Readonly<{ r: GroupRepeat; group: Group; me: string; nameOf: (uid: string) => string; onDone: () => void; onCancel: () => void }>) {
  const app = useApp();
  const [amount, setAmount] = useState(String(r.amount));
  const [day, setDay] = useState(String(r.day));
  const [values, setValues] = useState(asText(r.shares));
  const [base, setBase] = useState<Shares>(r.shares); // what a new amount scales from: the saved split, or the last one typed
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const from = changeFrom(r, isoDate());
  const amt = parseAmount(amount);
  const shares = typedShares(values);
  const total = shares ? sharesTotal(shares) : null;
  const current = new Set(activeMembers(app.members, group.id).map((m) => m.user_id));
  const ids = Object.keys(r.shares).sort((a, b) => Number(b === me) - Number(a === me));
  const label = (id: string) => {
    if (id === me) return tr('You');
    return current.has(id) ? nameOf(id) : tr('{0} (left)', nameOf(id));
  };
  const typeAmount = (text: string) => {
    setAmount(text);
    setError('');
    const next = parseAmount(text);
    if (next !== null) setValues(asText(scaleShares(base, next)));
  };
  const typeShare = (id: string, text: string) => {
    const next = { ...values, [id]: text };
    setValues(next);
    setError('');
    const typed = typedShares(next);
    if (typed && sharesTotal(typed) > 0) setBase(typed);
  };
  const save = async () => {
    const problem = checkEdit(amt, Number(day), shares);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await app.editGroupRepeat(r.id, amt!, Number(day), sendable(shares!, current, me));
      app.toast(tr('{0} changed from {1}', repeatName(r), monthName(from)));
      onDone();
    } catch (e) { setError(repeatError(e, from)); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-2.5 mt-2.5 border-t border-line pt-3">
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2.5">
        {/* the row that opened this form is gone, so focus comes to the amount */}
        <label className={ui.fieldBare}><span>{tr('Amount')}</span><input inputMode="decimal" autoFocus value={amount} onChange={(e) => typeAmount(e.target.value)} /></label>
        <label className={ui.fieldBare}><span>{tr('Day')}</span><input inputMode="numeric" value={day} onChange={(e) => { setDay(e.target.value); setError(''); }} /></label>
      </div>
      {ids.map((id) => (
        <label key={id} className="grid grid-cols-[minmax(0,1fr)_140px] gap-2 items-center">
          <span className="text-[15px] font-semibold">{label(id)}</span>
          <input className={ui.cx(FIELD, 'text-right')} inputMode="decimal" aria-label={tr('Share of {0}', label(id))} value={values[id] ?? ''} onChange={(e) => typeShare(id, e.target.value)} />
        </label>
      ))}
      {total !== null && amt !== null && (
        <span className={ui.cx('text-[13px] font-semibold', round2(total) === amt ? 'text-good' : 'text-bad')}>
          {round2(total) === amt ? tr('Adds up to {0}', fmtINR(amt)) : tr('Adds up to {0}, not {1}', fmtINR(total), fmtINR(amt))}
        </span>
      )}
      <span className="text-[13px] leading-[18px] text-muted">{tr('From {0}. {1} and earlier stay as they were logged.', monthName(from), monthName(prevMonth(from)))}</span>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className="flex gap-2.5 [&>*]:flex-1">
        <button type="button" className={ui.btn('solid', 'none', 'min-h-12 text-[16px]')} disabled={busy} onClick={() => void save()}>{tr('Save')}</button>
        <button type="button" className={ui.btn('outline', 'none', 'min-h-12 text-[16px]')} onClick={onCancel}>{tr('Cancel')}</button>
      </div>
    </div>
  );
}

// stopOnly: an admin of the group who is not in the repeat may stop it (say, when its people have all left), nothing more.
function Menu({ r, onEdit, onClose, stopOnly }: Readonly<{ r: GroupRepeat; onEdit: () => void; onClose: () => void; stopOnly: boolean }>) {
  const app = useApp();
  const [error, setError] = useState('');
  const skip = skipMonth(r, isoDate());
  const name = repeatName(r);
  const run = async (fn: () => Promise<void>, done: string, month: string) => {
    setError('');
    try { await fn(); app.toast(done); onClose(); } catch (e) {
      setError(repeatError(e, month));
      if (errorStatus(e) > 0) app.syncNow(); // refused (done or stopped elsewhere): bring the page up to date
    }
  };
  const stop = async () => {
    if (await ask(tr('Stop repeating {0}? Every month already logged stays as it is.', name), tr('Stop repeating'))) await run(() => app.stopGroupRepeat(r.id), tr('{0} no longer repeats', name), isoDate().slice(0, 7));
  };
  let note = peopleIn(r) === 2 ? tr('Either of you can change, skip or stop it, and the other sees a note.') : tr('Anyone in it can change, skip or stop it, and the others see a note.');
  if (stopOnly) note = tr('As an admin you can stop it; only the people in it can change or skip it.');
  return (
    <>
      <div className="flex flex-col mt-2 border-t border-line">
        {!stopOnly && <button type="button" className={ui.cx(ui.sheetRow, 'border-b border-line text-ink font-semibold')} onClick={onEdit}><Icon name="edit" size={20} stroke={2} />{tr('Change the amount, day or split')}</button>}
        {skip && !stopOnly && <button type="button" className={ui.cx(ui.sheetRow, 'border-b border-line text-ink font-semibold')} onClick={() => void run(() => app.skipGroupRepeat(r.id, skip), tr('Skipped {0} for {1}', name, monthName(skip)), skip)}><Icon name="skip" size={20} stroke={2} />{tr('Skip {0}', monthName(skip))}</button>}
        <button type="button" className={ui.cx(ui.sheetRow, 'text-bad font-[650]')} onClick={() => void stop()}><Icon name="close" size={20} stroke={2} />{tr('Stop repeating')}</button>
      </div>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <p className="m-0 pt-2 text-[13px] leading-[19px] text-muted">{note} {tr('Stopping keeps every month already logged.')}</p>
    </>
  );
}

export function RepeatSheet({ r, group, me, nameOf, onClose }: Readonly<{ r: GroupRepeat; group: Group; me: string; nameOf: (uid: string) => string; onClose: () => void }>) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const close = () => ref.current?.close();
  const setUpBy = r.created_by === me ? tr('you') : nameOf(r.created_by ?? '');
  const mine = inRepeat(r, me);
  const admin = app.members.some((m) => m.group_id === group.id && m.user_id === me && !m.left_at && m.role === 'admin');
  return (
    <dialog ref={ref} className="sheet" aria-label={tr('{0}, every month', repeatName(r))}
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }} onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="flex flex-col gap-1 mt-2.5">
        <span className="text-[13px] text-muted">{tr('{0} · every month on the {1} · set up by {2}', group.name, ordinal(r.day), setUpBy)}</span>
        <span className="text-[24px] leading-[30px] font-extrabold tabular-nums">{repeatName(r)} · {fmtINR(r.amount)}</span>
        <span className="text-[14px] text-muted">{payerLine(r, me, nameOf)}</span>
      </div>
      {(mine || admin) && !editing && <Menu r={r} onEdit={() => setEditing(true)} onClose={close} stopOnly={!mine} />}
      {mine && editing && <EditRepeat r={r} group={group} me={me} nameOf={nameOf} onDone={close} onCancel={() => setEditing(false)} />}
      {!mine && !admin && <p className="m-0 pt-3 text-[13px] leading-[19px] text-muted">{tr('Only the people in it can change, skip or stop it.')}</p>}
      {!editing && <button type="button" className={ui.btn('outline', 'none', 'w-full mt-2.5 min-h-[52px] text-[16px]')} onClick={close}>{tr('Cancel')}</button>}
    </dialog>
  );
}

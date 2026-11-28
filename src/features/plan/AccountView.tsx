import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { NO_SETTINGS, settingsOf } from '../../core/accounts.ts';
import type { AccountSettings } from '../../core/accounts.ts';
import { shortDate } from '../../core/format.ts';
import type { WorthItem } from '../../core/goals.ts';
import { METHODS, catKey, fmtINR, parseAmount } from '../../core/logic.ts';
import type { Method } from '../../core/logic.ts';
import { classLabel } from '../../core/worth.ts';
import { flowLine, methodName, movedBy, signed } from './accountText.ts';
import type { WorthView } from './useWorth.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// An account's page (version 2.3, from the design): what it holds now and how that was worked out, the payments since its figure was
// confirmed, what moves it (Change), and Confirm today's balance. Also where an item kept by hand is set up to be worked out.

const H = 'm-0 text-[16px] leading-[22px] font-[650] text-ink';
const RATE = /^\d{1,2}(\.\d{1,2})?$/;
type Kind = 'plain' | 'interest' | 'market';
const kindOf = (s: AccountSettings): Kind => {
  if (s.mk) return 'market';
  return s.ir > 0 ? 'interest' : 'plain';
};

function methodHint(m: Method, debt: boolean): string {
  if (debt) return tr('Spending on it raises what you owe');
  return m === 'Cash' ? tr('Cash you spend lowers it') : tr('Spending lowers it');
}

// What moves an account, to change: the ways of paying, money received, the categories that move money into it, interest or a market value.
function SettingsForm({ item, start, onSave, onCancel, onKeepByHand }: Readonly<{
  item: WorthItem; start: AccountSettings; onSave: (s: AccountSettings) => void; onCancel: () => void; onKeepByHand?: () => void;
}>) {
  const app = useApp();
  const debt = item.s === 'd';
  const [s, setS] = useState(start);
  const [kind, setKind] = useState<Kind>(kindOf(start));
  const [rate, setRate] = useState(start.ir > 0 ? String(start.ir) : '');
  const [error, setError] = useState('');
  const togglePay = (m: Method) => setS({ ...s, pay: s.pay.includes(m) ? s.pay.filter((x) => x !== m) : [...s.pay, m] });
  const toggleCat = (c: string) => setS({ ...s, cat: s.cat.some((x) => catKey(x) === catKey(c)) ? s.cat.filter((x) => catKey(x) !== catKey(c)) : [...s.cat, c] });
  const save = () => {
    if (kind === 'interest' && !(RATE.test(rate.trim()) && Number(rate) > 0 && Number(rate) <= 30)) return setError(tr('The yearly interest rate must be above 0 and at most 30, with at most two decimals.'));
    onSave({ ...s, ir: kind === 'interest' ? Number(rate) : 0, mk: kind === 'market' });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className={ui.tickCard}>
        {METHODS.map((m) => (
          <label key={m} className={ui.tickRow}>
            <input type="checkbox" checked={s.pay.includes(m)} onChange={() => togglePay(m)} />
            <span><b>{tr('Payments by {0}', methodName(m))}</b><small>{methodHint(m, debt)}</small></span>
          </label>
        ))}
        {!debt && (
          <label className={ui.tickRow}>
            <input type="checkbox" checked={s.inc} onChange={(e) => setS({ ...s, inc: e.target.checked })} />
            <span><b>{tr('Money you receive')}</b><small>{tr('Salary, refunds and cashback raise it')}</small></span>
          </label>
        )}
      </div>
      <fieldset className={ui.chipsBare}>
        <legend className="text-[13px] font-semibold mb-2">{debt ? tr('Payments in these categories pay it off') : tr('Payments in these categories move money into it')}</legend>
        {app.categories.map((c) => <button key={c.name} type="button" className={ui.chipTick} aria-pressed={s.cat.some((x) => catKey(x) === catKey(c.name))} onClick={() => toggleCat(c.name)}>{c.name}</button>)}
      </fieldset>
      {!debt && item.c !== 'liquid' && (
        <div className={ui.segment(3)} role="radiogroup" aria-label={tr('How it grows')}>
          <button type="button" role="radio" className={ui.segBtn} aria-checked={kind === 'plain'} onClick={() => setKind('plain')}>{tr('Neither')}</button>
          <button type="button" role="radio" className={ui.segBtn} aria-checked={kind === 'interest'} onClick={() => setKind('interest')}>{tr('Interest')}</button>
          <button type="button" role="radio" className={ui.segBtn} aria-checked={kind === 'market'} onClick={() => setKind('market')}>{tr('Market value')}</button>
        </div>
      )}
      {kind === 'interest' && <label className={ui.fieldBare}><span>{tr('Yearly interest rate (%), for FD, RD or PPF')}</span><input inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setError(''); }} /></label>}
      {kind === 'market' && <p className="m-0 text-[13px] text-muted">{tr('Mutual funds or stocks: what you put in is added, and the check-in asks what it is worth.')}</p>}
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className="flex gap-2.5 [&>*]:flex-1">
        <button type="button" className={ui.btn()} onClick={save}>{tr('Save')}</button>
        <button type="button" className={ui.btn('outline')} onClick={onCancel}>{tr('Cancel')}</button>
      </div>
      {onKeepByHand && <button type="button" className={ui.btn('ghost')} onClick={onKeepByHand}>{tr('Keep it by hand instead')}</button>}
    </div>
  );
}

/** A payment's effect on net worth: what an asset gains, or what a card's debt loses. */
const effectOf = (item: WorthItem, amount: number): number => (item.s === 'd' ? -amount : amount);

// "+ ₹1,40,000 in − ₹35,000 out" for an account you own; "₹12,000 spent, ₹10,000 paid off" for a card.
function InOut({ item, inflow, outflow, interest }: Readonly<{ item: WorthItem; inflow: number; outflow: number; interest: number }>) {
  if (item.s === 'd') return <span className="text-[14px] font-semibold"><span className="text-bad">{tr('{0} spent', fmtINR(inflow))}</span> · <span className="text-good">{tr('{0} paid off', fmtINR(outflow))}</span></span>;
  return <span className="text-[14px] font-semibold"><span className="text-good">{tr('+ {0} in', fmtINR(inflow))}</span> <span className="text-bad">{tr('− {0} out', fmtINR(outflow))}</span>{interest > 0 ? ` · ${tr('{0} interest', fmtINR(interest))}` : ''}</span>;
}

// Confirm today's balance: the figure the account really holds, which the payments then move on from.
function ConfirmBalance({ item, expected, view, onDone }: Readonly<{ item: WorthItem; expected: number; view: WorthView; onDone: () => void }>) {
  const app = useApp();
  const [text, setText] = useState(String(expected));
  const [error, setError] = useState('');
  const save = async () => {
    const n = text.trim() === '0' ? 0 : parseAmount(text);
    if (n === null) return setError(tr('Enter an amount, with at most two decimals.'));
    await app.checkInAccounts({ [item.id]: n }, view.auto);
    app.toast(tr('{0} confirmed at {1}', item.n, fmtINR(n)));
    onDone();
  };
  return (
    <div className="flex flex-col gap-2.5 bg-press rounded-card p-3.5">
      <label className={ui.fieldBare}><span>{tr("Today's balance")}</span><input inputMode="decimal" value={text} onChange={(e) => { setText(e.target.value); setError(''); }} /></label>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className="flex gap-2.5 [&>*]:flex-1">
        <button type="button" className={ui.btn()} onClick={() => void save()}>{tr('Confirm')}</button>
        <button type="button" className={ui.btn('outline')} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </div>
  );
}

// onEditItem: the item's own form (its name, its kind, or removing it).
export function AccountView({ item, view, editing: startEditing = false, onDone, onEditItem }: Readonly<{ item: WorthItem; view: WorthView; editing?: boolean; onDone: () => void; onEditItem: () => void }>) {
  const app = useApp();
  const s = settingsOf(item);
  const w = view.worked[item.id];
  const [editing, setEditing] = useState(startEditing || !s);
  const [confirming, setConfirming] = useState(false);
  const names = new Map(Object.values(app.goals).filter((g): g is WorthItem => g.k === 'w').map((g) => [g.id, g.n]));
  const saveSettings = async (next: AccountSettings | null) => {
    await app.setAccount(item.id, next, view.auto);
    app.toast(next ? tr('{0} is worked out from your payments now', item.n) : tr('{0} is kept by hand now', item.n));
    if (next) setEditing(false); else onDone();
  };
  return (
    <section className="flex flex-col gap-3 bg-card border border-line rounded-card p-4" aria-label={item.n}>
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 text-[20px] font-bold">{item.n}</h3>
        <span className="text-[13px] text-muted">{classLabel(item.s, item.c)}{s ? ` · ${movedBy(s)}` : ''}</span>
      </div>
      {s && w && !editing && (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-muted">{tr('Now, estimated')}</span>
            <span className="text-[32px] leading-[38px] font-extrabold tabular-nums">{fmtINR(w.value)}</span>
            <span className="text-[13px] text-muted">{tr('{0} confirmed on {1}', fmtINR(w.base), shortDate(w.since))}</span>
            <InOut item={item} inflow={w.inflow} outflow={w.outflow} interest={w.interest} />
            <span className="text-[13px] text-muted">{w.flows.length === 1 ? tr('Not typed: worked out from 1 payment') : tr('Not typed: worked out from {0} payments', w.flows.length)}</span>
          </div>
          {w.flows.length > 0 && (
            <div className="flex flex-col gap-1">
              <h4 className={H}>{tr('Since {0}', shortDate(w.since))}</h4>
              <ul className="list-none m-0 p-0">
                {w.flows.slice(0, 40).map((f, i) => (
                  <li key={`${f.entry}${f.kind}`} className={ui.cx('grid grid-cols-[52px_minmax(0,1fr)_auto] gap-2.5 items-center min-h-[52px] py-1.5', i > 0 && 'border-t border-line')}>
                    <span className="text-[12px] font-semibold text-muted uppercase">{shortDate(f.date)}</span>
                    <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold truncate">{f.label}</span><span className="text-[13px] text-muted truncate">{flowLine(f, names)}</span></span>
                    <span className={ui.cx('text-[15px] font-bold tabular-nums', effectOf(item, f.amount) >= 0 ? 'text-good' : '')}>{signed(effectOf(item, f.amount))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-between items-center"><h4 className={H}>{tr('What moves this account')}</h4><button type="button" className="min-h-11 border-0 bg-transparent text-brand text-[14px] font-[650] cursor-pointer [font-family:inherit]" onClick={() => setEditing(true)}>{tr('Change')}</button></div>
          <p className="m-0 text-[14px] leading-5">{movedBy(s)}</p>
          {confirming
            ? <ConfirmBalance item={item} expected={w.value} view={view} onDone={() => setConfirming(false)} />
            : <button type="button" className={ui.btn('outline')} onClick={() => setConfirming(true)}>{tr("Confirm today's balance")}</button>}
        </>
      )}
      {editing && <SettingsForm item={item} start={s ?? NO_SETTINGS} onSave={(next) => void saveSettings(next)} onCancel={() => (s ? setEditing(false) : onDone())} onKeepByHand={s ? () => void saveSettings(null) : undefined} />}
      {!editing && <button type="button" className={ui.btn('ghost')} onClick={onEditItem}>{tr('Change its name or kind, or remove it')}</button>}
      {!editing && <button type="button" className={ui.btn('ghost')} onClick={onDone}>{tr('Close')}</button>}
    </section>
  );
}

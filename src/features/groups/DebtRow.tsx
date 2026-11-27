import { useState } from 'react';
import type { ReactNode } from 'react';
import { fmtINR } from '../../core/logic.ts';
import { extractUpi, remindText, upiLink } from '../../core/upi.ts';
import { myUpi, theirUpi } from '../../data/phonePrefs.ts';
import { WhatsAppButton } from '../../ui/WhatsAppButton.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

type Debt = { from: string; to: string; amount: number };

// The part of a debt you owe where you pay by UPI: ask for their id (kept on this phone), then open your UPI app with it and the amount filled in.
// What is typed (or pasted from a reminder) wins; the remembered id is used while the box is empty.
function UpiPay({ debt, group, nameOf }: Readonly<{ debt: Debt; group: string; nameOf: (uid: string) => string }>) {
  const known = theirUpi.use();
  const [typed, setTyped] = useState(known[debt.to] ?? '');
  const payeeId = typed.trim() ? extractUpi(typed) : (known[debt.to] ?? '');
  function rememberIt() { if (payeeId) theirUpi.save({ ...known, [debt.to]: payeeId }); }
  return (
    <div className="mt-2">
      <label className={ui.field}>
        <span>{tr('{0}\'s UPI id', nameOf(debt.to))}</span>
        <input value={typed} placeholder="name@bank" autoCapitalize="none" autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
      </label>
      <p className="m-0 mt-1.5 text-[13px] text-muted">{tr('Ask them for it, or copy it from their reminder. It stays on this device.')}</p>
      {payeeId ? (
        <a className={ui.btn('solid', 'small') + ' mt-2 inline-flex items-center no-underline'} href={upiLink({ upi: payeeId, name: nameOf(debt.to), amount: debt.amount, note: group })} onClick={rememberIt}>{tr('Open my UPI app to pay {0}', fmtINR(debt.amount))}</a>
      ) : (
        typed.trim() !== '' && <p className={ui.msg('bad')}>{tr('That does not look like a UPI id (name@bank).')}</p>
      )}
      <p className="m-0 mt-1.5 text-[13px] text-muted">{tr('When you have paid, tap Record to note it here.')}</p>
    </div>
  );
}

// Why a simplified payment of yours is this amount: what you owe pair by pair, what it comes to simplified, and how many payments that saves.
function WhyBox({ lines }: Readonly<{ lines: string[] }>) {
  return (
    <div className="bg-press rounded-xl p-3 text-[14px] leading-5 flex flex-col gap-1.5">
      {lines.map((l, i) => <span key={l} className={ui.cx(i === lines.length - 1 && 'text-muted')}>{l}</span>)}
    </div>
  );
}

// One line of "To settle up": who pays whom and how much. When it involves you there is something to do about it: record it (as before),
// remind the person who owes you through WhatsApp (your UPI id, if you set one, rides in the message), or pay the person you owe by
// opening your UPI app with their id and the amount filled in. Money never moves through this app.
export function DebtRow({ debt, group, me, myName, nameOf, onRecord, sub, why }: Readonly<{
  debt: Debt; group: string; me: string; myName: string; nameOf: (uid: string) => string; onRecord: () => void;
  sub?: string; // 2.1, not simplified: what the payment is for
  why?: string[]; // 2.1, simplified: why your payment is this amount
}>) {
  const mine = myUpi.use();
  const [paying, setPaying] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const iOwe = debt.from === me;
  const involved = iOwe || debt.to === me;
  // whole sentences, so each language can put the words in its own order
  const who = iOwe ? tr('You pay {0}', nameOf(debt.to)) : debt.to === me ? tr('{0} pays you', nameOf(debt.from)) : tr('{0} pays {1}', nameOf(debt.from), nameOf(debt.to));

  return (
    <li className="flex flex-col gap-3 py-3.5">
      <span className="flex flex-col gap-0.5">
        <span className="text-[17px] font-bold [overflow-wrap:anywhere]">{who} <span className="tabular-nums">{fmtINR(debt.amount)}</span></span>
        {sub && <span className="text-[13px] leading-[18px] text-muted">{sub}</span>}
      </span>
      {involved && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ui.btn(iOwe ? 'solid' : 'outline', 'none', 'min-h-11 px-[18px] text-[15px]')} onClick={onRecord}>{tr('Record')}</button>
          {iOwe && <button type="button" className={ui.btn('outline', 'none', 'min-h-11 px-4 text-[15px]')} aria-expanded={paying} onClick={() => setPaying(!paying)}>{tr('Pay by UPI')}</button>}
          {debt.to === me && <WhatsAppButton size="row" label={tr('Remind on WhatsApp')} text={remindText({ name: nameOf(debt.from), amount: debt.amount, group, upi: mine, payeeName: myName })} />}
          {why && <button type="button" className="min-h-11 px-1.5 border-0 bg-transparent text-brand text-[14px] font-[650] underline cursor-pointer [font-family:inherit]" aria-expanded={showWhy} onClick={() => setShowWhy(!showWhy)}>{tr('Why this amount?')}</button>}
        </div>
      )}
      {why && showWhy && <WhyBox lines={why} />}
      {iOwe && paying && <UpiPay debt={debt} group={group} nameOf={nameOf} />}
    </li>
  );
}

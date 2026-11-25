import { useState } from 'react';
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
      <p className="m-0 mt-1.5 text-[13px] text-muted">{tr('Ask them for it, or copy it from their reminder. It stays on this phone.')}</p>
      {payeeId ? (
        <a className={ui.btn('solid', 'small') + ' mt-2 inline-flex items-center no-underline'} href={upiLink({ upi: payeeId, name: nameOf(debt.to), amount: debt.amount, note: group })} onClick={rememberIt}>{tr('Open my UPI app to pay {0}', fmtINR(debt.amount))}</a>
      ) : (
        typed.trim() !== '' && <p className={ui.msg('bad')}>{tr('That does not look like a UPI id (name@bank).')}</p>
      )}
      <p className="m-0 mt-1.5 text-[13px] text-muted">{tr('When you have paid, tap Record to note it here.')}</p>
    </div>
  );
}

// One line of "To settle up": who pays whom and how much. When it involves you there is something to do about it: record it (as before),
// remind the person who owes you through WhatsApp (your UPI id, if you set one, rides in the message), or pay the person you owe by
// opening your UPI app with their id and the amount filled in. Money never moves through this app.
export function DebtRow({ debt, group, me, myName, nameOf, onRecord }: Readonly<{
  debt: Debt; group: string; me: string; myName: string; nameOf: (uid: string) => string; onRecord: () => void;
}>) {
  const mine = myUpi.use();
  const [paying, setPaying] = useState(false);
  const iOwe = debt.from === me;
  const involved = iOwe || debt.to === me;
  // whole sentences, so each language can put the words in its own order
  const who = iOwe ? tr('You pay {0}', nameOf(debt.to)) : debt.to === me ? tr('{0} pays you', nameOf(debt.from)) : tr('{0} pays {1}', nameOf(debt.from), nameOf(debt.to));

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2.5 [&_b]:[overflow-wrap:anywhere]">
        <span className={ui.rowMain(true)}><b>{who}</b></span>
        <span className="font-bold tabular-nums">{fmtINR(debt.amount)}</span>
        {involved && <button type="button" className={ui.btn('ghost', 'small')} onClick={onRecord}>{tr('Record')}</button>}
      </div>
      {involved && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {debt.to === me && <WhatsAppButton size="small" label={tr('Remind')} text={remindText({ name: nameOf(debt.from), amount: debt.amount, group, upi: mine, payeeName: myName })} />}
          {iOwe && <button type="button" className={ui.btn('ghost', 'small')} aria-expanded={paying} onClick={() => setPaying(!paying)}>{tr('Pay')}</button>}
        </div>
      )}
      {iOwe && paying && <UpiPay debt={debt} group={group} nameOf={nameOf} />}
    </li>
  );
}

import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { worthAuto } from '../../data/phonePrefs.ts';
import { groupLookup } from '../../core/analytics.ts';
import { budgetEntries, fmtINR, isoDate } from '../../core/logic.ts';
import { classLabel, debtShare, isEstimated, runwayMonths, usualMonthlySpend, valueNow, worthItems, worthMoves, worthSummary } from '../../core/worth.ts';
import type { WorthItem } from '../../core/worth.ts';
import { WorthCheckIn } from './WorthCheckIn.tsx';
import { WorthForm } from './WorthForm.tsx';
import { useAutoLines } from './useAutoLines.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const pct = (f: number): string => `${Math.round(f * 100)}%`;

function Row({ item, today, onEdit }: Readonly<{ item: WorthItem; today: string; onEdit: () => void }>) {
  return (
    <li>
      <button type="button" className={ui.row} onClick={onEdit} aria-label={tr('Change {0}', item.n)}>
        <span className={ui.rowMain()}>
          <b>{item.n}</b>
          <small>{classLabel(item.s, item.c)}{isEstimated(item, today) ? ` · ${tr('estimated')}` : ''}</small>
        </span>
        <span className="font-bold tabular-nums">{fmtINR(valueNow(item, today))}</span>
      </button>
    </li>
  );
}

// What the net worth is made of: the things owned and owed (with a monthly check-in), where it sits, what moved, and two honest numbers
// (how long the liquid money would last, and how big the debts are against what is owned). Automatic lines are the person's choice.
export function WorthPanel() {
  const app = useApp();
  const today = isoDate();
  const auto = useAutoLines();
  const spend = useSpendEntries();
  const on = worthAuto.use();
  const [mode, setMode] = useState<null | 'add' | 'checkin' | WorthItem>(null);
  const { assets, debts } = worthItems(app.goals, today);
  const none = assets.length + debts.length === 0;
  const sum = worthSummary(app.goals, today, auto);
  const moves = worthMoves(app.goals, today);
  const usual = usualMonthlySpend(budgetEntries(spend, app.me), groupLookup(app.categories), today);
  const runway = runwayMonths(sum.liquid, usual);
  const share = debtShare(sum.assets, sum.debts);
  const total = sum.assets + sum.debts;

  if (mode === 'add') return <WorthForm auto={auto} onDone={() => setMode(null)} />;
  if (mode === 'checkin') return <WorthCheckIn auto={auto} onDone={() => setMode(null)} />;
  if (mode) return <WorthForm key={mode.id} item={mode} auto={auto} onDone={() => setMode(null)} />;

  const toggles = (
    <div className={ui.card()}>
      <h3>{tr('Add automatically')}</h3>
      <label className={ui.check}>
        <input type="checkbox" checked={on.groups} onChange={(e) => worthAuto.save({ ...on, groups: e.target.checked })} />
        <span>{tr('Group balances: what friends owe you, less what you owe them')}</span>
      </label>
      <label className={ui.check + ' mt-2'}>
        <input type="checkbox" checked={on.udhaar} onChange={(e) => worthAuto.save({ ...on, udhaar: e.target.checked })} />
        <span>{tr('Udhaar: money you lent, less money you borrowed')}</span>
      </label>
      <p className="text-muted text-[13px]">{tr('Worked out from what the app already holds, so do not also type them as items. The figure is counted in each check-in.')}</p>
    </div>
  );

  if (none) {
    return (
      <>
        <div className={ui.card()}>
          <h3>{tr('Break it down')}</h3>
          <p className="text-muted text-[13px]">{tr('List what you own (bank, investments, gold, property) and what you owe (loans, cards). Net worth is worked out for you, a monthly check-in takes a minute, and you see where the money sits and how long it would last.')}</p>
          <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={() => setMode('add')}>{tr('Add what you own and owe')}</button>
        </div>
        {toggles}
      </>
    );
  }

  return (
    <>
      <div className={ui.card()}>
        <div className={ui.btnRow + ' !mt-0'}>
          <button type="button" className={ui.btn()} onClick={() => setMode('checkin')}>{tr('Check in')}</button>
          <button type="button" className={ui.btn('ghost')} onClick={() => setMode('add')}>{tr('Add an item')}</button>
        </div>
        {assets.length > 0 && (<><h3 className="mt-3 mb-1 text-[15px]">{tr('You own')} · {fmtINR(sum.assets)}</h3><ul className={ui.list(true)}>{assets.map((i) => <Row key={i.id} item={i} today={today} onEdit={() => setMode(i)} />)}</ul></>)}
        {debts.length > 0 && (<><h3 className="mt-3 mb-1 text-[15px]">{tr('You owe')} · {fmtINR(sum.debts)}</h3><ul className={ui.list(true)}>{debts.map((i) => <Row key={i.id} item={i} today={today} onEdit={() => setMode(i)} />)}</ul></>)}
        {auto.length > 0 && (
          <ul className={ui.list(true, 'mt-3')}>
            {auto.map((l) => (
              <li key={l.key} className="flex items-center justify-between px-3 py-2">
                <span><b>{l.label}</b> <small className="text-muted">{tr('automatic')}</small></span>
                <b className={`tabular-nums ${l.amount > 0 ? 'text-good' : l.amount < 0 ? 'text-bad' : ''}`}>{l.amount < 0 ? '−' : ''}{fmtINR(Math.abs(l.amount))}</b>
              </li>
            ))}
          </ul>
        )}
      </div>

      {moves.length > 0 && (
        <div className={ui.card()}>
          <h3>{tr('What moved since the last check-in')}</h3>
          <ul className="m-0 list-none p-0 text-[14px]">
            {moves.map((m) => <li key={m.id} className="flex justify-between py-0.5"><span>{m.name}</span><b className={`tabular-nums ${m.change > 0 ? 'text-good' : 'text-bad'}`}>{m.change > 0 ? '▲ ' : '▼ '}{fmtINR(Math.abs(m.change))}</b></li>)}
          </ul>
        </div>
      )}

      <div className={ui.card()}>
        <h3>{tr('Where it sits')}</h3>
        <ul className="m-0 list-none p-0">
          {sum.byClass.map((c) => (
            <li key={`${c.side}${c.cls}`} className="py-1">
              <div className="flex justify-between text-[14px]"><span>{classLabel(c.side, c.cls)}{c.side === 'd' ? ` (${tr('owed')})` : ''}</span><b className="tabular-nums">{fmtINR(c.amount)}</b></div>
              <div className={ui.meter(c.side === 'd' ? 'bad' : 'accent', 'mt-1 mb-0')} aria-hidden="true"><i style={{ width: `${total > 0 ? Math.max(2, Math.round((c.amount / total) * 100)) : 0}%` }} /></div>
            </li>
          ))}
        </ul>
        <p className="mt-3 mb-0 text-[14px]">{tr('Cash and bank: {0}. Everything else you own: {1}.', fmtINR(sum.liquid), fmtINR(Math.max(0, sum.assets - sum.liquid)))}</p>
        {runway !== null ? <p className="mt-1 mb-0 text-[14px]">{tr('Your cash and bank would cover about {0} months of a usual month\'s spending ({1}).', runway, fmtINR(usual))}</p> : <p className="mt-1 mb-0 text-[13px] text-muted">{tr('How long your cash and bank would last shows once there is a month or two of spending.')}</p>}
        {share !== null && sum.debts > 0 && <p className="mt-1 mb-0 text-[14px]">{tr('Your debts are {0} of what you own.', pct(share))}</p>}
      </div>
      {toggles}
    </>
  );
}

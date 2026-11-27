import { useState } from 'react';
import { fromChoice, monthStart, shareFrom } from '../../core/groupShares.ts';
import { shortDate } from '../../core/format.ts';
import { isoDate } from '../../core/logic.ts';
import type { Group } from '../../core/groups.ts';
import { shareSwitches, sharesFrom } from '../../data/phonePrefs.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Does your share of what others add in this group count in your own Month? On for flatmates and couples (the running costs of one home),
// off for families and trips, and yours to change. Kept on this device only. Version 2.1, from the design: when it is on, you choose from
// which day it counts (the start of this month unless you pick another), so this month's budget can already have the group in it.

function fromNote(choice: 'month' | 'today' | 'pick', from: string): string {
  if (choice === 'month') return tr('Your share of expenses from {0}, the start of this month, counts in your budgets. Earlier ones stay out.', shortDate(from));
  if (choice === 'today') return tr('Your share of expenses from today, {0}, counts in your budgets. Earlier ones stay out.', shortDate(from));
  return tr('Your share of expenses from the day you pick counts in your budgets, in the month each one was spent.');
}

function CountedFrom({ from, today, onPick }: Readonly<{ from: string; today: string; onPick: (day: string) => void }>) {
  const [picking, setPicking] = useState(false);
  const choice = picking ? 'pick' : fromChoice(from, today);
  const start = monthStart(today);
  return (
    <div className="flex flex-col gap-2">
      <fieldset className={ui.chipsBare}>
        <legend>{tr('Counted from')}</legend>
        <button type="button" className={ui.chipTick} aria-pressed={choice === 'month'} onClick={() => { setPicking(false); onPick(start); }}>{tr('Start of this month · {0}', shortDate(start))}</button>
        <button type="button" className={ui.chipTick} aria-pressed={choice === 'today'} onClick={() => { setPicking(false); onPick(today); }}>{tr('Today · {0}', shortDate(today))}</button>
        <button type="button" className={ui.chipTick} aria-pressed={choice === 'pick'} onClick={() => setPicking(true)}>{tr('Another day')}</button>
      </fieldset>
      {choice === 'pick' && (
        <label className={ui.cx(ui.field, 'mt-0')}>
          <span>{tr('The day')}</span>
          <input type="date" value={from} max={today} onChange={(e) => { if (e.target.value) onPick(e.target.value); }} />
        </label>
      )}
      <p className="m-0 text-[13px] leading-[18px] text-muted">{fromNote(choice, from)}</p>
    </div>
  );
}

export function ShareCountCard({ group }: Readonly<{ group: Group }>) {
  const sw = shareSwitches.use();
  const today = isoDate();
  const from = shareFrom(group, sw, sharesFrom.use() || today);
  const save = (on: boolean, day: string) => shareSwitches.save({ ...sw, [group.id]: { on, from: day } });
  return (
    <section className="bg-card border border-line rounded-card px-4 pt-1 pb-4 flex flex-col gap-2.5">
      <label className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[72px] cursor-pointer">
        <span className="flex flex-col gap-0.5">
          <span className="text-[16px] font-[650]">{tr('In my month')}</span>
          <span className="text-[13px] leading-[18px] text-muted">{tr("Count my share of this group's expenses in my budgets.")}</span>
        </span>
        <input type="checkbox" role="switch" className={ui.switchBox} aria-label={tr('In my month')} checked={from !== null} onChange={(e) => save(e.target.checked, monthStart(today))} />
      </label>
      {from === null
        ? <p className="m-0 text-[13px] leading-[18px] text-muted">{tr("Off: none of this group's expenses count in your budgets. Turn it on to choose from which day.")}</p>
        : <CountedFrom from={from} today={today} onPick={(day) => save(true, day)} />}
    </section>
  );
}

import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { checkInAsks, dayBeforeMonth, settingsOf, workedForYou } from '../../core/accounts.ts';
import { checkInDay } from '../../core/features.ts';
import type { Ask } from '../../core/accounts.ts';
import { ordinal, shortDate } from '../../core/format.ts';
import type { WorthItem } from '../../core/goals.ts';
import { fmtINR, isoDate, parseAmount } from '../../core/logic.ts';
import type { WorthView } from './useWorth.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The monthly check-in (version 2.3, from the design): "Only the figures the app cannot work out. The rest moved with your payments."
// Market values, a yes or no on each bank balance (a "no" shows what went out unlogged, to add to Other or leave out), and the items kept
// by hand; then what was worked out for you, and Save check-in.

const readAmount = (text: string): number | null => (text.trim() === '0' ? 0 : parseAmount(text));
type BankAnswer = { same: boolean | null; text: string; gap: 'add' | 'leave' | null };
const EMPTY_BANK: BankAnswer = { same: null, text: '', gap: null };

/** A bank's answer, checked: the figure it holds and what went out unlogged to add to Other (0 for none), or what is missing. */
function readBank(a: Ask, b: BankAnswer): { value: number; addGap: number } | string {
  if (b.same === null) return tr('Say whether {0} holds about that.', a.name);
  const n = b.same ? a.expected : readAmount(b.text);
  if (n === null) return tr('Enter what {0} holds today, with at most two decimals.', a.name);
  const gap = Math.round((a.expected - n) * 100) / 100;
  if (gap > 0 && b.gap === null) return tr('Choose whether to add what went out from {0} to Other.', a.name);
  return { value: n, addGap: gap > 0 && b.gap === 'add' ? gap : 0 };
}

function MarketAsk({ a, item, text, onText }: Readonly<{ a: Ask; item: WorthItem; text: string; onText: (t: string) => void }>) {
  const n = readAmount(text);
  const diff = n === null ? null : n - a.expected;
  const base = fmtINR(a.expected - a.put);
  return (
    <div className="flex flex-col gap-2 py-3">
      <span className="text-[16px] font-[650]">{a.name}</span>
      <span className="text-[13px] text-muted">{a.put > 0 ? tr('{0} on {1}, plus your {2} put in. What is it worth today?', base, shortDate(item.d), fmtINR(a.put)) : tr('{0} on {1}. What is it worth today?', base, shortDate(item.d))}</span>
      <input inputMode="decimal" aria-label={tr('What {0} is worth today', a.name)} value={text} onChange={(e) => onText(e.target.value)} />
      {diff !== null && diff !== 0 && <span className={ui.cx('text-[13px] font-semibold', diff > 0 ? 'text-good' : 'text-bad')}>{diff > 0 ? tr('{0} more than you put in: the market', fmtINR(diff)) : tr('{0} less than you put in: the market', fmtINR(-diff))}</span>}
    </div>
  );
}

function BankAsk({ a, answer, onAnswer }: Readonly<{ a: Ask; answer: BankAnswer; onAnswer: (b: BankAnswer) => void }>) {
  const n = readAmount(answer.text);
  const gap = answer.same === false && n !== null ? Math.round((a.expected - n) * 100) / 100 : 0;
  const choice = (on: boolean) => ui.cx('flex-1 min-h-11 rounded-xl border text-[15px] font-[650] cursor-pointer [font-family:inherit]', on ? 'border-accent bg-good-bg text-brand' : 'border-control-line bg-transparent text-brand');
  return (
    <div className="flex flex-col gap-2 py-3">
      <span className="text-[16px] font-[650]">{a.name}</span>
      <span className="text-[14px]">{tr('From your payments it should be about')} <strong className="tabular-nums">{fmtINR(a.expected)}</strong>. {tr('Is it?')}</span>
      <div className="flex gap-2">
        <button type="button" className={choice(answer.same === true)} aria-pressed={answer.same === true} onClick={() => onAnswer({ ...answer, same: true })}>{tr('Yes, about that')}</button>
        <button type="button" className={choice(answer.same === false)} aria-pressed={answer.same === false} onClick={() => onAnswer({ ...answer, same: false })}>{tr('No, it is different')}</button>
      </div>
      {answer.same === false && <input inputMode="decimal" aria-label={tr('What {0} holds today', a.name)} value={answer.text} onChange={(e) => onAnswer({ ...answer, text: e.target.value, gap: null })} />}
      {gap > 0 && (
        <div className="flex flex-col gap-2 bg-warn-bg rounded-xl p-3">
          <span className="text-[14px] leading-5"><strong>{tr('{0} went out that you did not log', fmtINR(gap))}</strong>. {tr('Cash, or a payment you forgot. Add it so your budgets show what really left the account.')}</span>
          <div className="flex gap-2">
            <button type="button" className={ui.btn(answer.gap === 'add' ? 'solid' : 'outline', 'none', 'min-h-10 px-3.5 text-[14px]')} aria-pressed={answer.gap === 'add'} onClick={() => onAnswer({ ...answer, gap: 'add' })}>{tr('Add {0} to Other', fmtINR(gap))}</button>
            <button type="button" className={ui.btn(answer.gap === 'leave' ? 'solid' : 'outline', 'none', 'min-h-10 px-3.5 text-[14px]')} aria-pressed={answer.gap === 'leave'} onClick={() => onAnswer({ ...answer, gap: 'leave' })}>{tr('Leave it out')}</button>
          </div>
        </div>
      )}
      {gap < 0 && <span className="text-[13px] text-muted">{tr('{0} more than the app worked out: money received that you did not log?', fmtINR(-gap))}</span>}
    </div>
  );
}

// What went out unlogged belongs to the month it left in: found at a check-in on the 1st, it is dated the day before (last month).
const gapDate = (today: string): string => (today.endsWith('-01') ? dayBeforeMonth(today) : today);

// "Remind me on the 1st each month": the day the check-in note comes up on the bell.
function CheckInDay() {
  const app = useApp();
  const day = checkInDay(app.goals);
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 items-center">
      <span className="text-[14px]">{tr('Remind me each month on the')}</span>
      <select value={day} aria-label={tr('The day of the month for the check-in')} onChange={(e) => void app.setCheckInDay(Number(e.target.value))}>
        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
      </select>
    </label>
  );
}

export function AccountsCheckIn({ view, onDone }: Readonly<{ view: WorthView; onDone: () => void }>) {
  const app = useApp();
  const asks = useMemo(() => checkInAsks(app.goals, view.worked, view.today), [app.goals, view.worked, view.today]);
  const forYou = useMemo(() => workedForYou(app.goals, view.worked, view.today), [app.goals, view.worked, view.today]);
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(asks.filter((a) => a.kind !== 'bank').map((a) => [a.id, String(a.expected)])));
  const [banks, setBanks] = useState<Record<string, BankAnswer>>(() => Object.fromEntries(asks.filter((a) => a.kind === 'bank').map((a) => [a.id, { same: null, text: String(a.expected), gap: null }])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const itemOf = (id: string) => app.goals[id] as WorthItem;

  const collect = (): { answers: Record<string, number>; gaps: { id: string; amount: number }[] } | string => {
    const answers: Record<string, number> = {};
    const gaps: { id: string; amount: number }[] = [];
    for (const a of asks) {
      if (a.kind === 'bank') {
        const r = readBank(a, banks[a.id] ?? EMPTY_BANK);
        if (typeof r === 'string') return r;
        if (r.addGap > 0) gaps.push({ id: a.id, amount: r.addGap });
        answers[a.id] = r.value;
        continue;
      }
      const n = readAmount(texts[a.id] ?? '');
      if (n === null) return tr('Enter a figure for {0}, with at most two decimals.', a.name);
      answers[a.id] = n;
    }
    return { answers, gaps };
  };

  const save = async () => {
    const c = collect();
    if (typeof c === 'string') return setError(c);
    setBusy(true);
    const date = gapDate(isoDate());
    for (const g of c.gaps) {
      const method = settingsOf(itemOf(g.id))?.pay[0] ?? null;
      await app.addEntry({ amount: g.amount, category: 'Other', method, note: tr('Not logged, found at the check-in'), date });
    }
    await app.checkInAccounts(c.answers, view.auto);
    setBusy(false);
    app.toast(tr('Check-in saved'));
    onDone();
  };

  const autoText = view.auto.filter((l) => l.amount !== 0).map((l) => `${l.label} ${fmtINR(Math.abs(l.amount))}`);
  const summary = [...forYou.map((f) => `${f.name} ${fmtINR(f.value)}`), ...autoText].join(', ');
  return (
    <section className="flex flex-col gap-3" aria-label={tr('Check in')}>
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 text-[20px] font-bold">{tr('Check in')}</h3>
        <p className="m-0 text-[14px] text-muted">{asks.length === 1 ? tr('Only the 1 figure the app cannot work out. The rest moved with your payments.') : tr('Only the {0} figures the app cannot work out. The rest moved with your payments.', asks.length)}</p>
      </div>
      <div className="flex flex-col px-4 bg-card border border-line rounded-card [&>*+*]:border-t [&>*+*]:border-line">
        {asks.map((a) => {
          if (a.kind === 'market') return <MarketAsk key={a.id} a={a} item={itemOf(a.id)} text={texts[a.id] ?? ''} onText={(t) => { setTexts({ ...texts, [a.id]: t }); setError(''); }} />;
          if (a.kind === 'bank') return <BankAsk key={a.id} a={a} answer={banks[a.id] ?? { ...EMPTY_BANK, text: String(a.expected) }} onAnswer={(b) => { setBanks({ ...banks, [a.id]: b }); setError(''); }} />;
          return (
            <label key={a.id} className="flex flex-col gap-2 py-3">
              <span className="text-[16px] font-[650]">{a.name}</span>
              <input inputMode="decimal" value={texts[a.id] ?? ''} onChange={(e) => { setTexts({ ...texts, [a.id]: e.target.value }); setError(''); }} />
            </label>
          );
        })}
      </div>
      {summary && <p className="m-0 text-[13px] leading-[19px] text-muted">{tr('Worked out for you: {0}.', summary)}</p>}
      <CheckInDay />
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className="flex gap-2.5 [&>*]:flex-1">
        <button type="button" className={ui.btn()} disabled={busy} onClick={() => void save()}>{tr('Save check-in')}</button>
        <button type="button" className={ui.btn('outline')} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </section>
  );
}

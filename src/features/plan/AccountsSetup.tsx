import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../../data/context.tsx';
import { NO_SETTINGS } from '../../core/accounts.ts';
import type { AccountSettings } from '../../core/accounts.ts';
import type { WorthItem } from '../../core/goals.ts';
import { catKey, fmtINR, parseAmount } from '../../core/logic.ts';
import type { Method } from '../../core/logic.ts';
import { classLabel, worthItems } from '../../core/worth.ts';
import type { WorthView } from './useWorth.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The one-time set-up (version 2.3, from the design: "Once, about two minutes. After this your payments keep the figures up to date"): where
// money received lands, what each way of paying takes money from, how the card bill is logged, where the saving categories go, and what
// each account holds today, typed this once. Items left out stay as they are, kept by hand.

type Grow = 'plain' | 'interest' | 'market';
const PAYS: { m: Method; label: () => string }[] = [
  { m: 'UPI', label: () => tr('UPI') },
  { m: 'Card', label: () => tr('Card (debit or credit)') },
  { m: 'Cash', label: () => tr('Cash') },
];
const RATE = /^\d{1,2}(\.\d{1,2})?$/;
const GROW_LABEL: Record<Grow, () => string> = { plain: () => tr('By hand'), interest: () => tr('Interest'), market: () => tr('Market value') };
const SELECT_ROW = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 items-center min-h-14';

function Pick({ label, value, options, none, onChange }: Readonly<{ label: string; value: string; options: WorthItem[]; none: string; onChange: (id: string) => void }>) {
  return (
    <label className={SELECT_ROW}>
      <span className="text-[15px] font-semibold">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{none}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.n}</option>)}
      </select>
    </label>
  );
}

function Question({ title, hint, children }: Readonly<{ title: string; hint: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-1 bg-card border border-line rounded-card px-4 py-3">
      <h4 className="m-0 text-[16px] font-[650]">{title}</h4>
      <p className="m-0 text-[13px] text-muted">{hint}</p>
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
    </section>
  );
}

interface Choices { salary: string; pay: Partial<Record<Method, string>>; cardBill: Record<string, string>; savings: Record<string, string> }

/** Each chosen account's settings, from the answers. A card is set up only when its bill is logged under a category (otherwise kept by hand). */
function settingsFrom(c: Choices, grow: Readonly<Record<string, Grow>>, rates: Readonly<Record<string, string>>): Record<string, AccountSettings> {
  const out: Record<string, AccountSettings> = {};
  const get = (id: string) => (out[id] ??= { ...NO_SETTINGS, pay: [], cat: [] });
  if (c.salary) get(c.salary).inc = true;
  for (const [m, id] of Object.entries(c.pay)) if (id && !(id in c.cardBill && !c.cardBill[id])) get(id).pay.push(m as Method); // a card kept by hand takes no payments
  for (const [id, cat] of Object.entries(c.cardBill)) if (cat) get(id).cat.push(cat);
  for (const [cat, id] of Object.entries(c.savings)) if (id) get(id).cat.push(cat);
  for (const [id, g] of Object.entries(grow)) if (g !== 'plain') setGrowth(get(id), g, rates[id]);
  return out;
}

// An investment grows by a market value (asked at the check-in) or by interest at the rate typed.
function setGrowth(s: AccountSettings, g: Exclude<Grow, 'plain'>, rate: string | undefined): void {
  if (g === 'market') s.mk = true;
  else s.ir = Number(rate ?? 0);
}

export function AccountsSetup({ view, onAdd, onDone }: Readonly<{ view: WorthView; onAdd: () => void; onDone: () => void }>) {
  const app = useApp();
  const { assets, debts } = useMemo(() => worthItems(app.goals, view.today, view.worked), [app.goals, view.today, view.worked]);
  const banks = assets.filter((i) => i.c === 'liquid');
  const cards = debts.filter((i) => i.c === 'card');
  const growing = assets.filter((i) => i.c !== 'liquid');
  const savingCats = app.categories.filter((c) => c.group === 'Saving').map((c) => c.name);
  const billGuess = app.categories.find((c) => /card/i.test(c.name))?.name ?? ''; // "Credit card bill"; not Bills, which are utilities
  const [choices, setChoices] = useState<Choices>({ salary: banks[0]?.id ?? '', pay: { UPI: banks[0]?.id ?? '', Card: cards[0]?.id ?? banks[0]?.id ?? '' }, cardBill: Object.fromEntries(cards.map((c) => [c.id, billGuess])), savings: {} });
  const [grow, setGrow] = useState<Record<string, Grow>>({});
  const [rates, setRates] = useState<Record<string, string>>({});
  const [figures, setFigures] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const settings = settingsFrom(choices, grow, rates);
  const chosen = [...assets, ...debts].filter((i) => settings[i.id]);
  const figureOf = (i: WorthItem) => figures[i.id] ?? String(i.a);

  const save = async () => {
    if (chosen.length === 0) return setError(tr('Choose at least one account above.'));
    const bad = Object.entries(grow).find(([id, g]) => g === 'interest' && !(RATE.test((rates[id] ?? '').trim()) && Number(rates[id]) > 0 && Number(rates[id]) <= 30));
    if (bad) return setError(tr('The yearly interest rate must be above 0 and at most 30, with at most two decimals.'));
    const typed: Record<string, number> = {};
    for (const i of chosen) {
      const text = figureOf(i).trim();
      const n = text === '0' ? 0 : parseAmount(text);
      if (n === null) return setError(tr('Enter what {0} holds today, with at most two decimals.', i.n));
      typed[i.id] = n;
    }
    await app.setUpAccounts({ settings, figures: typed }, view.auto);
    app.toast(tr('Your net worth is worked out from your accounts now'));
    onDone();
  };

  if (banks.length === 0) {
    return (
      <section className="flex flex-col gap-3 bg-card border border-line rounded-card p-4">
        <h3 className="m-0 text-[18px] font-bold">{tr('Your accounts')}</h3>
        <p className="m-0 text-[14px] leading-5">{tr('Add your bank account first (Cash and bank), then set up your accounts here.')}</p>
        <div className="flex gap-2.5 [&>*]:flex-1"><button type="button" className={ui.btn()} onClick={onAdd}>{tr('Add an item')}</button><button type="button" className={ui.btn('outline')} onClick={onDone}>{tr('Cancel')}</button></div>
      </section>
    );
  }
  const accountsForPay = [...banks, ...cards];
  return (
    <section className="flex flex-col gap-3" aria-label={tr('Your accounts')}>
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 text-[20px] font-bold">{tr('Your accounts')}</h3>
        <p className="m-0 text-[14px] text-muted">{tr('Once, about two minutes. After this your payments keep the figures up to date.')}</p>
      </div>
      <Question title={tr('Where does your salary land?')} hint={tr('Money you log as received goes here.')}>
        <Pick label={tr('Money you receive')} value={choices.salary} options={banks} none={tr('Not tracked')} onChange={(id) => setChoices({ ...choices, salary: id })} />
      </Question>
      <Question title={tr('What do you pay with?')} hint={tr('Each way of paying takes money from one account. A payment with none set comes from the UPI account.')}>
        {PAYS.map((p) => <Pick key={p.m} label={p.label()} value={choices.pay[p.m] ?? ''} options={accountsForPay} none={p.m === 'Cash' ? tr('Do not track cash') : tr('Not tracked')} onChange={(id) => setChoices({ ...choices, pay: { ...choices.pay, [p.m]: id } })} />)}
      </Question>
      {cards.length > 0 && (
        <Question title={tr('How do you log the card bill?')} hint={tr('Paying the bill moves money from the bank to the card: it does not change your net worth.')}>
          {cards.map((c) => (
            <label key={c.id} className={SELECT_ROW}>
              <span className="text-[15px] font-semibold">{c.n}</span>
              <select value={choices.cardBill[c.id] ?? ''} aria-label={tr('The category of the {0} bill', c.n)} onChange={(e) => setChoices({ ...choices, cardBill: { ...choices.cardBill, [c.id]: e.target.value } })}>
                <option value="">{tr('Keep it by hand')}</option>
                {app.categories.map((k) => <option key={k.name} value={k.name}>{k.name}</option>)}
              </select>
            </label>
          ))}
        </Question>
      )}
      {savingCats.length > 0 && growing.length > 0 && (
        <Question title={tr('Where do your savings go?')} hint={tr('From your Saving categories.')}>
          {savingCats.map((cat) => <Pick key={catKey(cat)} label={cat} value={choices.savings[cat] ?? ''} options={growing} none={tr('Not tracked')} onChange={(id) => setChoices({ ...choices, savings: { ...choices.savings, [cat]: id } })} />)}
        </Question>
      )}
      {growing.length > 0 && (
        <Question title={tr('How does each investment grow?')} hint={tr('Interest for FD, RD or PPF; a market value, asked at the check-in, for mutual funds or stocks.')}>
          {growing.map((g) => (
            <div key={g.id} className="flex flex-col gap-2 py-2.5">
              <span className="text-[15px] font-semibold">{g.n}</span>
              <div className={ui.segment(3)} role="radiogroup" aria-label={tr('How {0} grows', g.n)}>
                {(['plain', 'interest', 'market'] as const).map((k) => <button key={k} type="button" role="radio" className={ui.segBtn} aria-checked={(grow[g.id] ?? 'plain') === k} onClick={() => setGrow({ ...grow, [g.id]: k })}>{GROW_LABEL[k]()}</button>)}
              </div>
              {grow[g.id] === 'interest' && <label className={ui.fieldBare}><span>{tr('Yearly interest rate (%)')}</span><input inputMode="decimal" value={rates[g.id] ?? ''} onChange={(e) => { setRates({ ...rates, [g.id]: e.target.value }); setError(''); }} /></label>}
            </div>
          ))}
        </Question>
      )}
      {chosen.length > 0 && (
        <Question title={tr('What each holds today')} hint={tr('The only time you type these. From here on they move by themselves.')}>
          {chosen.map((i) => (
            <label key={i.id} className={SELECT_ROW}>
              <span className="flex flex-col"><span className="text-[15px] font-semibold">{i.n}</span><span className="text-[12px] text-muted">{classLabel(i.s, i.c)}</span></span>
              <input inputMode="decimal" className="text-right" aria-label={tr('What {0} holds today', i.n)} value={figureOf(i)} onChange={(e) => { setFigures({ ...figures, [i.id]: e.target.value }); setError(''); }} />
            </label>
          ))}
        </Question>
      )}
      <p className="m-0 text-[13px] leading-[19px] text-muted">{tr('Your old typed figures stay in the history. Anything you do not set up here stays as you typed it, and the check-in asks for it.')}</p>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className="flex gap-2.5 [&>*]:flex-1">
        <button type="button" className={ui.btn()} onClick={() => void save()}>{tr('Save and work it out')}</button>
        <button type="button" className={ui.btn('outline')} onClick={onDone}>{tr('Cancel')}</button>
      </div>
      <p className="m-0 text-[12px] text-muted">{tr('Net worth now, before the set-up: {0}', fmtINR(view.summary.net))}</p>
    </section>
  );
}

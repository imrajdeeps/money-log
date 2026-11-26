import { useApp } from '../../data/context.tsx';
import { useSpendEntries } from '../../data/useSpendEntries.ts';
import { worthAuto } from '../../data/phonePrefs.ts';
import { groupLookup } from '../../core/analytics.ts';
import { budgetEntries, fmtINR, isoDate } from '../../core/logic.ts';
import { classLabel, debtShare, groupsNet, isEstimated, movedUp, runwayMonths, usualMonthlySpend, valueNow, worthItems, worthMoves, worthSummary } from '../../core/worth.ts';
import { udhaarTotals } from '../../core/udhaar.ts';
import type { AutoLine, WorthItem } from '../../core/worth.ts';
import { WorthCheckIn } from './WorthCheckIn.tsx';
import { WorthForm } from './WorthForm.tsx';
import { useAutoLines } from './useAutoLines.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const pct = (f: number): string => `${Math.round(f * 100)}%`;

const SECTION_H = 'm-0 text-[16px] leading-[22px] font-[650] text-ink';

function Row({ item, today, onEdit, first }: Readonly<{ item: WorthItem; today: string; onEdit: () => void; first: boolean }>) {
  return (
    <li>
      <button type="button" className={ui.cx(ROW, first ? 'border-t-0' : 'border-t')} onClick={onEdit} aria-label={tr('Change {0}', item.n)}>
        <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold truncate">{item.n}</span><span className="text-[13px] text-muted truncate">{classLabel(item.s, item.c)}{item.e > 0 ? ` · ${tr('EMI {0}', fmtINR(item.e))}${item.r > 0 ? ` ${tr('at {0}% a year', item.r)}` : ''}` : ''}</span></span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-[16px] font-bold tabular-nums">{fmtINR(valueNow(item, today))}</span>
          {isEstimated(item, today) && <span className="px-1.5 py-px rounded-md bg-press text-[11px] font-semibold">{tr('estimated')}</span>}
        </span>
      </button>
    </li>
  );
}
const ROW = 'w-full grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[62px] py-2 px-0 border-0 border-line bg-transparent text-ink text-left cursor-pointer [font-family:inherit] [line-height:inherit]';

function AutoRow({ line, first }: Readonly<{ line: AutoLine; first: boolean }>) {
  return (
    <li className={ui.cx('grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[62px] py-2', first ? '' : 'border-t border-line')}>
      <span className="flex flex-col"><span className="text-[15px] font-semibold">{line.label}</span><span className="text-[13px] text-muted">{tr('automatic')}</span></span>
      <span className={ui.cx('text-[16px] font-bold tabular-nums', line.amount > 0 ? 'text-good' : 'text-bad')}>{fmtINR(Math.abs(line.amount))}</span>
    </li>
  );
}

type Summary = ReturnType<typeof worthSummary>;

// One side of the list ("What you own", "What you owe"): its total and a card of rows.
function Side({ title, total, items, lines, today, onEdit }: Readonly<{ title: string; total: number; items: WorthItem[]; lines: AutoLine[]; today: string; onEdit: (i: WorthItem) => void }>) {
  if (items.length + lines.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline"><h3 className={SECTION_H}>{title}</h3><span className="text-[14px] font-bold tabular-nums">{fmtINR(total)}</span></div>
      <ul className="list-none m-0 px-4 bg-card border border-line rounded-card">
        {items.map((i, n) => <Row key={i.id} item={i} today={today} onEdit={() => onEdit(i)} first={n === 0} />)}
        {lines.map((l, n) => <AutoRow key={l.key} line={l} first={items.length === 0 && n === 0} />)}
      </ul>
    </section>
  );
}

// Which automatic lines are on (group balances, Udhaar): switches, each the person's choice, kept on this phone only.
function AutoToggles() {
  const app = useApp();
  const on = worthAuto.use();
  const groups = groupsNet(app.groups, app.groupEntries, app.settlements, app.me);
  const u = udhaarTotals(app.goals);
  const rows = [
    { key: 'groups' as const, title: tr('Group balances'), sub: groups === 0 ? tr('All settled across groups') : groups > 0 ? tr('Owed to you {0} across groups', fmtINR(groups)) : tr('You owe {0} across groups', fmtINR(-groups)) },
    { key: 'udhaar' as const, title: tr('Udhaar'), sub: [u.owedToMe > 0 ? tr('Owed to you {0}', fmtINR(u.owedToMe)) : '', u.iOwe > 0 ? tr('you owe {0}', fmtINR(u.iOwe)) : ''].filter(Boolean).join(' · ') || tr('All settled') },
  ];
  return (
    <section className="bg-card border border-line rounded-card px-4 py-1">
      <h3 className="m-0 pt-3 text-[13px] font-semibold text-muted">{tr('Add automatically')}</h3>
      {rows.map((r, i) => (
        <label key={r.key} className={ui.cx('grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-16 cursor-pointer', i > 0 && 'border-t border-line')}>
          <span className="flex flex-col"><span className="text-[16px] font-semibold">{r.title}</span><span className="text-[13px] text-muted">{r.sub}</span></span>
          <input type="checkbox" role="switch" className={ui.switchBox} checked={on[r.key]} onChange={(e) => worthAuto.save({ ...on, [r.key]: e.target.checked })} />
        </label>
      ))}
      <p className="m-0 pb-3 text-[13px] text-muted">{tr('Worked out from what the app already holds, so do not also type them as items. The figure is counted in each check-in.')}</p>
    </section>
  );
}

// The biggest changes since the last check-in: the arrow follows the item's own number, the colour says whether net worth got better.
function MovesCard({ moves }: Readonly<{ moves: ReturnType<typeof worthMoves> }>) {
  const words = (m: (typeof moves)[number]) => {
    const amt = fmtINR(Math.abs(m.change));
    if (m.side === 'a') return m.change > 0 ? `+${amt}` : `−${amt}`;
    return m.change > 0 ? tr('{0} less owed', amt) : tr('{0} more owed', amt);
  };
  return (
    <section className="flex flex-col gap-2">
      <h3 className={SECTION_H}>{tr('What moved since the last check-in')}</h3>
      <ul className="list-none m-0 px-4 py-1 bg-card border border-line rounded-card">
        {moves.map((m, i) => (
          <li key={m.id} className={ui.cx('flex justify-between gap-3 items-center min-h-12', i > 0 && 'border-t border-line')}>
            <span className="text-[15px]">{movedUp(m) ? '▲ ' : '▼ '}{m.name}</span>
            <span className={ui.cx('text-[15px] font-bold tabular-nums', m.change > 0 ? 'text-good' : 'text-bad')}>{words(m)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Where the money sits (what is owned, by kind, as a share of it), cash and bank against the rest, and the two honest numbers: how long the
// cash would last, and the debts against what is owned.
function SitsCard({ sum, today, spend }: Readonly<{ sum: Summary; today: string; spend: ReturnType<typeof useSpendEntries> }>) {
  const app = useApp();
  const usual = usualMonthlySpend(budgetEntries(spend, app.me), groupLookup(app.categories), today);
  const runway = runwayMonths(sum.liquid, usual);
  const share = debtShare(sum.assets, sum.debts);
  const owned = sum.byClass.filter((c) => c.side === 'a');
  return (
    <section className="flex flex-col gap-2">
      <h3 className={SECTION_H}>{tr('Where it sits')}</h3>
      <div className="flex flex-col gap-3 bg-card border border-line rounded-card p-4">
        {owned.map((c) => {
          const f = sum.assets > 0 ? c.amount / sum.assets : 0;
          return (
            <div key={`${c.side}${c.cls}`} className="flex flex-col gap-1">
              <div className="flex justify-between text-[14px]"><span className="font-semibold">{classLabel(c.side, c.cls)}</span><span><span className="text-muted">{pct(f)}</span> · <strong className="tabular-nums">{fmtINR(c.amount)}</strong></span></div>
              <span className="flex h-2 rounded-full bg-track" aria-hidden="true"><span className="rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round(f * 100))}%` }} /></span>
            </div>
          );
        })}
        <div className="flex flex-col gap-2 pt-1 border-t border-line text-[14px] leading-5">
          <p className="m-0 pt-2">{tr('Cash and bank:')} <strong>{fmtINR(sum.liquid)}</strong>. {tr('Everything else you own:')} <strong>{fmtINR(Math.max(0, sum.assets - sum.liquid))}</strong>.</p>
          {runway !== null
            ? <p className="m-0">{tr('Your cash and bank would cover about')} <strong>{tr('{0} months', runway)}</strong> {tr('of a usual month\'s spending ({0}).', fmtINR(usual))}</p>
            : <p className="m-0 text-[13px] text-muted">{tr('How long your cash and bank would last shows once there is a month or two of spending.')}</p>}
          {share !== null && sum.debts > 0 && <p className="m-0">{tr('Your debts are')} <strong>{pct(share)}</strong> {tr('of what you own.')}</p>}
        </div>
      </div>
    </section>
  );
}

export type WorthMode = null | 'add' | 'checkin' | WorthItem;

// What the net worth is made of: the things owned and owed, what moved, where it sits, and the automatic lines. The green tile above
// opens the forms (mode).
export function WorthPanel({ mode, setMode }: Readonly<{ mode: WorthMode; setMode: (m: WorthMode) => void }>) {
  const app = useApp();
  const today = isoDate();
  const auto = useAutoLines();
  const spend = useSpendEntries(); // read here, as before the split: the hook also sets the day your share starts counting, whichever form is open
  const { assets, debts } = worthItems(app.goals, today);
  const none = assets.length + debts.length === 0;
  const sum = worthSummary(app.goals, today, auto);
  const moves = worthMoves(app.goals, today);

  const form = mode === 'add' ? <WorthForm auto={auto} onDone={() => setMode(null)} />
    : mode === 'checkin' ? <WorthCheckIn auto={auto} onDone={() => setMode(null)} />
      : mode ? <WorthForm key={mode.id} item={mode} auto={auto} onDone={() => setMode(null)} /> : null;
  if (none) return <>{form}<AutoToggles /></>;

  return (
    <>
      {form}
      <Side title={tr('What you own')} total={sum.assets} items={assets} lines={auto.filter((l) => l.amount > 0)} today={today} onEdit={setMode} />
      <Side title={tr('What you owe')} total={sum.debts} items={debts} lines={auto.filter((l) => l.amount < 0)} today={today} onEdit={setMode} />
      {moves.length > 0 && <MovesCard moves={moves} />}
      <SitsCard sum={sum} today={today} spend={spend} />
      <AutoToggles />
    </>
  );
}

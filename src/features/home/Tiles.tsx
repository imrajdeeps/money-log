import { useApp } from '../../data/context.tsx';
import { BentoCard, BentoEmpty } from '../../ui/Bento.tsx';
import { BudgetLine } from '../../ui/BudgetLine.tsx';
import { RecentList } from '../payments/index.ts';
import { monthLabel, shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import type { Group } from '../../core/logic.ts';
import type { netNow } from '../../core/goals.ts';
import type { cashFlow } from '../../core/income.ts';
import type { udhaarTotals } from '../../core/udhaar.ts';
import type { CoupleTile as Couple, GoalTile, MonthOverview, dueOverview, groupsOverview, topCategories } from './dashboard.ts';
import type { Section } from './HomeScreen.tsx';
import * as hs from '../../ui/tileStyles.ts';
import { tr } from '../../core/i18n.ts';

const whole = (f: number): string => `${Math.round(f * 100)}%`;
type Open = (s: Section, anchor?: string) => void;

// What each Overview tile shows, as drawn on the design canvas. HomeScreen decides which tiles are drawn and in what order.

/** The net worth's last few updates as a 200 by 36 line (the design's spark line), or null when there are fewer than two. */
function sparkPoints(history: readonly number[]): string | null {
  if (history.length < 2) return null;
  const lo = Math.min(...history);
  const hi = Math.max(...history);
  const span = hi - lo || 1;
  return history.map((v, i) => `${((i / (history.length - 1)) * 200).toFixed(1)},${(32 - ((v - lo) / span) * 26).toFixed(1)}`).join(' ');
}

export function NetWorthTile({ net, history, open }: Readonly<{ net: ReturnType<typeof netNow>; history: readonly number[]; open: Open }>) {
  if (!net) {
    return (
      <BentoCard title={tr('Net worth')} span={4}>
        <BentoEmpty cta={tr('Add your net worth')} onCta={() => open('plan', 'networth')}>
          {tr('Add what you own minus what you owe, and update it now and then to see it move.')}
        </BentoEmpty>
      </BentoCard>
    );
  }
  const points = sparkPoints(history);
  return (
    <BentoCard title={tr('Net worth')} span={4} chevron onOpen={() => open('plan', 'networth')} openLabel={tr('Open net worth and goals')}>
      <p className={hs.bigNum}>{fmtINR(net.value)}</p>
      {net.change !== null && net.change !== 0 && net.previous && (
        <p className={hs.toneLine(net.change > 0 ? 'good' : 'bad')}>{net.change > 0 ? '▲ ' + tr('Up {0} since {1}', fmtINR(net.change), shortDate(net.previous.date)) : '▼ ' + tr('Down {0} since {1}', fmtINR(Math.abs(net.change)), shortDate(net.previous.date))}</p>
      )}
      {points && (
        <svg viewBox="0 0 200 36" width="100%" height="36" preserveAspectRatio="none" aria-hidden="true" className="block">
          <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <p className={hs.micro}>{tr('As of {0}', shortDate(net.date))}</p>
    </BentoCard>
  );
}

// One of the four groups (Spending, EMI, Family, Saving) with what was spent in it: half the width on a phone, 3 of 12 columns wide.
export function CategoryGroupTile({ g, ov, openMonth }: Readonly<{ g: Group; ov: MonthOverview; openMonth: (g?: Group) => void }>) {
  const t = ov.summary.groups[g];
  return (
    <BentoCard title={tr(g)} span={3} half pad="tight" onOpen={() => openMonth(g)} openLabel={`Open ${g} for the month`}>
      <p className={hs.statNum}>{fmtINR(t.spent)}</p>
      <p className={hs.note}>{t.budgeted ? tr('of {0}', fmtINR(t.planned)) : tr('no budget')}</p>
      <BudgetLine group={g} spent={t.spent} planned={t.planned} over={false} budgeted={t.budgeted} />
    </BentoCard>
  );
}

export function RecentTile({ open, tall }: Readonly<{ open: Open; tall: boolean }>) {
  return (
    <BentoCard
      title={tr('Recent payments')}
      span={8}
      tall={tall}
      pad="list"
      gap={0}
      action={<button type="button" className={`${hs.seeAll} underline underline-offset-2`} onClick={() => open('payments')}>{tr('See all')}</button>}
    >
      <div className="pb-1" />
      <RecentList limit={5} plain empty={<p className="m-0 pt-4 pb-3.5 border-t border-line text-[15px] leading-[22px] text-muted">{tr('Payments you add show up here, newest first.')}</p>} />
    </BentoCard>
  );
}

// "2 overdue", "2 open" or "All done", and the next two items with their dates.
function dueNumber(due: NonNullable<ReturnType<typeof dueOverview>>): { text: string; late: boolean } {
  if (due.open === 0) return { text: tr('All done'), late: false };
  if (due.overdue > 0) return { text: tr('{0} overdue', due.overdue), late: true };
  return { text: tr('{0} open', due.open), late: false };
}

export function DueTile({ due, open }: Readonly<{ due: ReturnType<typeof dueOverview>; open: Open }>) {
  if (!due) {
    return (
      <BentoCard title={tr('Due soon')} span={4} half pad="tight">
        <BentoEmpty cta={tr('Add an item')} onCta={() => open('plan', 'due')}>{tr('Add one-off payments and to-dos, with a date, and see what is due soon.')}</BentoEmpty>
      </BentoCard>
    );
  }
  const n = dueNumber(due);
  return (
    <BentoCard title={tr('Due soon')} span={4} half pad="tight" onOpen={() => open('plan')} openLabel={tr('Open the due list')}>
      <p className={`${hs.statNum} ${n.late ? 'text-bad' : ''}`}>{n.text}</p>
      {due.next.map((v) => (
        <p key={v.k} className={hs.noteInk}>
          {v.title}{' · '}
          <span className={v.state === 'overdue' ? 'text-bad font-semibold' : 'text-muted'}>{v.due ? shortDate(v.due) : tr('No date')}</span>
        </p>
      ))}
    </BentoCard>
  );
}

export function CashFlowTile({ flow, open, openAddIncome }: Readonly<{ flow: ReturnType<typeof cashFlow>; open: Open; openAddIncome: () => void }>) {
  const empty = flow.income === 0 && flow.out === 0;
  if (empty) {
    return (
      <BentoCard title={tr('Cash flow')} span={3} half pad="tight">
        <BentoEmpty cta={tr('Add income')} onCta={openAddIncome}>{tr('Log what you receive (salary, refunds, cashback) to see what is left each month.')}</BentoEmpty>
      </BentoCard>
    );
  }
  return (
    <BentoCard title={tr('Cash flow')} span={3} half pad="tight" onOpen={() => open('cashflow')} openLabel={tr('Open the cash flow for this month')}>
      <p className={`${hs.statNum} ${flow.left < 0 ? 'text-bad' : ''}`}>{fmtINR(flow.left)}</p>
      <p className={hs.note}>{flow.left >= 0 ? tr('left this month') : tr('more out than in this month')}</p>
      <p className={hs.toneLine(flow.left >= 0 ? 'good' : 'bad')}>{tr('{0} in · {1} out', fmtINR(flow.income), fmtINR(flow.out))}</p>
    </BentoCard>
  );
}

export function InsightsTile({ usual, projected, ov, open }: Readonly<{ usual: number; projected: number | null; ov: MonthOverview; open: Open }>) {
  const toDate = ov.daily.at(-1) ?? 0;
  if (!(usual > 0)) {
    return <BentoCard title={tr('Insights')} span={3}><p className={hs.line14}>{tr('Insights fill in once you have logged a month or two of payments.')}</p></BentoCard>;
  }
  const likely = projected !== null && ov.day < ov.days ? Math.round(projected) : null;
  const vs = likely === null ? 0 : likely - usual;
  return (
    <BentoCard title={tr('Insights')} span={3} chevron onOpen={() => open('analytics')} openLabel={tr('Open insights')}>
      <p className={hs.statNum}>{fmtINR(usual)} <span className={hs.statUnit}>{tr('a usual month')}</span></p>
      <p className={hs.line14}>
        {likely === null ? tr('{0} so far this month.', fmtINR(toDate))
          : vs > 0 ? tr('Likely {0} by the end of the month, {1} more than usual.', fmtINR(likely), fmtINR(vs))
            : vs < 0 ? tr('Likely {0} by the end of the month, {1} less than usual.', fmtINR(likely), fmtINR(-vs))
              : tr('Likely {0} by the end of the month, the same as usual.', fmtINR(likely))}
      </p>
    </BentoCard>
  );
}

export function WhereItWentTile({ cats, open, openAdd }: Readonly<{ cats: ReturnType<typeof topCategories>; open: Open; openAdd: () => void }>) {
  return (
    <BentoCard title={tr('Where it went')} span={6} gap={10} onOpen={cats.total > 0 ? () => open('month') : undefined} openLabel={tr('Open this month\'s categories')}>
      {cats.total === 0 ? (
        <BentoEmpty cta={tr('Add expense')} onCta={openAdd}>{tr('Nothing spent yet this month.')}</BentoEmpty>
      ) : (
        <>
          <ul className={hs.shares}>
            {cats.top.map((c) => (
              <li key={c.category}>
                <span className={hs.shareLine}><span>{c.category}</span><span><span className="text-muted">{whole(c.share)}</span> · <strong>{fmtINR(c.spent)}</strong></span></span>
                <span className={hs.bar} aria-hidden="true"><i style={{ width: `${Math.max(1, c.share * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
          {cats.rest.count > 0 && <p className={hs.note}>{tr('{0} more {1} · {2} ({3})', cats.rest.count, cats.rest.count === 1 ? 'category' : 'categories', fmtINR(cats.rest.spent), whole(cats.rest.share))}</p>}
        </>
      )}
    </BentoCard>
  );
}

export function CoupleTile({ c, openGroup }: Readonly<{ c: Couple; openGroup: (id: string) => void }>) {
  const tone = c.tone === 'owed' ? 'good' : c.tone === 'late' ? 'bad' : '';
  return (
    <BentoCard title={tr('You and {0}', c.partner)} span={3} half pad="tight" onOpen={() => openGroup(c.id)} openLabel={`Open your couple group with ${c.partner}`}>
      <p className={`${hs.statNum} ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-muted'}`}>{c.amount > 0 ? fmtINR(c.amount) : tr('Settled')}</p>
      {c.amount > 0 && <p className={hs.toneLine(tone)}>{c.tone === 'owed' ? tr('owed to you') : tr('you owe')}</p>}
    </BentoCard>
  );
}

// The Groups tile: what you are owed or owe across your groups and which groups; before there is one, an invitation to make one.
export function GroupsTile({ shared, open, goSettings, half }: Readonly<{ shared: ReturnType<typeof groupsOverview>; open: Open; goSettings: () => void; half: boolean }>) {
  const app = useApp();
  const signedIn = app.syncEnabled && app.sync.mode !== 'signedout' && Boolean(app.me);
  if (!signedIn || app.groups.length === 0) {
    return (
      <BentoCard title={tr('Groups')} span={half ? 3 : 4} half={half} pad="tight">
        <BentoEmpty cta={tr('Create a group')} onCta={signedIn ? () => open('groups') : goSettings}>{tr('Share costs with flatmates, family or a trip, and see who owes whom.')}</BentoEmpty>
      </BentoCard>
    );
  }
  const net = shared.owed - shared.owe;
  const names = app.groups.filter((g) => !g.closed_at).map((g) => g.name);
  return (
    <BentoCard title={tr('Groups')} span={3} half pad="tight" onOpen={() => open('groups')} openLabel={tr('Open groups and settle up')}>
      {net === 0 ? <p className={hs.statNum}>{tr('All settled')}</p> : (
        <>
          <p className={`${hs.statNum} ${net > 0 ? 'text-good' : 'text-bad'}`}>{fmtINR(Math.abs(net))}</p>
          <p className={hs.toneLine(net > 0 ? 'good' : 'bad')}>{net > 0 ? tr('owed to you') : tr('you owe')}</p>
        </>
      )}
      <p className={hs.note}>{tr('{0} {1} · {2}', names.length, names.length === 1 ? 'group' : 'groups', names.join(', '))}</p>
    </BentoCard>
  );
}

export function GoalsTile({ goal, open }: Readonly<{ goal: GoalTile | null; open: Open }>) {
  if (!goal) {
    return (
      <BentoCard title={tr('Goals')} span={3} half pad="tight">
        <BentoEmpty cta={tr('Make a goal')} onCta={() => open('plan', 'goals')}>{tr('No goals yet. Set a target and a date, and see what to set aside each month.')}</BentoEmpty>
      </BentoCard>
    );
  }
  const state = goal.line.state;
  const month = monthLabel(goal.goal.d.slice(0, 7)).split(' ')[0]; // "March"
  return (
    <BentoCard title={tr('Goals')} span={3} half pad="tight" onOpen={() => open('plan', 'goals')} openLabel={tr('Open your goals and the plan')}>
      <p className={hs.note}>{goal.goal.n} · {month}</p>
      <p className="m-0 text-[18px] leading-6 font-bold">{fmtINR(goal.progress.saved)} <span className="text-[13px] font-medium text-muted">{tr('of {0}', fmtINR(goal.goal.a))}</span></p>
      <span className={`${hs.bar} h-2 mt-0`} aria-hidden="true"><i className={state === 'reached' ? '!bg-good' : state === 'passed' ? '!bg-bad' : ''} style={{ width: `${Math.round(goal.progress.fraction * 100)}%` }} /></span>
      <p className={hs.note}>{state === 'reached' ? tr('Reached') : state === 'passed' ? tr('The date has passed') : tr('Needs {0} a month', fmtINR(goal.line.monthly))}</p>
    </BentoCard>
  );
}

export function UdhaarTile({ totals, hasEntries, open }: Readonly<{ totals: ReturnType<typeof udhaarTotals>; hasEntries: boolean; open: Open }>) {
  if (!hasEntries) {
    return (
      <BentoCard title={tr('Udhaar')} span={3} half pad="tight">
        <BentoEmpty cta={tr('Add an entry')} onCta={() => open('udhaar')}>{tr('Lent someone money, or borrowed some? Write it down here and tick it off when it comes back.')}</BentoEmpty>
      </BentoCard>
    );
  }
  const t = totals;
  return (
    <BentoCard title={tr('Udhaar')} span={3} half pad="tight" onOpen={() => open('udhaar')} openLabel={tr('Open Udhaar: money lent and borrowed')}>
      {t.owedToMe === 0 && t.iOwe === 0 && <p className={hs.statNum}>{tr('All settled')}</p>}
      {t.owedToMe > 0 && <><p className={`${hs.statNum} text-good`}>{fmtINR(t.owedToMe)}</p><p className={hs.toneLine('good')}>{tr('owed to you')}</p></>}
      {t.iOwe > 0 && (t.owedToMe > 0
        ? <p className={hs.toneLine('bad')}>{tr('You owe {0}', fmtINR(t.iOwe))}</p>
        : <><p className={`${hs.statNum} text-bad`}>{fmtINR(t.iOwe)}</p><p className={hs.toneLine('bad')}>{tr('you owe')}</p></>)}
    </BentoCard>
  );
}

import { useApp } from '../../data/context.tsx';
import { BentoCard, BentoEmpty } from '../../ui/Bento.tsx';
import { BudgetLine } from '../../ui/BudgetLine.tsx';
import { RecentList } from '../payments/index.ts';
import { dueRelative } from '../../core/blocks.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import type { Group } from '../../core/logic.ts';
import type { netNow } from '../../core/goals.ts';
import type { cashFlow } from '../../core/income.ts';
import type { udhaarTotals } from '../../core/udhaar.ts';
import type { CoupleTile as Couple, GoalTile, MonthOverview, dueOverview, groupsOverview, topCategories } from './dashboard.ts';
import type { Section } from './HomeScreen.tsx';
import * as ui from '../../ui/styles.ts';
import * as hs from '../../ui/tileStyles.ts';
import { tr } from '../../core/i18n.ts';

const whole = (f: number): string => `${Math.round(f * 100)}%`;
type Open = (s: Section, anchor?: string) => void;

// What each Overview tile shows. A tile that has nothing to say yet while the person is getting started is not drawn at all: HomeScreen
// decides that, so these only choose between the figures and an invitation to add something.

export function NetWorthTile({ net, open }: Readonly<{ net: ReturnType<typeof netNow>; open: Open }>) {
  if (!net) {
    return (
      <BentoCard title={tr('Net worth')} span={4}>
        <BentoEmpty cta={tr('Add your net worth')} onCta={() => open('plan', 'networth')}>
          {tr('Add what you own minus what you owe, and update it now and then to see it move.')}
        </BentoEmpty>
      </BentoCard>
    );
  }
  return (
    <BentoCard title={tr('Net worth')} span={4} onOpen={() => open('plan', 'networth')} openLabel={tr('Open net worth and goals')}>
      <p className={hs.statNum()}>{fmtINR(net.value)}</p>
      {net.change !== null && net.change !== 0 && net.previous && (
        <p className={ui.leftText(net.change > 0 ? 'good' : 'bad')}>{net.change > 0 ? '▲ ' + tr('Up {0} since {1}', fmtINR(net.change), shortDate(net.previous.date)) : '▼ ' + tr('Down {0} since {1}', fmtINR(Math.abs(net.change)), shortDate(net.previous.date))}</p>
      )}
      <p className={hs.noteFoot}>{tr('As of {0}', shortDate(net.date))}</p>
    </BentoCard>
  );
}

// One of the four groups (Spending, EMI, Family, Saving) with what was spent in it.
export function CategoryGroupTile({ g, ov, span, fill, openMonth }: Readonly<{ g: Group; ov: MonthOverview; span: 3 | 4 | 6 | 12; fill: boolean; openMonth: (g?: Group) => void }>) {
  const t = ov.summary.groups[g];
  return (
    <BentoCard title={tr(g)} span={span} compact fill={fill} onOpen={() => openMonth(g)} openLabel={`Open ${g} for the month`}>
      <p className={hs.statNum(true)}>{fmtINR(t.spent)}</p>
      <p className={hs.note}>{t.budgeted ? tr('of {0}', fmtINR(t.planned)) : ' '}</p>
      <BudgetLine group={g} spent={t.spent} planned={t.planned} over={false} budgeted={t.budgeted} />
    </BentoCard>
  );
}

export function RecentTile({ open, openAdd }: Readonly<{ open: Open; openAdd: () => void }>) {
  const app = useApp();
  return (
    <BentoCard
      title={tr('Recent payments')}
      span={8}
      action={app.entries.length > 0 ? <button type="button" className={hs.seeAll} onClick={() => open('payments')}>{tr('See all')}</button> : null}
    >
      <RecentList limit={5} plain empty={<BentoEmpty cta={tr('Add your first expense')} onCta={openAdd}>{tr('No payments yet. The latest ones show here.')}</BentoEmpty>} />
    </BentoCard>
  );
}

// "3 overdue" or "2 open" or "All done", and the next one or two items.
function DueNumber({ due }: Readonly<{ due: NonNullable<ReturnType<typeof dueOverview>> }>) {
  if (due.open === 0) return <>{tr('All done')}</>;
  if (due.overdue > 0) return <span className={ui.late}>{tr('{0} overdue', due.overdue)}</span>;
  return <>{tr('{0} open', due.open)}</>;
}

export function DueTile({ due, open }: Readonly<{ due: ReturnType<typeof dueOverview>; open: Open }>) {
  if (!due) {
    return (
      <BentoCard title={tr('Due soon')} span={4}>
        <BentoEmpty cta={tr('Add an item')} onCta={() => open('plan', 'due')}>
          {tr('Add one-off payments and to-dos, with a date, and see what is due soon.')}
        </BentoEmpty>
      </BentoCard>
    );
  }
  return (
    <BentoCard title={tr('Due soon')} span={4} onOpen={() => open('plan')} openLabel={tr('Open the due list')}>
      <p className={hs.statNum()}><DueNumber due={due} /></p>
      {due.open > 0 && due.overdue > 0 && <p className={hs.note}>{tr('{0} open in all', due.open)}</p>}
      {due.next.length > 0 && (
        <ul className={hs.mini}>
          {due.next.map((v) => (
            <li key={v.k}>
              <span className={ui.rowMain()}>
                <b>{v.title}</b>
                <small className={v.state === 'overdue' ? ui.late : undefined}>{v.due ? `${shortDate(v.due)} · ${dueRelative(v.days)}` : tr('No date')}</small>
              </span>
              {v.amount ? <span className="font-bold tabular-nums">{fmtINR(v.amount)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

export function CashFlowTile({ flow, open, openAddIncome }: Readonly<{ flow: ReturnType<typeof cashFlow>; open: Open; openAddIncome: () => void }>) {
  const empty = flow.income === 0 && flow.out === 0;
  return (
    <BentoCard title={tr('Cash flow')} span={4} onOpen={() => open('cashflow')} openLabel={tr('Open the cash flow for this month')}>
      {empty ? (
        <BentoEmpty cta={tr('Add income')} onCta={openAddIncome}>{tr('Log what you receive (salary, refunds, cashback) to see what is left each month.')}</BentoEmpty>
      ) : (
        <>
          <p className={hs.statNum()}>{fmtINR(flow.left)} <span className={hs.statUnit}>{tr('left this month')}</span></p>
          <p className={ui.leftText(flow.left >= 0 ? 'good' : 'bad')}>{tr('{0} in · {1} out', fmtINR(flow.income), fmtINR(flow.out))}</p>
          <p className={hs.noteFoot}>{flow.income === 0 ? tr('No income logged yet this month.') : tr('Savings are counted apart.')}</p>
        </>
      )}
    </BentoCard>
  );
}

export function InsightsTile({ usual, projected, ov, open }: Readonly<{ usual: number; projected: number | null; ov: MonthOverview; open: Open }>) {
  const toDate = ov.daily.at(-1) ?? 0;
  return (
    <BentoCard title={tr('Insights')} span={4} onOpen={() => open('analytics')} openLabel={tr('Open insights')}>
      {usual > 0 ? (
        <>
          <p className={hs.statNum()}>{fmtINR(usual)} <span className={hs.statUnit}>{tr('a usual month')}</span></p>
          <p className={hs.note}>{projected !== null && ov.day < ov.days ? tr('This month will likely end near {0}.', fmtINR(Math.round(projected))) : tr('{0} so far this month.', fmtINR(toDate))}</p>
          <p className={hs.noteFoot}>{tr('Months, categories, days of the week and goals, added up.')}</p>
        </>
      ) : (
        <BentoEmpty>{tr('Insights fill in once you have logged a month or two of payments.')}</BentoEmpty>
      )}
    </BentoCard>
  );
}

export function WhereItWentTile({ cats, open, openAdd }: Readonly<{ cats: ReturnType<typeof topCategories>; open: Open; openAdd: () => void }>) {
  return (
    <BentoCard title={tr('Where it went')} span={4} onOpen={cats.total > 0 ? () => open('month') : undefined} openLabel={tr('Open this month\'s categories')}>
      {cats.total === 0 ? (
        <BentoEmpty cta={tr('Add expense')} onCta={openAdd}>{tr('Nothing spent yet this month.')}</BentoEmpty>
      ) : (
        <ul className={hs.shares}>
          {cats.top.map((c) => (
            <li key={c.category}>
              <span className={hs.shareLine}><span className={hs.shareName}>{c.category}</span><span className="text-muted">{whole(c.share)}</span><b>{fmtINR(c.spent)}</b></span>
              <span className={hs.shareBar} aria-hidden="true"><i style={{ width: `${Math.max(1, c.share * 100)}%` }} /></span>
            </li>
          ))}
          {cats.rest.count > 0 && <li className={hs.note}>{tr('{0} more {1} · {2} ({3})', cats.rest.count, cats.rest.count === 1 ? 'category' : 'categories', fmtINR(cats.rest.spent), whole(cats.rest.share))}</li>}
        </ul>
      )}
    </BentoCard>
  );
}

export function CoupleTile({ c, openGroup }: Readonly<{ c: Couple; openGroup: (id: string) => void }>) {
  return (
    <BentoCard title={tr('You and {0}', c.partner)} span={4} onOpen={() => openGroup(c.id)} openLabel={`Open your couple group with ${c.partner}`}>
      <p className={`${hs.statNum()} ${c.tone === 'owed' ? 'text-good' : c.tone === 'late' ? 'text-bad' : 'text-muted'}`}>{c.text}</p>
      <p className={hs.note}>{c.tone === 'muted' ? tr('Nothing to settle') : tr('Open to settle up')}</p>
    </BentoCard>
  );
}

// What you are owed and owe across your groups: "All settled", or the net, with the two sides when both are open.
function GroupsFigure({ shared }: Readonly<{ shared: ReturnType<typeof groupsOverview> }>) {
  if (shared.owed === shared.owe) return <p className={hs.statNum()}>{tr('All settled')}</p>;
  if (shared.owed > shared.owe) return <p className={hs.statNum()}><span className={ui.owed}>{fmtINR(shared.owed - shared.owe)}</span> <span className={hs.statUnit}>{tr('owed to you')}</span></p>;
  return <p className={hs.statNum()}><span className={ui.late}>{fmtINR(shared.owe - shared.owed)}</span> <span className={hs.statUnit}>{tr('you owe')}</span></p>;
}

// The Groups tile: it asks for cloud sync, for a sign-in, or for a first group, until there is one to show.
export function GroupsTile({ shared, open, goSettings }: Readonly<{ shared: ReturnType<typeof groupsOverview>; open: Open; goSettings: () => void }>) {
  const app = useApp();
  if (!app.syncEnabled) return <BentoCard title={tr('Groups')} span={4}><BentoEmpty>{tr('Groups need cloud sync, which is not set up in this build.')}</BentoEmpty></BentoCard>;
  if (app.sync.mode === 'signedout' || !app.me) {
    return (
      <BentoCard title={tr('Groups')} span={4}>
        <BentoEmpty cta={tr('Sign in')} onCta={goSettings}>{tr('Sign in to share expenses with the family or on a trip, and settle up.')}</BentoEmpty>
      </BentoCard>
    );
  }
  if (app.groups.length === 0) {
    return (
      <BentoCard title={tr('Groups')} span={4}>
        <BentoEmpty cta={tr('Make or join a group')} onCta={() => open('groups')}>{tr('No groups yet. Make one for the family or a trip.')}</BentoEmpty>
      </BentoCard>
    );
  }
  return (
    <BentoCard title={tr('Groups')} span={4} onOpen={() => open('groups')} openLabel={tr('Open groups and settle up')}>
      <GroupsFigure shared={shared} />
      <p className={hs.note}>
        {app.groups.length} {app.groups.length === 1 ? 'group' : 'groups'}
        {shared.owed > 0 && shared.owe > 0 ? tr(' · {0} owed to you, {1} you owe', fmtINR(shared.owed), fmtINR(shared.owe)) : ''}
      </p>
    </BentoCard>
  );
}

export function GoalsTile({ goal, open }: Readonly<{ goal: GoalTile | null; open: Open }>) {
  if (!goal) {
    return (
      <BentoCard title={tr('Goals')} span={4}>
        <BentoEmpty cta={tr('Make a goal')} onCta={() => open('plan', 'goals')}>{tr('No goals yet. Set a target and a date, and see what to set aside each month.')}</BentoEmpty>
      </BentoCard>
    );
  }
  const state = goal.line.state;
  return (
    <BentoCard title={tr('Goals')} span={4} onOpen={() => open('plan', 'goals')} openLabel={tr('Open your goals and the plan')}>
      <p className={hs.statNum()}>{fmtINR(goal.progress.saved)} <span className={hs.statUnit}>{tr('of {0}', fmtINR(goal.goal.a))}</span></p>
      <p className={hs.note}>{goal.goal.n} · {goal.term === 'short' ? tr('short term') : tr('long term')}{goal.count > 1 ? tr(' · {0} goals', goal.count) : ''}</p>
      <div className={ui.meter(state === 'reached' ? 'good' : state === 'passed' ? 'bad' : 'accent')} aria-hidden="true"><i style={{ width: `${Math.round(goal.progress.fraction * 100)}%` }} /></div>
      <p className={hs.note}>{state === 'reached' ? tr('Reached') : state === 'passed' ? tr('The date has passed') : tr('Needs {0} a month', fmtINR(goal.line.monthly))}</p>
    </BentoCard>
  );
}

// What you are owed and owe in Udhaar: "All settled", or each side that is open.
function UdhaarFigure({ t }: Readonly<{ t: ReturnType<typeof udhaarTotals> }>) {
  if (t.owedToMe === 0 && t.iOwe === 0) return <p className={hs.statNum()}>{tr('All settled')}</p>;
  return (
    <>
      {t.owedToMe > 0 && <p className={hs.statNum()}><span className={ui.owed}>{fmtINR(t.owedToMe)}</span> <span className={hs.statUnit}>{tr('owed to you')}</span></p>}
      {t.iOwe > 0 && <p className={t.owedToMe > 0 ? hs.note : hs.statNum()}><span className={ui.late}>{fmtINR(t.iOwe)}</span> <span className={hs.statUnit}>{tr('you owe')}</span></p>}
    </>
  );
}

export function UdhaarTile({ totals, hasEntries, open }: Readonly<{ totals: ReturnType<typeof udhaarTotals>; hasEntries: boolean; open: Open }>) {
  if (!hasEntries) {
    return (
      <BentoCard title={tr('Udhaar')} span={4}>
        <BentoEmpty cta={tr('Add an entry')} onCta={() => open('udhaar')}>{tr('Lent someone money, or borrowed some? Write it down here and tick it off when it comes back.')}</BentoEmpty>
      </BentoCard>
    );
  }
  return (
    <BentoCard title={tr('Udhaar')} span={4} onOpen={() => open('udhaar')} openLabel={tr('Open Udhaar: money lent and borrowed')}>
      <UdhaarFigure t={totals} />
      <p className={hs.noteFoot}>{tr('Money lent and borrowed, outside your groups.')}</p>
    </BentoCard>
  );
}

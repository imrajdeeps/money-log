import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { memberName } from '../../core/groups.ts';
import type { Group } from '../../core/groups.ts';
import { groupSummary, wholePercents } from '../../core/groupSummary.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

// What a shared group has spent, at a glance: the total, who paid and whose share it is, where the money went and (for a
// trip) on which days. The whole group's history, or one month of it.
export function SummaryCard({ group, title, month, byDay, empty, extra }: { group: Group; title: string; month?: string; byDay: boolean; empty: string; extra?: (total: number) => string }) {
  const app = useApp();
  const me = app.me ?? '';
  const s = useMemo(() => groupSummary(app.groupEntries, group.id, { month }), [app.groupEntries, group.id, month]);
  const percents = useMemo(() => wholePercents(s.byCategory.map((c) => c.share)), [s]);
  const name = (uid: string) => (uid === me ? 'You' : memberName(app.members, group.id, uid));

  if (s.count === 0) return <div className={ui.card()}><h3>{title}</h3><p className="text-muted text-[13px]">{empty}</p></div>;
  return (
    <div className={ui.card()}>
      <h3>{title}</h3>
      <p className={ui.bigNum}>{fmtINR(s.total)}</p>
      <p className="text-muted text-[13px]">
        {s.count} {s.count === 1 ? 'expense' : 'expenses'}{extra ? extra(s.total) : ''}
      </p>

      <h3 className="text-[16px] mt-5 mb-2">Who paid and whose share</h3>
      <ul className={ui.list(true)}>
        {s.perPerson.map((p) => (
          <li key={p.user} className={ui.catLineFlush}><span>{name(p.user)}</span><span>paid {fmtINR(p.paid)} · share {fmtINR(p.share)}</span></li>
        ))}
      </ul>

      <h3 className="text-[16px] mt-5 mb-2">Where it went</h3>
      <ul className={ui.list(true)}>
        {s.byCategory.map((c, i) => (
          <li key={c.category} className={ui.catLineFlush}><span>{c.category}</span><span>{fmtINR(c.total)} <small className="text-muted">{percents[i]}%</small></span></li>
        ))}
      </ul>

      {byDay && (
        <>
        <h3 className="text-[16px] mt-5 mb-2">Day by day</h3>
        <ul className={ui.list(true)}>
          {s.byDay.map((d) => (
            <li key={d.date} className={ui.catLineFlush}><span>{shortDate(d.date)}</span><span>{fmtINR(d.total)}</span></li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}

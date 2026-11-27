import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { groupBalances, simplifyDebts } from '../../core/groups.ts';
import type { Group, Member } from '../../core/groups.ts';
import { pairwiseDebts } from '../../core/repayments.ts';
import { paymentsText } from './repaymentText.ts';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Simplify repayments on the group's settings (version 2.1, from the design): on, the fewest payments settle everyone; off, each person
// pays back exactly whom they owe. One setting for the whole group, so only admins change it; everyone sees what it does right now.
export function SimplifyCard({ group, people, isAdmin }: Readonly<{ group: Group; people: Member[]; isAdmin: boolean }>) {
  const app = useApp();
  const act = useAction();
  const on = group.simplify;
  const counts = useMemo(() => {
    const bal = groupBalances(group.id, app.groupEntries, app.settlements);
    return { simple: simplifyDebts(bal).length, pairs: pairwiseDebts(group.id, app.groupEntries, app.settlements).length };
  }, [group.id, app.groupEntries, app.settlements]);
  const admins = people.filter((m) => m.role === 'admin' && m.user_id !== app.me).map((m) => m.display_name).join(', ');
  let now = tr('Right now nobody owes anybody anything.');
  if (counts.pairs > 0) {
    now = on
      ? tr('Right now {0} settle everyone up. Without simplifying it would take {1}.', paymentsText(counts.simple), counts.pairs)
      : tr('Right now {0}, one for each pair who owe each other. Simplified it would take {1}.', paymentsText(counts.pairs), counts.simple);
  }
  return (
    <section className="bg-card border border-line rounded-card px-4 pt-1 pb-4 flex flex-col gap-2.5">
      <label className={ui.cx('grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[72px]', isAdmin ? 'cursor-pointer' : 'cursor-not-allowed')}>
        <span className="flex flex-col gap-0.5">
          <span className="text-[16px] font-[650]">{tr('Simplify repayments')}</span>
          <span className="text-[13px] leading-[18px] text-muted">{tr('Settle everyone up in fewer payments.')}</span>
        </span>
        <input type="checkbox" role="switch" className={ui.cx(ui.switchBox, !isAdmin && 'opacity-50')} aria-label={tr('Simplify repayments')} checked={on} disabled={!isAdmin || act.busy}
          onChange={(e) => { void act.run(() => app.setGroupSimplify(group.id, e.target.checked), e.target.checked ? tr('Repayments are simplified') : tr('Repayments are no longer simplified')); }} />
      </label>
      <p className="m-0 text-[14px] leading-5">{on
        ? tr('Hisaab works out the shortest way to settle everyone. You may pay someone you did not share that expense with, but nobody pays more or less in total.')
        : tr("Everyone pays back exactly the person they owe, and two people's debts to each other cancel out. More payments, no surprises.")}</p>
      <p className="m-0 bg-press rounded-xl px-3 py-2.5 text-[14px] leading-5">{now}</p>
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
      <p className="m-0 text-[13px] leading-[18px] text-muted">{isAdmin
        ? tr('Only admins can change this. Everyone in {0} sees the same list, and the group gets a note when it changes.', group.name)
        : tr('Only admins can change this ({0}). Everyone in {1} sees the same list.', admins, group.name)}</p>
    </section>
  );
}

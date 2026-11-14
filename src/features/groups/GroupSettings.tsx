import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { activeMembers, groupBalances } from '../../core/groups.ts';
import type { Group } from '../../core/groups.ts';
import { kindLabel } from '../../core/groupKinds.ts';
import { InviteCard } from './InviteCard.tsx';
import { PeopleCard } from './PeopleCard.tsx';
import { TripSettings } from './TripSettings.tsx';
import { UsualSplitCard } from './UsualSplitCard.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The settings of ONE group, on a page of its own (/groups/<id>/settings): invite people, the usual split (flatmates), the trip's
// dates, the people, and leaving. What only an admin may do is shown to admins only; nothing here is shared between groups.
export function GroupSettings({ group, onBack, onLeft }: Readonly<{ group: Group; onBack: () => void; onLeft: () => void }>) {
  const app = useApp();
  const people = useMemo(() => activeMembers(app.members, group.id), [app.members, group.id]);
  const former = useMemo(() => app.members.filter((m) => m.group_id === group.id && m.left_at), [app.members, group.id]);
  const isAdmin = people.find((m) => m.user_id === app.me)?.role === 'admin';
  const bal = useMemo(() => groupBalances(group.id, app.groupEntries, app.settlements), [group.id, app.groupEntries, app.settlements]);

  return (
    <section aria-label={tr('Settings of {0}', group.name)}>
      <button type="button" className={ui.btn('ghost', 'md', 'w-auto mb-2')} onClick={onBack}><span className="inline-flex rotate-180"><Icon name="chevron" size={18} /></span>{' '}{group.name}</button>
      <h2>{tr('Group settings')} <span className={ui.tag}>{kindLabel(group.kind)}</span></h2>
      <p className="text-muted text-[13px]">{tr('These apply to {0} only.', group.name)}</p>
      {isAdmin && <InviteCard group={group} people={people} />}
      {group.kind === 'flatmates' && <UsualSplitCard group={group} people={people} isAdmin={isAdmin} />}
      {group.kind === 'trip' && <TripSettings group={group} isAdmin={isAdmin} />}
      <PeopleCard group={group} people={people} former={former} bal={bal} isAdmin={isAdmin} onLeft={onLeft} />
    </section>
  );
}

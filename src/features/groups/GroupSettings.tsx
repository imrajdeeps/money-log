import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { activeMembers, groupBalances } from '../../core/groups.ts';
import type { Group } from '../../core/groups.ts';
import { kindLabel } from '../../core/groupKinds.ts';
import { InviteCard } from './InviteCard.tsx';
import { PeopleCard } from './PeopleCard.tsx';
import { ShareCountCard } from './ShareCountCard.tsx';
import { SimplifyCard } from './SimplifyCard.tsx';
import { TripSettings } from './TripSettings.tsx';
import { UsualSplitCard } from './UsualSplitCard.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The settings of ONE group, on a page of its own (/groups/<id>/settings): In my month, invite people, the usual split (flatmates),
// Simplify repayments, the trip's dates, the people, and leaving. What only an admin may do is shown to admins only; nothing here is shared between groups.
export function GroupSettings({ group, onBack, onLeft }: Readonly<{ group: Group; onBack: () => void; onLeft: () => void }>) {
  const app = useApp();
  const people = useMemo(() => activeMembers(app.members, group.id), [app.members, group.id]);
  const former = useMemo(() => app.members.filter((m) => m.group_id === group.id && m.left_at), [app.members, group.id]);
  const isAdmin = people.find((m) => m.user_id === app.me)?.role === 'admin';
  const bal = useMemo(() => groupBalances(group.id, app.groupEntries, app.settlements), [group.id, app.groupEntries, app.settlements]);

  const count = people.length;
  return (
    <section aria-label={tr('Settings of {0}', group.name)} className="flex flex-col gap-4 -mt-2">
      <div className="flex flex-col gap-0.5">
        <button type="button" className={ui.backLink} onClick={onBack}><Icon name="back" size={20} stroke={2} />{group.name}</button>
        <h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr('Group settings')}</h2>
        <p className="m-0 text-[14px] text-muted">{group.name} · {kindLabel(group.kind)} · {count === 1 ? tr('1 person') : tr('{0} people', count)}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-2 lg:gap-x-7">
        <div className="flex flex-col gap-4">
          <ShareCountCard group={group} />
          {isAdmin && <InviteCard group={group} people={people} />}
          {group.kind === 'flatmates' && <UsualSplitCard group={group} people={people} isAdmin={isAdmin} />}
          <SimplifyCard group={group} people={people} isAdmin={isAdmin} />
          {group.kind === 'trip' && <TripSettings group={group} isAdmin={isAdmin} />}
        </div>
        <div className="flex flex-col gap-4">
          <PeopleCard group={group} people={people} former={former} bal={bal} isAdmin={isAdmin} onLeft={onLeft} />
        </div>
      </div>
    </section>
  );
}

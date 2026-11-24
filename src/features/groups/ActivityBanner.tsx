import { useEffect, useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { groupActivity } from '../../core/groupActivity.ts';
import type { Group } from '../../core/groups.ts';
import { memberName } from '../../core/groups.ts';
import { groupSeen } from '../../data/phonePrefs.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const markSeen = (id: string) => groupSeen.save({ ...groupSeen.load(), [id]: new Date().toISOString() });

// At the top of a group: what others added or changed since this phone last looked. The last look is noted when the page is left (and the
// first time ever, so a first visit does not start with old news); it is kept on this phone only.
export function ActivityBanner({ group }: Readonly<{ group: Group }>) {
  const app = useApp();
  const seen = groupSeen.use();
  const since = seen[group.id] ?? null;
  const nameOf = (uid: string | null) => (uid === app.me ? tr('You') : memberName(app.members, group.id, uid));
  const { items, more } = useMemo(
    () => groupActivity(app.groupEntries, app.settlements, group.id, app.me, since, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.groupEntries, app.settlements, app.members, group.id, app.me, since],
  );
  useEffect(() => { if (!groupSeen.load()[group.id]) markSeen(group.id); return () => markSeen(group.id); }, [group.id]);
  if (items.length === 0) return null;
  return (
    <div className={ui.card('notice')} role="status">
      <h3>{tr('Since you last opened')}</h3>
      <ul className="m-0 list-none p-0 text-[14px]">
        {items.map((a, i) => <li key={`${a.at}${i}`} className="py-0.5">{a.text}</li>)}
      </ul>
      {more > 0 && <p className="m-0 mt-1 text-[13px] text-muted">{tr('and {0} more', more)}</p>}
    </div>
  );
}

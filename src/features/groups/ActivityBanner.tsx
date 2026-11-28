import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../data/context.tsx';
import { groupActivity, seenKeys } from '../../core/groupActivity.ts';
import type { Group, Settlement } from '../../core/groups.ts';
import type { GroupRepeat } from '../../core/groupRepeats.ts';
import type { Entry } from '../../core/logic.ts';
import { memberName } from '../../core/groups.ts';
import { groupSeen } from '../../data/phonePrefs.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

type Latest = { entries: readonly Entry[]; settlements: readonly Settlement[]; group: Group; repeats: readonly GroupRepeat[] };
const keysOf = (l: Latest): string[] => seenKeys(l.entries, l.settlements, l.group.id, { group: l.group, repeats: l.repeats });

// At the top of a group: what others added or changed since this phone last looked. The last look is noted when the page is left (and the
// first time ever, so a first visit does not start with old news); it is kept on this phone only.
export function ActivityBanner({ group }: Readonly<{ group: Group }>) {
  const app = useApp();
  const seen = groupSeen.use();
  const known = seen[group.id] ?? null;
  const nameOf = (uid: string | null) => (uid === app.me ? tr('You') : memberName(app.members, group.id, uid));
  const { items, more } = useMemo(
    () => groupActivity(app.groupEntries, app.settlements, group.id, app.me, known, nameOf, { group, repeats: app.groupRepeats }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.groupEntries, app.settlements, app.members, app.groupRepeats, group, app.me, known],
  );
  // what is in the group right now is "seen" the first time, and again when the page is left (read from a ref: the latest rows at that moment)
  const latest = useRef<Latest>({ entries: app.groupEntries, settlements: app.settlements, group, repeats: app.groupRepeats });
  latest.current = { entries: app.groupEntries, settlements: app.settlements, group, repeats: app.groupRepeats };
  useEffect(() => {
    const mark = () => groupSeen.save({ ...groupSeen.load(), [group.id]: keysOf(latest.current) });
    if (!groupSeen.load()[group.id]) mark();
    return mark;
  }, [group.id]);
  if (items.length === 0) return null;
  const total = items.length + more;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center bg-press rounded-card px-4 py-3" role="status">
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[15px] font-bold">{tr('{0} new since you last opened', total)}</span>
        <span className="text-[13px] text-muted">{items.map((a) => a.text).join('. ')}{more > 0 ? ` ${tr('and {0} more', more)}` : ''}</span>
      </span>
      <button type="button" className={ui.btn('outline', 'none', 'min-h-11 px-3.5 text-[14px]')} onClick={() => groupSeen.save({ ...groupSeen.load(), [group.id]: keysOf(latest.current) })}>{tr('Seen')}</button>
    </div>
  );
}

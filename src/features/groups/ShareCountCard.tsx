import { shareFrom } from '../../core/groupShares.ts';
import { shortDate } from '../../core/format.ts';
import { isoDate } from '../../core/logic.ts';
import type { Group } from '../../core/groups.ts';
import { shareSwitches, sharesFrom } from '../../data/phonePrefs.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Does your share of what others add in this group count in your own Month? On for flatmates and couples (the running costs of one home),
// off for families and trips, and yours to change. Kept on this phone only. Earlier months never change by themselves: it counts from the day it was switched on.
export function ShareCountCard({ group }: Readonly<{ group: Group }>) {
  const sw = shareSwitches.use();
  const from = shareFrom(group, sw, sharesFrom.use() || isoDate());
  const on = from !== null;
  return (
    <section className="bg-card border border-line rounded-card px-4 py-1">
      <label className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[72px] cursor-pointer">
        <span className="flex flex-col gap-0.5">
          <span className="text-[16px] font-[650]">{tr('In my month')}</span>
          <span className="text-[13px] leading-[18px] text-muted">
            {tr("Count my share of this group's expenses in my budgets.")}
            {on && from !== null ? ` ${tr('Counted from {0}.', shortDate(from))}` : ''}
          </span>
        </span>
        <input type="checkbox" role="switch" className={ui.switchBox} aria-label={tr('In my month')} checked={on} onChange={(e) => shareSwitches.save({ ...sw, [group.id]: { on: e.target.checked, from: isoDate() } })} />
      </label>
    </section>
  );
}

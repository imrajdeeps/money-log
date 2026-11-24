import { countsByDefault, shareFrom } from '../../core/groupShares.ts';
import { shortDate } from '../../core/format.ts';
import { isoDate } from '../../core/logic.ts';
import type { Group } from '../../core/groups.ts';
import { shareSwitches, sharesFrom } from '../../data/phonePrefs.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Does your share of what others add in this group count in your own Month? On for flatmates and couples (the running costs of one home),
// off for families and trips, and yours to change. Kept on this phone only.
export function ShareCountCard({ group }: Readonly<{ group: Group }>) {
  const sw = shareSwitches.use();
  const from = shareFrom(group, sw, sharesFrom.use() || isoDate());
  const on = from !== null;
  return (
    <div className={ui.card()}>
      <h3>{tr('In my Month')}</h3>
      <label className={ui.check}>
        <input type="checkbox" checked={on} onChange={(e) => shareSwitches.save({ ...sw, [group.id]: { on: e.target.checked, from: isoDate() } })} />
        <span>{tr('Count my share of what others add here in my own Month, budgets and Insights')}</span>
      </label>
      <p className="text-muted text-[13px]">
        {countsByDefault(group.kind) ? tr('Switched on for this kind of group unless you turn it off.') : tr('Off for this kind of group unless you turn it on.')}
        {' '}{on && from !== null ? tr('Counted from {0}: earlier months never change by themselves.', shortDate(from)) : ''}
        {' '}{tr('What you add yourself always counts at your share. An expense you already added by hand ("Add my share to my budget") is never counted twice.')}
      </p>
    </div>
  );
}

import { countsByDefault, countsShare } from '../../core/groupShares.ts';
import type { Group } from '../../core/groups.ts';
import { shareSwitches } from '../../data/phonePrefs.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Does your share of what others add in this group count in your own Month? On for flatmates and couples (the running costs of one home),
// off for families and trips, and yours to change. Kept on this phone only.
export function ShareCountCard({ group }: Readonly<{ group: Group }>) {
  const sw = shareSwitches.use();
  const on = countsShare(group, sw);
  return (
    <div className={ui.card()}>
      <h3>{tr('In my Month')}</h3>
      <label className={ui.check}>
        <input type="checkbox" checked={on} onChange={(e) => shareSwitches.save({ ...sw, [group.id]: e.target.checked })} />
        <span>{tr('Count my share of what others add here in my own Month, budgets and Insights')}</span>
      </label>
      <p className="text-muted text-[13px]">
        {countsByDefault(group.kind) ? tr('Switched on for this kind of group unless you turn it off.') : tr('Off for this kind of group unless you turn it on.')}
        {' '}{tr('What you add yourself always counts at your share. An expense you already added by hand ("Add my share to my budget") is never counted twice.')}
      </p>
    </div>
  );
}

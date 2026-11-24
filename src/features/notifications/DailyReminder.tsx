import { useState } from 'react';
import { buildReminderIcs, cleanReminderTime } from '../../core/reminder.ts';
import { BASEPATH, appRootUrl } from '../../core/paths.ts';
import { isoDate } from '../../core/logic.ts';
import { loadReminderTime, saveReminderTime } from '../../data/reminderTime.ts';
import { useApp } from '../../data/context.tsx';
import { saveFile } from '../../ui/files.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// A reminder to log the day's spending, made by the phone's own calendar: the person picks a time and opens one calendar file; the
// calendar then alerts every day. Nothing is sent from a server, and nothing is stored here but the chosen time.
export function DailyReminder() {
  const app = useApp();
  const [time, setTime] = useState(loadReminderTime);
  async function make() {
    const t = cleanReminderTime(time);
    saveReminderTime(t);
    const ics = buildReminderIcs(t, isoDate(), new Date().toISOString(), appRootUrl(window.location.href, BASEPATH));
    const r = await saveFile('money-log-reminder.ics', ics, 'text/calendar');
    if (r !== 'cancelled') app.toast(tr('Open the file to put the reminder in your calendar.'));
  }
  return (
    <div className={ui.card()}>
      <h2>{tr('Daily reminder')}</h2>
      <p className="text-muted text-[13px]">{tr('Nothing reaches this app while it is closed, so let your calendar remind you: pick a time, make the file and open it. Your calendar then alerts you every day to log your spending. To stop it, delete the event in the calendar. On some phones tapping the alert opens the browser instead of the installed app.')}</p>
      <label className={ui.field}>
        <span>{tr('Remind me at')}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={() => { void make(); }}>{tr('Make the reminder file')}</button>
    </div>
  );
}

// The nightly reminder (version 1.30): a calendar file with one event that repeats every day, with an alert, so the phone's own calendar
// app does the reminding without any server. The same UID every time: opening a new file replaces the old event, it never doubles it.
// Pure: no DOM, no storage.
import { tr } from './i18n.ts';

export const DEFAULT_REMINDER_TIME = '21:30';

/** "HH:MM" (24 hours), or the default for anything else. */
export function cleanReminderTime(v: unknown): string {
  const m = typeof v === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v) : null;
  return m ? `${m[1]}:${m[2]}` : DEFAULT_REMINDER_TIME;
}

const text = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([;,])/g, '\\$1');
const stamp = (iso: string): string => iso.replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z';

/** Adds minutes to a day and a time, staying on a calendar day (an event that would cross midnight ends at 23:59). */
function endOf(time: string, minutes: number): string {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  const capped = Math.min(total, 23 * 60 + 59);
  return `${String(Math.floor(capped / 60)).padStart(2, '0')}${String(capped % 60).padStart(2, '0')}`;
}

/**
 * The file: an event starting today at `time` (local, "floating", so it follows the phone's time zone), repeating daily, with an alert
 * at its start. `appUrl` is where the event points.
 */
export function buildReminderIcs(time: string, todayIso: string, nowIso: string, appUrl: string): string {
  const t = cleanReminderTime(time);
  const day = todayIso.replace(/-/g, '');
  const title = tr('Log today\'s spending');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hisaab//Daily reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:daily-reminder@money-log',
    `DTSTAMP:${stamp(nowIso)}`,
    `DTSTART:${day}T${t.replace(':', '')}00`,
    `DTEND:${day}T${endOf(t, 10)}00`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${text(title)}`,
    `DESCRIPTION:${text(tr('Open Hisaab and add today\'s payments: {0}', appUrl))}`,
    `URL:${appUrl}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

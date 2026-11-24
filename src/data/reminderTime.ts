// The time of day the person chose for the nightly reminder (localStorage; this phone only). Reads and writes never throw.
import { DEFAULT_REMINDER_TIME, cleanReminderTime } from '../core/reminder.ts';

const KEY = 'money-log.reminder-time';

export function loadReminderTime(): string {
  try { return cleanReminderTime(localStorage.getItem(KEY)); } catch { return DEFAULT_REMINDER_TIME; }
}

export function saveReminderTime(time: string): void {
  try { localStorage.setItem(KEY, cleanReminderTime(time)); } catch { /* the default is offered next time */ }
}

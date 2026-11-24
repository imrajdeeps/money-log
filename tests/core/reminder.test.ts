import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REMINDER_TIME, buildReminderIcs, cleanReminderTime } from '../../src/core/reminder.ts';
import { whatsappLink } from '../../src/core/share.ts';

test('a reminder time is HH:MM, or the default', () => {
  assert.equal(cleanReminderTime('07:05'), '07:05');
  assert.equal(cleanReminderTime('23:59'), '23:59');
  for (const bad of ['', '7:05', '24:00', '12:60', 'noon', null, undefined, 930]) assert.equal(cleanReminderTime(bad), DEFAULT_REMINDER_TIME);
});

test('the reminder file repeats daily, alerts at the start and keeps one UID', () => {
  const ics = buildReminderIcs('21:30', '2026-11-24', '2026-11-24T10:00:00.000Z', 'https://x.github.io/money-log/');
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-2), 'END:VCALENDAR');
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(lines.includes('RRULE:FREQ=DAILY'));
  assert.ok(lines.includes('DTSTART:20261124T213000'), 'a local ("floating") time, so it follows the phone');
  assert.ok(lines.includes('DTEND:20261124T214000'));
  assert.ok(lines.includes('TRIGGER:PT0M'));
  assert.ok(lines.includes('UID:daily-reminder@money-log'), 'the same UID every time: a new file replaces the old event');
  assert.ok(lines.includes('DTSTAMP:20261124T100000Z'));
  assert.ok(lines.includes('URL:https://x.github.io/money-log/'));
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 1);
});

test('an event late in the evening ends on the same calendar day', () => {
  const ics = buildReminderIcs('23:55', '2026-12-31', '2026-12-31T10:00:00.000Z', 'https://x/');
  assert.ok(ics.includes('DTSTART:20261231T235500'));
  assert.ok(ics.includes('DTEND:20261231T235900'), 'capped at 23:59, never past midnight');
});

test('a bad time still makes a valid file at the default time', () => {
  assert.ok(buildReminderIcs('soon', '2026-11-24', '2026-11-24T10:00:00.000Z', 'https://x/').includes('DTSTART:20261124T213000'));
});

test('the apostrophe and the link in the text are escaped for a calendar', () => {
  const ics = buildReminderIcs('08:00', '2026-11-24', '2026-11-24T10:00:00.000Z', 'https://x/a;b,c');
  assert.ok(ics.includes("DESCRIPTION:Open Money Log and add today's payments: https://x/a\\;b\\,c"), 'a semicolon and a comma are escaped in text');
});

test('a WhatsApp link carries the text and no phone number', () => {
  const url = whatsappLink('Join "Goa" on Money Log: https://x/#join=abc (code ABCD-EF01-2345)');
  assert.ok(url.startsWith('https://wa.me/?text='));
  assert.ok(!/wa\.me\/\d/.test(url), 'no number in the address');
  assert.equal(decodeURIComponent(url.slice('https://wa.me/?text='.length)), 'Join "Goa" on Money Log: https://x/#join=abc (code ABCD-EF01-2345)');
  assert.ok(!url.includes('#'), 'the # of the link inside the text is encoded, so WhatsApp gets it whole');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agoText, deviceName, eventLabel, parseSessions, parseSignInLog } from '../../src/core/signins.ts';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.0.0 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 16; SM-S950B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/140.0.0.0 Mobile Safari/537.36',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
  operaLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 OPR/120.0.0.0',
  chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
};

test('a user agent becomes the browser and the system in two short words', () => {
  assert.equal(deviceName(UA.chromeMac), 'Chrome on Mac');
  assert.equal(deviceName(UA.safariMac), 'Safari on Mac');
  assert.equal(deviceName(UA.safariIphone), 'Safari on iPhone');
  assert.equal(deviceName(UA.chromeIphone), 'Chrome on iPhone');
  assert.equal(deviceName(UA.chromeAndroid), 'Chrome on Android');
  assert.equal(deviceName(UA.samsung), 'Samsung Internet on Android');
  assert.equal(deviceName(UA.firefoxWindows), 'Firefox on Windows');
  assert.equal(deviceName(UA.edgeWindows), 'Edge on Windows');
  assert.equal(deviceName(UA.operaLinux), 'Opera on Linux');
  assert.equal(deviceName(UA.chromeOs), 'Chrome on ChromeOS');
  assert.equal(deviceName(UA.ipad), 'Safari on iPad');
});

test('an unknown or empty user agent says so, and a half-known one names what it can', () => {
  assert.equal(deviceName(''), 'Unknown device');
  assert.equal(deviceName('curl/8.7.1'), 'Unknown device');
  assert.equal(deviceName('Mozilla/5.0 (Windows NT 10.0)'), 'Windows');
  assert.equal(deviceName('SomeBrowser Chrome/150.0'), 'Chrome');
});

test('how long ago, in the words the lists use', () => {
  const now = 10 * 86_400_000;
  assert.equal(agoText(now, now), 'just now');
  assert.equal(agoText(now, now - 59_999), 'just now');
  assert.equal(agoText(now, now - 60_000), '1 min ago');
  assert.equal(agoText(now, now - 59 * 60_000), '59 min ago');
  assert.equal(agoText(now, now - 3_600_000), '1 h ago');
  assert.equal(agoText(now, now - 23 * 3_600_000), '23 h ago');
  assert.equal(agoText(now, now - 86_400_000), '1 days ago');
  assert.equal(agoText(now, now - 3 * 86_400_000), '3 days ago');
  assert.equal(agoText(now, now + 5000), 'just now', 'a time in the future (clock difference) is not shown as negative');
});

test('events are put in plain words, and one that is not known is shown as it is', () => {
  assert.equal(eventLabel('login'), 'Signed in');
  assert.equal(eventLabel('user_signedup'), 'Account created');
  assert.equal(eventLabel('user_recovery_requested'), 'Password reset link asked for');
  assert.equal(eventLabel('user_modified'), 'Account or password changed');
  assert.equal(eventLabel('logout'), 'Signed out');
  assert.equal(eventLabel('token_revoked'), 'A sign-in was ended');
  assert.equal(eventLabel('something_new'), 'something_new');
  assert.equal(eventLabel('toString'), 'toString', 'a name every object has is not an event');
});

test('sessions from the server are checked, sorted newest first, and a bad row is dropped', () => {
  const rows = [
    { id: 'a', created_at: '2026-11-10T08:00:00Z', refreshed_at: '2026-11-10T09:00:00Z', user_agent: UA.chromeMac, is_current: false },
    { id: 'b', created_at: '2026-11-11T08:00:00Z', refreshed_at: null, user_agent: null, is_current: true },
    { id: '', created_at: '2026-11-11T08:00:00Z' },
    { id: 'c', created_at: 'yesterday' },
    { id: 'd', created_at: '2026-11-09T08:00:00Z', refreshed_at: '2026-11-01T00:00:00Z', is_current: 'yes' },
    null,
    'text',
  ];
  const s = parseSessions(rows);
  assert.deepEqual(s.map((x) => x.id), ['b', 'a', 'd']);
  assert.equal(s[0]!.isCurrent, true);
  assert.equal(s[0]!.userAgent, '');
  assert.equal(s[0]!.lastMs, s[0]!.createdMs, 'no refresh time: last active is when it began');
  assert.equal(s[2]!.lastMs, s[2]!.createdMs, 'a refresh time before the start is not believed');
  assert.equal(s[2]!.isCurrent, false, 'only a true counts');
  assert.deepEqual(parseSessions(null), []);
  assert.deepEqual(parseSessions({ id: 'a' }), []);
});

test('the sign-in record is checked and sorted newest first', () => {
  const log = parseSignInLog([
    { at: '2026-11-10T08:00:00Z', action: 'login' },
    { at: '2026-11-11T08:00:00Z', action: 'user_modified' },
    { at: 'never', action: 'login' },
    { at: '2026-11-11T09:00:00Z', action: '' },
    { at: '2026-11-11T10:00:00Z' },
    7,
  ]);
  assert.deepEqual(log.map((e) => e.action), ['user_modified', 'login']);
  assert.deepEqual(parseSignInLog(undefined), []);
});

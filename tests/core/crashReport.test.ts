import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CRASHES, addCrash, buildReport, cleanPath, describeError, isIgnorable } from '../../src/core/crashReport.ts';
import type { Crash, ReportContext } from '../../src/core/crashReport.ts';

const ctx: ReportContext = { version: '1.34.0', now: '2026-11-25T10:00:00.000Z', href: 'https://example.github.io/money-log/groups/0a1b2c3d-0000-4000-8000-000000000001/settings?x=1#sms=Rs%20450%20spent', userAgent: 'TestBrowser/1.0', lang: 'en', online: true, standalone: false };
const crash = (message: string, where: Crash['where'] = 'error'): Crash => ({ message, name: 'Error', stack: '', where, at: ctx.now });

test('what was thrown is read as an error, text, an object or nothing', () => {
  const e = new Error('boom');
  assert.deepEqual([describeError(e).message, describeError(e).name], ['boom', 'Error']);
  assert.ok(describeError(e).stack.split('\n').length <= 8);
  assert.ok(!describeError(e).stack.startsWith('Error: boom'), 'the message is not repeated in the stack');
  const noHead = new Error('x'); noHead.stack = 'frame one\nframe two';
  assert.equal(describeError(noHead).stack, 'frame one\nframe two', 'a stack without the message is kept whole');
  assert.equal(describeError('plain text').message, 'plain text');
  assert.equal(describeError({ message: 'from an object', name: 'Custom' }).name, 'Custom');
  assert.equal(describeError(undefined).message, 'An error without a message');
  assert.equal(describeError({ other: 1 }).message, 'An error without a message');
});

test('a long message is cut, and anything after ? or # in an address is removed', () => {
  assert.ok(describeError('x'.repeat(1000)).message.length <= 301);
  const m = describeError(new Error('failed at https://example.github.io/money-log/add#sms=Rs%20450%20spent%20at%20Swiggy and https://a.b/c?token=secret more')).message;
  assert.ok(!m.includes('Swiggy') && !m.includes('#sms'), m);
  assert.ok(!m.includes('token=secret'), m);
  assert.ok(m.includes('https://example.github.io/money-log/add'), m);
});

test('an email address in an error text is hidden', () => {
  const d = describeError(new Error('Sign-in failed for rajdeep.s+test@example.co.in: not allowed'));
  assert.ok(!d.message.includes('@') && d.message.includes('(email)'), d.message);
  assert.equal(describeError('Mail a@b to c').message, 'Mail a@b to c', 'something that is not an address is left alone');
});

test('harmless noise is ignored; real errors are not', () => {
  assert.equal(isIgnorable({ message: 'ResizeObserver loop completed with undelivered notifications.', name: 'Error' }), true);
  assert.equal(isIgnorable({ message: 'Script error.', name: 'Error' }), true);
  assert.equal(isIgnorable({ message: 'The user aborted a request.', name: 'AbortError' }), true);
  assert.equal(isIgnorable({ message: 'x is not a function', name: 'TypeError' }, 'chrome-extension://abc/inject.js'), true);
  assert.equal(isIgnorable({ message: 'x is not a function', name: 'TypeError' }, 'https://example.github.io/money-log/assets/index.js'), false);
  assert.equal(isIgnorable({ message: 'Cannot read properties of undefined', name: 'TypeError' }), false);
});

test('the page name has no address start, no query or hash, and no long ids', () => {
  assert.equal(cleanPath(ctx.href), '/money-log/groups/:id/settings');
  assert.equal(cleanPath('not a url'), '(unknown)');
});

test('the same error twice in a row is kept once, and only the latest few are kept', () => {
  let list: Crash[] = [];
  list = addCrash(list, crash('a'));
  list = addCrash(list, crash('a'));
  assert.equal(list.length, 1);
  list = addCrash(list, crash('a', 'promise'));
  assert.equal(list.length, 2, 'the same text from another source is a different crash');
  for (let i = 0; i < 10; i++) list = addCrash(list, crash(`e${i}`));
  assert.equal(list.length, MAX_CRASHES);
  assert.equal(list.at(-1)?.message, 'e9');
});

test('the report names the version, page and browser, lists the errors, and holds nothing of the address after the page name', () => {
  const r = buildReport([crash('first'), { ...crash('second', 'screen'), stack: 'at x (file.js:1:2)' }], ctx);
  assert.ok(r.startsWith('Money Log 1.34.0\nTime: 2026-11-25T10:00:00.000Z\nPage: /money-log/groups/:id/settings\n'), r);
  assert.ok(r.includes('Browser: TestBrowser/1.0'));
  assert.ok(r.includes('Language: en; online; in the browser'));
  assert.ok(r.includes('#1 (error, ') && r.includes('#2 (screen, ') && r.includes('Error: second\nat x (file.js:1:2)'));
  assert.ok(!r.includes('sms') && !r.includes('450') && !r.includes('0a1b2c3d'), r);
  assert.ok(buildReport([], { ...ctx, online: false, standalone: true }).includes('offline; installed app'));
});

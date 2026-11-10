import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCK_TIMEOUTS, checkPin, cleanLock, delayAfter, makeLock, registerFailure, secondsToWait, shouldLock, validPin } from '../../src/data/lock.ts';
import type { LockConfig, LockTries } from '../../src/data/lock.ts';

test('a PIN is 4 to 8 digits', () => {
  for (const ok of ['1234', '000000', '12345678']) assert.ok(validPin(ok), ok);
  for (const bad of ['', '123', '123456789', '12a4', '12 34', '１２３４', '-1234', '12.34']) assert.ok(!validPin(bad), bad);
});

test('the right PIN opens it and a wrong one does not; the PIN itself is not stored', async () => {
  const cfg = await makeLock('4821', 60);
  assert.ok(await checkPin(cfg, '4821'));
  for (const wrong of ['4822', '0000', '48210', '', 'abcd', '482']) assert.ok(!(await checkPin(cfg, wrong)), wrong);
  assert.ok(!JSON.stringify(cfg).includes('4821'));
  assert.equal(cfg.timeoutSec, 60);
  assert.ok(cfg.iterations >= 100_000);
});

test('two locks for the same PIN differ (random salt), and a PIN that is too short is refused', async () => {
  const a = await makeLock('1234', 0);
  const b = await makeLock('1234', 0);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.ok(await checkPin(a, '1234') && await checkPin(b, '1234'));
  await assert.rejects(makeLock('12', 0), /4 to 8 digits/);
});

test('cleanLock accepts what makeLock made and refuses damaged data', async () => {
  const cfg = await makeLock('9999', 300);
  assert.deepEqual(cleanLock(JSON.parse(JSON.stringify(cfg))), cfg);
  const bad = (over: object) => assert.equal(cleanLock({ ...cfg, ...over }), null, JSON.stringify(over).slice(0, 50));
  bad({ v: 2 }); bad({ salt: 5 }); bad({ iterations: 10 }); bad({ iterations: 1e9 }); bad({ timeoutSec: -1 }); bad({ timeoutSec: 99999 }); bad({ hash: '***' });
  assert.equal(cleanLock(null), null);
});

test('wrong PINs cost nothing at first, then more and more waiting, capped at 15 minutes', () => {
  assert.deepEqual([0, 1, 4, 5, 6, 7, 8, 9, 20].map(delayAfter), [0, 0, 0, 30, 60, 120, 240, 480, 900]);
  let t: LockTries = { fails: 0, until: 0 };
  const now = 1_000_000;
  for (let i = 0; i < 4; i++) t = registerFailure(t, now);
  assert.equal(secondsToWait(t, now), 0, 'four wrong tries are free');
  t = registerFailure(t, now);
  assert.equal(t.fails, 5);
  assert.equal(secondsToWait(t, now), 30);
  assert.equal(secondsToWait(t, now + 10_000), 20);
  assert.equal(secondsToWait(t, now + 31_000), 0);
});

test('the app locks again only after it was away for the chosen time', () => {
  const at = (timeoutSec: number): LockConfig => ({ v: 1, salt: 'AA==', iterations: 1000, hash: 'AA==', timeoutSec });
  assert.ok(!shouldLock(null, 0, 99_999), 'no lock set up');
  assert.ok(!shouldLock(at(0), null, 5), 'it was never away');
  assert.ok(shouldLock(at(0), 1000, 1001), 'every time');
  assert.ok(!shouldLock(at(60), 0, 59_999));
  assert.ok(shouldLock(at(60), 0, 60_000));
  assert.ok(shouldLock(at(300), 0, 301_000));
  assert.deepEqual(LOCK_TIMEOUTS.map((x) => x.sec), [0, 60, 300]);
});

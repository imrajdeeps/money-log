// The optional PIN lock: pure helpers, no DOM and no storage.
//
// What it is: a screen that covers the app when it opens or comes back after a while, until the right PIN is typed. What it
// is NOT: encryption. The payments stay readable inside this browser's storage for anyone who can open its developer tools,
// so the lock only stops someone glancing at an unlocked phone. The phone's own lock is the real protection.

import { tr } from '../core/i18n.ts';

export interface LockConfig {
  v: 1;
  salt: string; // base64
  iterations: number;
  hash: string; // base64 of PBKDF2-SHA-256(pin, salt)
  timeoutSec: number; // lock again after the app has been in the background this long; 0 = every time
}

// What is remembered between attempts, so closing and reopening the app does not reset the delay.
export interface LockTries { fails: number; until: number } // until = epoch ms before which no attempt is accepted

export const LOCK_TIMEOUTS: { sec: number; label: string }[] = [
  { sec: 0, label: 'Every time I leave the app' },
  { sec: 60, label: 'After 1 minute away' },
  { sec: 300, label: 'After 5 minutes away' },
];

const PIN_RE = /^\d{4,8}$/;
const ITERATIONS = 150_000;

export const validPin = (pin: string): boolean => PIN_RE.test(pin);

const b64 = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function makeLock(pin: string, timeoutSec: number): Promise<LockConfig> {
  if (!validPin(pin)) throw new Error(tr('A PIN is 4 to 8 digits.'));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { v: 1, salt: b64(salt), iterations: ITERATIONS, hash: b64(await derive(pin, salt, ITERATIONS)), timeoutSec };
}

// Compares every byte, so the time taken does not reveal how much of the PIN was right.
export async function checkPin(cfg: LockConfig, pin: string): Promise<boolean> {
  if (!validPin(pin)) return false;
  const got = new Uint8Array(await derive(pin, unb64(cfg.salt), cfg.iterations));
  const want = unb64(cfg.hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ want[i]!;
  return diff === 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanLock(x: any): LockConfig | null {
  if (!x || x.v !== 1 || typeof x.salt !== 'string' || typeof x.hash !== 'string') return null;
  if (!Number.isInteger(x.iterations) || x.iterations < 1000 || x.iterations > 5_000_000) return null;
  if (!Number.isInteger(x.timeoutSec) || x.timeoutSec < 0 || x.timeoutSec > 86400) return null;
  try { unb64(x.salt); unb64(x.hash); } catch { return null; }
  return { v: 1, salt: x.salt, iterations: x.iterations, hash: x.hash, timeoutSec: x.timeoutSec };
}

// The first 4 wrong PINs cost nothing; after that each one makes the wait longer: 30 s, 1 min, 2 min, ... at most 15 min.
export function delayAfter(fails: number): number {
  if (fails < 5) return 0;
  return Math.min(900, 30 * 2 ** (fails - 5));
}

export function registerFailure(t: LockTries, nowMs: number): LockTries {
  const fails = t.fails + 1;
  return { fails, until: delayAfter(fails) ? nowMs + delayAfter(fails) * 1000 : 0 };
}

export const secondsToWait = (t: LockTries, nowMs: number): number => Math.max(0, Math.ceil((t.until - nowMs) / 1000));

// Lock when the app was away for at least the chosen time (0 = any time away at all).
export function shouldLock(cfg: LockConfig | null, hiddenAtMs: number | null, nowMs: number): boolean {
  if (!cfg || hiddenAtMs === null) return false;
  return nowMs - hiddenAtMs >= cfg.timeoutSec * 1000;
}

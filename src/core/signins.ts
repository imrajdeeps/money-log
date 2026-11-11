// Where the account is signed in and what happened to it: the two read-only lists the database functions my_sessions and
// my_sign_in_log return (supabase/schema.sql), checked and made readable. Pure. See docs/prd-login-history.md.
import { tr } from './i18n.ts';
import { parseTs } from './logic.ts';

export interface SessionInfo { id: string; createdMs: number; lastMs: number; userAgent: string; isCurrent: boolean }
export interface SignInEvent { atMs: number; action: string }

// ---------------------------------------------------------------- reading the rows
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSession(r: any): SessionInfo | null {
  if (!r || typeof r.id !== 'string' || !r.id) return null;
  const createdMs = parseTs(r.created_at);
  const lastMs = parseTs(r.refreshed_at);
  if (!Number.isFinite(createdMs)) return null;
  return { id: r.id, createdMs, lastMs: Number.isFinite(lastMs) ? Math.max(lastMs, createdMs) : createdMs, userAgent: typeof r.user_agent === 'string' ? r.user_agent.slice(0, 400) : '', isCurrent: r.is_current === true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSessions(rows: any): SessionInfo[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(toSession).filter((s): s is SessionInfo => s !== null).sort((a, b) => b.createdMs - a.createdMs);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSignInLog(rows: any): SignInEvent[] {
  if (!Array.isArray(rows)) return [];
  const out: SignInEvent[] = [];
  for (const r of rows) {
    const atMs = parseTs(r?.at);
    if (typeof r?.action === 'string' && r.action !== '' && Number.isFinite(atMs)) out.push({ atMs, action: r.action });
  }
  return out.sort((a, b) => b.atMs - a.atMs);
}

// ---------------------------------------------------------------- words
const EVENT_TEXT: Record<string, () => string> = {
  login: () => tr('Signed in'),
  user_signedup: () => tr('Account created'),
  user_recovery_requested: () => tr('Password reset link asked for'),
  user_modified: () => tr('Account or password changed'),
  logout: () => tr('Signed out'),
  token_revoked: () => tr('A sign-in was ended'),
};

/** What an event of the server's record says, in plain words (an action not known here is shown as it is). */
export const eventLabel = (action: string): string => (Object.hasOwn(EVENT_TEXT, action) ? EVENT_TEXT[action]!() : action);

// The browser and the system a user agent names, as short words ("Chrome on Mac"). Order matters: Edge, Opera and Chrome on iPhone all
// also say "Chrome" or "Safari", and Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/SamsungBrowser\//, 'Samsung Internet'], [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'], [/Safari\//, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'], [/iPad/, 'iPad'], [/Android/, 'Android'], [/Windows/, 'Windows'], [/CrOS/, 'ChromeOS'],
  [/Macintosh|Mac OS X/, 'Mac'], [/Linux|X11/, 'Linux'],
];
const firstMatch = (table: [RegExp, string][], ua: string): string | null => table.find(([re]) => re.test(ua))?.[1] ?? null;

export function deviceName(userAgent: string): string {
  const browser = firstMatch(BROWSERS, userAgent);
  const system = firstMatch(SYSTEMS, userAgent);
  if (browser && system) return tr('{0} on {1}', browser, system);
  return browser ?? system ?? tr('Unknown device');
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function agoText(nowMs: number, thenMs: number): string {
  const d = Math.max(0, nowMs - thenMs);
  if (d < MINUTE) return tr('just now');
  if (d < HOUR) return tr('{0} min ago', Math.floor(d / MINUTE));
  if (d < DAY) return tr('{0} h ago', Math.floor(d / HOUR));
  return tr('{0} days ago', Math.floor(d / DAY));
}

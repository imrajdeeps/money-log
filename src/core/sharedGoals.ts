// Shared goals (version 1.29): one target and day, and each person adds their own top-ups. The server keeps them and answers with one
// document (my_shared_goals); this file cleans that document, adds it up and checks what a person types. Pure: no DOM, no network.
import { isValidDate, parseAmount, round2 } from './logic.ts';
import { tr } from './i18n.ts';

export type MemberState = 'invited' | 'active' | 'left';
export interface SharedMember { user_id: string; name: string; state: MemberState } // name: what that person chose (empty until they accept)
export interface SharedTopUp { id: string; user_id: string; amount: number; date: string }
export interface SharedGoal {
  id: string;
  name: string;
  target: number;
  date: string;
  created_by: string;
  me: 'invited' | 'active'; // an invitation shows only the goal and who made it; the people and top-ups come with joining
  creator_name: string;
  members: SharedMember[];
  topups: SharedTopUp[];
}

export const MAX_SHARED_PEOPLE = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isState = (v: unknown): v is MemberState => v === 'invited' || v === 'active' || v === 'left';
const asList = (v: unknown): any[] => (Array.isArray(v) ? v : []);

function cleanMember(m: any): SharedMember | null {
  if (!m || !isId(m.user_id) || !isState(m.state)) return null;
  return { user_id: m.user_id.toLowerCase(), name: typeof m.name === 'string' ? m.name.slice(0, 40) : '', state: m.state };
}

function cleanTopUp(t: any): SharedTopUp | null {
  const amount = typeof t?.amount === 'number' ? t.amount : Number(t?.amount);
  if (!t || !isId(t.id) || !isId(t.user_id) || !Number.isFinite(amount) || amount <= 0 || !isValidDate(t.date)) return null;
  return { id: t.id.toLowerCase(), user_id: t.user_id.toLowerCase(), amount: round2(amount), date: t.date };
}

function cleanGoal(g: any): SharedGoal | null {
  const target = typeof g?.target === 'number' ? g.target : Number(g?.target);
  if (!g || !isId(g.id) || !isId(g.created_by) || typeof g.name !== 'string' || g.name === '' || !Number.isFinite(target) || target <= 0 || !isValidDate(g.date)) return null;
  if (g.me !== 'invited' && g.me !== 'active') return null;
  return {
    id: g.id.toLowerCase(),
    name: g.name.slice(0, 60),
    target: round2(target),
    date: g.date,
    created_by: g.created_by.toLowerCase(),
    me: g.me,
    creator_name: typeof g.creator_name === 'string' ? g.creator_name.slice(0, 40) : '',
    members: asList(g.members).map(cleanMember).filter((m): m is SharedMember => m !== null),
    topups: asList(g.topups).map(cleanTopUp).filter((t): t is SharedTopUp => t !== null),
  };
}

/** The document my_shared_goals returns, checked row by row; anything that is not the expected shape is dropped. */
export function parseSharedGoals(doc: unknown): SharedGoal[] {
  const goals = asList((doc as { goals?: unknown } | null)?.goals);
  return goals.map(cleanGoal).filter((g): g is SharedGoal => g !== null);
}

export interface SharedPerson { user_id: string; name: string; state: MemberState; amount: number }
export interface SharedProgress { saved: number; remaining: number; fraction: number; reached: boolean; people: SharedPerson[] }

/** What has been put in, how far that is, and what each person put in (everyone listed, even with nothing; those who left too). */
export function sharedProgress(goal: SharedGoal): SharedProgress {
  const by = new Map<string, number>();
  for (const t of goal.topups) by.set(t.user_id, round2((by.get(t.user_id) ?? 0) + t.amount));
  const saved = round2([...by.values()].reduce((a, b) => a + b, 0));
  const known = new Set(goal.members.map((m) => m.user_id));
  const people: SharedPerson[] = goal.members.filter((m) => m.state !== 'invited').map((m) => ({ ...m, amount: by.get(m.user_id) ?? 0 }));
  for (const [uid, amount] of by) if (!known.has(uid)) people.push({ user_id: uid, name: '', state: 'left', amount });
  people.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return { saved, remaining: Math.max(0, round2(goal.target - saved)), fraction: Math.min(1, saved / goal.target), reached: saved >= goal.target, people };
}

export interface SharedInput { name: string; target: string; date: string }
export type SharedChecked = { ok: true; name: string; target: number; date: string } | { ok: false; error: string };

/** What a person typed for a shared goal. A new goal needs a day after today; an existing one keeps the day it has, even a past one. */
export function checkSharedInput(i: SharedInput, todayIso: string, isNew: boolean): SharedChecked {
  const name = i.name.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 60) return { ok: false, error: tr('Give the goal a name of 1 to 60 characters.') };
  const target = parseAmount(i.target);
  if (target === null) return { ok: false, error: tr('Enter a target above zero, with at most two decimals.') };
  if (!isValidDate(i.date)) return { ok: false, error: tr('Pick a target date.') };
  if (isNew && i.date <= todayIso) return { ok: false, error: tr('Pick a target date after today.') };
  return { ok: true, name, target, date: i.date };
}

/** A person's name in a goal: what they chose, else what the Circle calls them, else a plain word. */
export const sharedName = (m: { user_id: string; name: string }, circleName: (id: string) => string): string => m.name || circleName(m.user_id) || tr('Someone');

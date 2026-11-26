// Shared udhaar (version 2.0): an entry written with someone in your Circle that both of you see. The server keeps it and answers with
// one document (my_shared_udhaar), each entry told from the caller's side; this file cleans that document, sorts it into what needs an
// answer, what is open and what is settled, and adds it into the Udhaar totals. Entries with anyone else stay private on the phone
// (udhaar.ts). Pure: no DOM, no network.
import { isValidDate, round2 } from './logic.ts';
import type { UdhaarWay } from './goals.ts';
import type { UdhaarPerson, UdhaarTotals } from './udhaar.ts';

export type SharedUdhaarState = 'invited' | 'active' | 'declined';
export interface SharedUdhaar {
  id: string;
  mine: boolean; // I wrote it
  way: UdhaarWay; // from my side: 'gave' = I lent, 'took' = I borrowed
  amount: number;
  date: string;
  note: string;
  who: string; // the other person's name
  whoId: string;
  state: SharedUdhaarState;
  settled: boolean;
  settledByMe: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isState = (v: unknown): v is SharedUdhaarState => v === 'invited' || v === 'active' || v === 'declined';
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanEntry(e: any): SharedUdhaar | null {
  const amount = typeof e?.amount === 'number' ? e.amount : Number(e?.amount);
  if (!e || !isId(e.id) || !isId(e.who_id) || (e.way !== 'gave' && e.way !== 'took') || !isState(e.state)) return null;
  if (!Number.isFinite(amount) || amount <= 0 || !isValidDate(e.date)) return null;
  return {
    id: e.id.toLowerCase(), mine: e.mine === true, way: e.way, amount: round2(amount), date: e.date, note: text(e.note, 100),
    who: text(e.who, 40), whoId: e.who_id.toLowerCase(), state: e.state, settled: e.settled === true, settledByMe: e.settled_by_me === true,
  };
}

/** The document my_shared_udhaar returns, checked row by row; anything that is not the expected shape is dropped. */
export function parseSharedUdhaar(doc: unknown): SharedUdhaar[] {
  const list = (doc as { entries?: unknown } | null)?.entries;
  return (Array.isArray(list) ? list : []).map(cleanEntry).filter((e): e is SharedUdhaar => e !== null);
}

export interface SharedUdhaarParts { toAnswer: SharedUdhaar[]; open: SharedUdhaar[]; declined: SharedUdhaar[]; settled: SharedUdhaar[] }

/** What someone shared with me and waits for my answer; what is open (mine waiting for the other person count too); what the other
 *  person said is not right; and what is settled. */
export function splitShared(list: readonly SharedUdhaar[]): SharedUdhaarParts {
  const parts: SharedUdhaarParts = { toAnswer: [], open: [], declined: [], settled: [] };
  for (const e of list) {
    if (e.state === 'declined') parts.declined.push(e);
    else if (e.state === 'invited' && !e.mine) parts.toAnswer.push(e);
    else if (e.settled) parts.settled.push(e);
    else parts.open.push(e);
  }
  return parts;
}

/** Whether an entry counts in the totals: open, and either accepted or written by me (my own record, while the other person decides). */
export const sharedCounts = (e: SharedUdhaar): boolean => !e.settled && (e.state === 'active' || (e.state === 'invited' && e.mine));

/** The private totals with the shared entries added, one line per Circle person (kept apart from a private name that happens to match). */
export function withShared(t: UdhaarTotals, list: readonly SharedUdhaar[]): UdhaarTotals {
  const by = new Map<string, UdhaarPerson>();
  for (const e of list) {
    if (!sharedCounts(e)) continue;
    const key = `@${e.whoId}`;
    const cur = by.get(key) ?? { key, name: e.who, net: 0, open: 0 };
    cur.net = round2(cur.net + (e.way === 'gave' ? e.amount : -e.amount));
    cur.open += 1;
    by.set(key, cur);
  }
  const people = [...t.people, ...by.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
  const owedToMe = round2(people.filter((p) => p.net > 0).reduce((s, p) => s + p.net, 0));
  const iOwe = round2(people.filter((p) => p.net < 0).reduce((s, p) => s - p.net, 0));
  return { owedToMe, iOwe, people };
}

export interface PersonLine { whoId: string; who: string; net: number; waiting: boolean }

/** One line per Circle person with an open shared entry, for the Groups page ("Between you and Aman"): the net, and whether any of it
 *  still waits for the other person's answer. Settled to zero means no line. */
export function personLines(list: readonly SharedUdhaar[]): PersonLine[] {
  const by = new Map<string, PersonLine>();
  for (const e of list) {
    if (!sharedCounts(e)) continue;
    const cur = by.get(e.whoId) ?? { whoId: e.whoId, who: e.who, net: 0, waiting: false };
    cur.net = round2(cur.net + (e.way === 'gave' ? e.amount : -e.amount));
    cur.waiting = cur.waiting || e.state === 'invited';
    by.set(e.whoId, cur);
  }
  return [...by.values()].filter((p) => p.net !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.who.localeCompare(b.who));
}

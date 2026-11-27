// Simplify repayments (version 2.1), a setting of each group. On: the fewest payments that settle everyone (simplifyDebts in groups.ts),
// so someone may pay a person they did not share that expense with. Off: each person pays back exactly whom they owe, and two people's
// debts to each other cancel out; each payment can then say what it is for. Both lists move the same money: everyone's total is the same.
// Pure: no DOM, no storage.
import type { Entry } from './logic.ts';
import type { Debt, Settlement } from './groups.ts';
import { fromPaise, simplifyDebts, toPaise } from './groups.ts';

/** One thing a pair's payment is made of: a shared expense (its name), or money already paid back between them (what = null). */
export interface Part { what: string | null; paise: number }
/** A payment between two people, with what `from` owes `to` for (owes) and what comes off it (less). */
export interface PairDebt extends Debt { owes: Part[]; less: Part[] }

const pairKey = (from: string, to: string): string => `${from}>${to}`;

/** What each person owes each other person in a group, before anything cancels: from>to -> the parts, in the order they happened. */
function owedParts(gid: string, entries: readonly Entry[], settlements: readonly Settlement[]): Map<string, Part[]> {
  const out = new Map<string, Part[]>();
  const add = (from: string, to: string, part: Part) => {
    if (from === to || part.paise <= 0) return;
    const k = pairKey(from, to);
    const list = out.get(k);
    if (list) list.push(part); else out.set(k, [part]);
  };
  const live = entries.filter((e) => e.group_id === gid && !e.deleted_at && e.paid_by && e.shares).sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1));
  for (const e of live) {
    for (const [uid, v] of Object.entries(e.shares!)) add(uid, e.paid_by!, { what: e.note || e.category, paise: toPaise(v) });
  }
  // a payment back from A to B takes that much off what A owes B (the same as B now owing A that much)
  for (const s of settlements) if (s.group_id === gid && !s.deleted_at) add(s.to_user, s.from_user, { what: null, paise: toPaise(s.amount) });
  return out;
}

const total = (parts: readonly Part[]): number => parts.reduce((n, p) => n + p.paise, 0);

/** Simplify off: one payment for each pair who owe each other, what they owe each other cancelled out; the biggest first. */
export function pairwiseDebts(gid: string, entries: readonly Entry[], settlements: readonly Settlement[]): PairDebt[] {
  const parts = owedParts(gid, entries, settlements);
  const done = new Set<string>();
  const out: PairDebt[] = [];
  for (const k of parts.keys()) {
    const [a, b] = k.split('>') as [string, string];
    if (done.has(pairKey(b, a))) continue;
    done.add(k);
    const ab = parts.get(k) ?? [];
    const ba = parts.get(pairKey(b, a)) ?? [];
    const net = total(ab) - total(ba);
    if (net > 0) out.push({ from: a, to: b, amount: fromPaise(net), owes: ab, less: ba });
    else if (net < 0) out.push({ from: b, to: a, amount: fromPaise(-net), owes: ba, less: ab });
  }
  return out.sort((x, y) => y.amount - x.amount || (x.from + x.to < y.from + y.to ? -1 : 1));
}

/** The list the group shows: simplified, or pair by pair. */
export function settleList(simplify: boolean, gid: string, entries: readonly Entry[], settlements: readonly Settlement[], balances: Record<string, number>): Debt[] {
  return simplify ? simplifyDebts(balances) : pairwiseDebts(gid, entries, settlements);
}

/** The parts of one pair's payment, grouped for a line: the expense names (in order, each once) with their total, and what was paid back. */
export function partsSummary(parts: readonly Part[]): { names: string[]; expenses: number; paidBack: number } {
  const names: string[] = [];
  let expenses = 0;
  let paidBack = 0;
  for (const p of parts) {
    if (p.what === null) { paidBack += p.paise; continue; }
    expenses += p.paise;
    if (!names.includes(p.what)) names.push(p.what);
  }
  return { names, expenses: fromPaise(expenses), paidBack: fromPaise(paidBack) };
}

/** Why a simplified payment of yours is what it is: what you owe or are owed pair by pair, and what you pay or get once simplified. */
export interface MyWhy { pairs: Debt[]; simplified: Debt[]; changed: boolean }

export function myWhy(me: string, simplified: readonly Debt[], pairs: readonly Debt[]): MyWhy {
  const mine = (d: Debt) => d.from === me || d.to === me;
  const myPairs = pairs.filter(mine);
  const mySimple = simplified.filter(mine);
  const sig = (list: readonly Debt[]) => list.map((d) => `${d.from}>${d.to}:${d.amount}`).sort().join(',');
  return { pairs: myPairs, simplified: mySimple, changed: sig(myPairs) !== sig(mySimple) };
}

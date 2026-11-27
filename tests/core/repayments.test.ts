import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBalances, simplifyDebts } from '../../src/core/groups.ts';
import type { Settlement } from '../../src/core/groups.ts';
import { myWhy, pairwiseDebts, partsSummary, settleList } from '../../src/core/repayments.ts';
import type { Entry } from '../../src/core/logic.ts';
import { pairLine, whyLines } from '../../src/features/groups/repaymentText.ts';

const G = '00000000-0000-4000-8000-0000000000f1';
const ME = 'me';
const AAKASH = 'aakash';
const MEERA = 'meera';
const T = '2026-11-20T10:00:00.000Z';
let n = 0;
const ex = (what: string, paidBy: string, shares: Record<string, number>, day = '2026-11-10'): Entry => ({
  id: `e${++n}`, owner_id: paidBy, entry_date: day, kind: 'out', category: 'Bills', amount: Object.values(shares).reduce((a, b) => a + b, 0), note: what,
  method: null, created_at: T, updated_at: T, deleted_at: null, exported_at: null, group_id: G, paid_by: paidBy, shares, share_of: null, dirty: 0,
});
const three = (paidBy: string, what: string, each: number, day?: string) => ex(what, paidBy, { [ME]: each, [AAKASH]: each, [MEERA]: each }, day);

// The design's Flat 4B: Aakash paid Wi-Fi, Gas and Water, Meera the groceries, you the electricity.
const entries = [three(AAKASH, 'Wi-Fi', 400), three(AAKASH, 'Gas', 432), three(AAKASH, 'Water', 300), three(MEERA, 'Groceries', 560), three(ME, 'Electricity', 400, '2026-11-12')];
const names: Record<string, string> = { [AAKASH]: 'Aakash', [MEERA]: 'Meera', [ME]: 'You' };
const nameOf = (u: string) => names[u]!;

test('pair by pair: each pays back exactly whom they owe, what two people owe each other cancelled', () => {
  const pairs = pairwiseDebts(G, entries, []);
  assert.deepEqual(pairs.map((d) => [d.from, d.to, d.amount]), [[ME, AAKASH, 732], [MEERA, AAKASH, 572], [ME, MEERA, 160]]);
  assert.equal(pairLine(pairs[0]! as never), 'Wi-Fi, Gas and Water ₹1,132, less Electricity ₹400');
  assert.equal(pairLine(pairs[2]! as never), 'Groceries ₹560, less Electricity ₹400');
});

test('both lists move the same money: everyone ends up even either way', () => {
  const bal = groupBalances(G, entries, []);
  const simple = simplifyDebts(bal);
  assert.deepEqual(simple.map((d) => [d.from, d.to, d.amount]), [[ME, AAKASH, 892], [MEERA, AAKASH, 412]]);
  const net = (list: { from: string; to: string; amount: number }[]) => {
    const m: Record<string, number> = {};
    for (const d of list) { m[d.from] = (m[d.from] ?? 0) - d.amount; m[d.to] = (m[d.to] ?? 0) + d.amount; }
    return m;
  };
  assert.deepEqual(net(pairwiseDebts(G, entries, [])), net(simple));
  assert.equal(settleList(true, G, entries, [], bal).length, 2);
  assert.equal(settleList(false, G, entries, [], bal).length, 3);
});

test('a payment back takes that much off, and a pair that is even drops out', () => {
  const paid: Settlement = { id: 's1', group_id: G, from_user: ME, to_user: MEERA, amount: 160, settle_date: '2026-11-20', created_by: ME, created_at: T, updated_at: T, deleted_at: null } as Settlement;
  const pairs = pairwiseDebts(G, entries, [paid]);
  assert.equal(pairs.some((d) => d.from === ME && d.to === MEERA), false);
  const half = { ...paid, amount: 60 };
  const p2 = pairwiseDebts(G, entries, [half]).find((d) => d.from === ME && d.to === MEERA)!;
  assert.equal(p2.amount, 100);
  assert.equal(pairLine(p2), 'Groceries ₹560, less Electricity ₹400, less ₹60 already paid');
  assert.deepEqual(partsSummary(p2.less), { names: ['Electricity'], expenses: 400, paidBack: 60 });
});

test('why your simplified payment is that amount', () => {
  const bal = groupBalances(G, entries, []);
  const w = myWhy(ME, simplifyDebts(bal), pairwiseDebts(G, entries, []));
  assert.equal(w.changed, true);
  assert.deepEqual(whyLines(w, ME, nameOf), ['₹732 you owe Aakash, plus ₹160 you owe Meera.', 'Simplified, you pay the same ₹892 in all: ₹892 to Aakash.']);
  const forAakash = myWhy(AAKASH, simplifyDebts(bal), pairwiseDebts(G, entries, []));
  const asAakash = (u: string) => ({ [ME]: 'Rajdeep', [MEERA]: 'Meera', [AAKASH]: 'You' })[u]!;
  assert.deepEqual(whyLines(forAakash, AAKASH, asAakash), ['Rajdeep owes you ₹732, plus Meera owes you ₹572.', 'Simplified, you get the same ₹1,304 in all: ₹892 from Rajdeep, ₹412 from Meera.']);
  const two = [ex('Dinner', AAKASH, { [ME]: 100, [AAKASH]: 100 })];
  assert.equal(myWhy(ME, simplifyDebts(groupBalances(G, two, [])), pairwiseDebts(G, two, [])).changed, false, 'nothing to explain when simplifying changes nothing');
});

test('money that only goes round in a loop cancels out: a settled group shows nothing, and no payment grows', () => {
  const C = 'chirag';
  const loop = [ex('Lunch', AAKASH, { [ME]: 100 }), ex('Taxi', C, { [AAKASH]: 100 })]; // you owe Aakash, Aakash owes Chirag
  const settled: Settlement = { id: 's9', group_id: G, from_user: ME, to_user: C, amount: 100, settle_date: '2026-11-20', created_by: ME, created_at: T, updated_at: T, deleted_at: null } as Settlement;
  assert.deepEqual(pairwiseDebts(G, loop, [settled]), [], 'you paid Chirag as the simplified list said: everyone is even');
  const bigger = [ex('Lunch', AAKASH, { [ME]: 300 }), ex('Taxi', C, { [AAKASH]: 100 }), ex('Tea', ME, { [C]: 100 })];
  const pairs = pairwiseDebts(G, bigger, []);
  assert.deepEqual(pairs.map((d) => [d.from, d.to, d.amount]), [[ME, AAKASH, 200]], 'the ₹100 loop cancels; what is left was owed already');
  assert.equal(pairLine(pairs[0]!), 'Lunch ₹300, less ₹100 that goes round the group and cancels out');
});

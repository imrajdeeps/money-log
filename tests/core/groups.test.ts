import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toPaise, fromPaise, equalShares, percentShares, computeShares, sharesPaise, groupBalances, simplifyDebts, memberName, activeMembers, ledger,
  makeSettlement, softDeleteSettlement, mergeRemoteSettlement, cleanGroup, cleanMember, cleanInvite, cleanSettlement,
  normalizeCode, formatCode, codeLooksValid, inviteLink, joinCodeFromHash,
} from '../../src/core/groups.ts';
import type { Member, Settlement } from '../../src/core/groups.ts';
import { budgetEntries, cleanEntry, editEntry, isMine, makeEntry, myShare, softDelete, summarizeMonth } from '../../src/core/logic.ts';
import type { Entry, Shares } from '../../src/core/logic.ts';
import { makeBackup, parseBackup } from '../../src/data/backup.ts';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const G = '10000000-0000-4000-8000-000000000001';
const T0 = '2026-11-09T10:00:00.000Z';
const [A, B, C, D] = [U(1), U(2), U(3), U(4)] as [string, string, string, string];

const shared = (payer: string, shares: Shares, over: Partial<Entry> = {}): Entry => {
  const amount = fromPaise(sharesPaise(shares));
  return { ...makeEntry({ amount, category: 'Dinner', method: 'UPI', note: 'dinner', date: '2026-11-09', group: { group_id: G, paid_by: payer, shares } }, T0), owner_id: payer, ...over };
};

// ---------------------------------------------------------------- splitting
test('paise conversion survives binary floating point', () => {
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(toPaise(33.34), 3334);
  assert.equal(fromPaise(3334), 33.34);
  assert.equal(toPaise(1234567.89), 123456789);
});

test('an equal split adds up exactly, gives the leftover paise to the same people on every phone', () => {
  const s = equalShares(100, [C, A, B]);
  assert.deepEqual(s, { [A]: 33.34, [B]: 33.33, [C]: 33.33 });
  assert.equal(sharesPaise(s), 10000);
  assert.deepEqual(equalShares(100, [A, B, C]), s, 'the order the people are listed in does not matter');
  assert.deepEqual(equalShares(0.01, [A, B, C]), { [A]: 0.01, [B]: 0, [C]: 0 });
  assert.deepEqual(equalShares(10, [A, A]), { [A]: 10 }, 'a person listed twice counts once');
  assert.deepEqual(equalShares(10, []), {});
  assert.equal(sharesPaise(equalShares(999999999.99, [A, B, C, D])), toPaise(999999999.99));
});

test('a percentage split adds up exactly and rounds the way a person would expect', () => {
  const s = percentShares(100, [{ id: A, pct: 33.33 }, { id: B, pct: 33.33 }, { id: C, pct: 33.34 }])!;
  assert.equal(sharesPaise(s), 10000);
  assert.deepEqual(s, { [A]: 33.33, [B]: 33.33, [C]: 33.34 });
  assert.deepEqual(percentShares(1000, [{ id: A, pct: 60 }, { id: B, pct: 40 }]), { [A]: 600, [B]: 400 });
  assert.deepEqual(percentShares(10, [{ id: A, pct: 100 }, { id: B, pct: 0 }]), { [A]: 10 }, 'a 0% share is left out');
  assert.equal(sharesPaise(percentShares(0.05, [{ id: A, pct: 50 }, { id: B, pct: 50 }])!), 5);
  assert.equal(percentShares(100, [{ id: A, pct: 60 }, { id: B, pct: 30 }]), null, 'must add up to 100');
  assert.equal(percentShares(100, [{ id: A, pct: -10 }, { id: B, pct: 110 }]), null);
  assert.equal(percentShares(100, []), null);
});

test('computeShares turns what is typed into shares, or says what is wrong', () => {
  const ids = [A, B, C];
  const all = new Set(ids);
  const ok = (r: ReturnType<typeof computeShares>) => { assert.equal(r.problem, null); return r.shares!; };
  assert.deepEqual(ok(computeShares('equal', 90, ids, all, {})), { [A]: 30, [B]: 30, [C]: 30 });
  assert.deepEqual(ok(computeShares('equal', 90, ids, new Set([B, C]), {})), { [B]: 45, [C]: 45 });
  assert.match(computeShares('equal', 90, ids, new Set(), {}).problem!, /at least one person/);
  assert.match(computeShares('equal', 0, ids, all, {}).problem!, /amount first/);
  assert.deepEqual(ok(computeShares('exact', 100, ids, all, { [A]: '60', [B]: '₹40', [C]: '' })), { [A]: 60, [B]: 40 });
  assert.match(computeShares('exact', 100, ids, all, { [A]: '60', [B]: '30' }).problem!, /add up to ₹90; the expense is ₹100/);
  assert.match(computeShares('exact', 100, ids, all, { [A]: '60.123', [B]: '40' }).problem!, /at most 2 decimals/);
  assert.match(computeShares('exact', 100, ids, all, { [A]: 'abc' }).problem!, /numbers/);
  assert.deepEqual(ok(computeShares('percent', 200, ids, all, { [A]: '50', [B]: '25', [C]: '25' })), { [A]: 100, [B]: 50, [C]: 50 });
  assert.match(computeShares('percent', 200, ids, all, { [A]: '50', [B]: '25' }).problem!, /add up to 75, not 100/);
  assert.deepEqual(ok(computeShares('exact', 0.3, ids, all, { [A]: '0.1', [B]: '0.2' })), { [A]: 0.1, [B]: 0.2 }, 'paise do not drift');
});

// ---------------------------------------------------------------- balances
test('balances follow the money: what each paid, minus their shares, plus settlements', () => {
  const entries = [
    shared(A, { [A]: 100, [B]: 100, [C]: 100 }),   // A paid 300 for three
    shared(B, { [A]: 75, [B]: 75 }),               // B paid 150 for A and B
  ];
  const pay = makeSettlement({ group_id: G, from_user: C, to_user: A, amount: 100, settle_date: '2026-11-10' }, C, T0);
  assert.deepEqual(groupBalances(G, entries, []), { [A]: 12500, [B]: -2500, [C]: -10000 });
  assert.deepEqual(groupBalances(G, entries, [pay]), { [A]: 2500, [B]: -2500, [C]: 0 });
  assert.deepEqual(simplifyDebts(groupBalances(G, entries, [pay])), [{ from: B, to: A, amount: 25 }]);
});

test('deleted expenses and settlements, and other groups, do not count', () => {
  const live = shared(A, { [A]: 50, [B]: 50 });
  const gone = softDelete(shared(A, { [A]: 500, [B]: 500 }), T0);
  const other = shared(A, { [A]: 70, [B]: 70 }, { group_id: '10000000-0000-4000-8000-000000000002' });
  const s = softDeleteSettlement(makeSettlement({ group_id: G, from_user: B, to_user: A, amount: 50, settle_date: '2026-11-10' }, B, T0), T0);
  assert.deepEqual(groupBalances(G, [live, gone, other], [s]), { [A]: 5000, [B]: -5000 });
});

test('simplifying debts settles everyone with the fewest payments, and always adds up (property test)', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const people = [A, B, C, D, U(5), U(6)];
  for (let round = 0; round < 200; round++) {
    const entries: Entry[] = [];
    for (let i = 0; i < 1 + Math.floor(rnd() * 8); i++) {
      const payer = people[Math.floor(rnd() * people.length)]!;
      const who = people.filter(() => rnd() < 0.6);
      if (!who.length) who.push(payer);
      const total = Math.round(rnd() * 500000) / 100 + 0.01;
      entries.push(shared(payer, equalShares(total, who)));
    }
    const bal = groupBalances(G, entries, []);
    assert.equal(Object.values(bal).reduce((a, v) => a + v, 0), 0, 'balances add up to zero');
    const debts = simplifyDebts(bal);
    const nonZero = Object.values(bal).filter((v) => v !== 0).length;
    assert.ok(debts.length <= Math.max(0, nonZero - 1), `at most ${nonZero - 1} payments`);
    const settled = debts.map((d) => makeSettlement({ group_id: G, from_user: d.from, to_user: d.to, amount: d.amount, settle_date: '2026-11-10' }, d.from, T0));
    assert.ok(Object.values(groupBalances(G, entries, settled)).every((v) => v === 0), 'paying the suggested debts settles everyone');
  }
});

test('names, active members and the ledger', () => {
  const m = (uid: string, name: string, left: string | null = null): Member => ({ group_id: G, user_id: uid, display_name: name, role: 'member', joined_at: T0, left_at: left });
  const members = [m(B, 'Ravi'), m(A, 'Asha'), m(C, 'Chitra', T0)];
  assert.equal(memberName(members, G, A), 'Asha');
  assert.equal(memberName(members, G, C), 'Chitra');
  assert.equal(memberName(members, G, D), 'Former member');
  assert.equal(memberName(members, G, null), 'Former member');
  assert.deepEqual(activeMembers(members, G).map((x) => x.display_name), ['Asha', 'Ravi']);
  const e1 = shared(A, { [A]: 10 }, { entry_date: '2026-11-01' });
  const e2 = shared(A, { [A]: 20 }, { entry_date: '2026-11-05' });
  const e3 = softDelete(shared(A, { [A]: 30 }), T0);
  const priv = makeEntry({ amount: 5, category: 'x', method: null, note: '', date: '2026-11-09' }, T0);
  assert.deepEqual(ledger([e1, e2, e3, priv], G).map((e) => e.amount), [20, 10]);
});

// ---------------------------------------------------------------- settlements
test('settlements: made, deleted later than they were last changed, merged by latest edit', () => {
  const s = makeSettlement({ group_id: G, from_user: B, to_user: A, amount: 25, settle_date: '2026-11-10' }, B, T0);
  assert.equal(s.created_by, B);
  assert.equal(s.dirty, 1);
  const d = softDeleteSettlement(s, '2026-11-09T09:00:00.000Z'); // a slow clock
  assert.ok(Date.parse(d.updated_at) > Date.parse(s.updated_at));
  assert.equal(d.deleted_at, d.updated_at);
  const remoteNewer: Settlement = { ...s, amount: 30, updated_at: '2026-11-09T12:00:00.000Z', dirty: 0 };
  assert.equal(mergeRemoteSettlement(s, remoteNewer).amount, 30);
  assert.equal(mergeRemoteSettlement(d, { ...s, dirty: 0 }), d, 'an older server copy never replaces a newer local one');
  assert.equal(mergeRemoteSettlement(undefined, remoteNewer).dirty, 0);
});

// ---------------------------------------------------------------- what comes from the server is checked
test('group rows from the server are validated before they are trusted', () => {
  assert.deepEqual(cleanGroup({ id: G.toUpperCase(), name: 'Home', kind: 'family', created_at: T0 }), { id: G, name: 'Home', kind: 'family', created_at: T0, starts_on: null, ends_on: null, closed_at: null, usual_split: null, primary_admin: null });
  assert.equal(cleanGroup({ id: G, name: 'Home', kind: 'family', created_at: T0, primary_admin: A.toUpperCase() })!.primary_admin, A, 'the primary admin is an id, lower-cased');
  assert.equal(cleanGroup({ id: G, name: 'Home', kind: 'family', created_at: T0, primary_admin: 'nobody' })!.primary_admin, null, 'anything else is no primary admin');
  for (const bad of [null, {}, { id: G, name: '', kind: 'family' }, { id: G, name: 'x', kind: 'club' }, { id: 'nope', name: 'x', kind: 'trip' }, { id: G, name: 'x'.repeat(61), kind: 'trip' }]) assert.equal(cleanGroup(bad), null);
  const m = { group_id: G, user_id: A, display_name: 'Asha', role: 'admin', joined_at: T0, left_at: null };
  assert.equal(cleanMember(m)!.role, 'admin');
  assert.equal(cleanMember({ ...m, role: 'owner' }), null);
  assert.equal(cleanMember({ ...m, display_name: '' }), null);
  assert.equal(cleanMember({ ...m, left_at: 'yesterday' }), null);
  assert.equal(cleanMember({ ...m, user_id: 'x' }), null);
  assert.deepEqual(cleanInvite({ group_id: G, code: 'abcdef012345', expires_at: T0 }), { group_id: G, code: 'abcdef012345', expires_at: T0 });
  for (const bad of [{ group_id: G, code: 'ABCDEF012345', expires_at: T0 }, { group_id: G, code: 'short', expires_at: T0 }, { group_id: G, code: 'abcdef012345', expires_at: 'x' }]) assert.equal(cleanInvite(bad), null);
  const s = { id: U(9), group_id: G, from_user: B, to_user: A, amount: '25.50', settle_date: '2026-11-10', created_by: B, created_at: T0, updated_at: T0, deleted_at: null };
  assert.equal(cleanSettlement(s)!.amount, 25.5);
  for (const bad of [{ ...s, amount: 0 }, { ...s, amount: 1.005 }, { ...s, to_user: B }, { ...s, settle_date: '2026-02-30' }, { ...s, from_user: 'x' }, { ...s, updated_at: 'x' }]) assert.equal(cleanSettlement(bad), null);
});

test('the join code: formatted for people, normalised for the server, carried in the link after the #', () => {
  assert.equal(formatCode('abcdef012345'), 'ABCD-EF01-2345');
  assert.equal(normalizeCode(' ABCD-ef01 2345 '), 'abcdef012345');
  assert.ok(codeLooksValid('ABCD-EF01-2345'));
  assert.ok(!codeLooksValid('ABCD-EF01'));
  const link = inviteLink('https://example.github.io/money-log/?x=1#old', 'abcdef012345');
  assert.equal(link, 'https://example.github.io/money-log/#join=abcdef012345');
  assert.equal(joinCodeFromHash('#join=abcdef012345'), 'abcdef012345');
  assert.equal(joinCodeFromHash('#join=ABCD-EF01-2345'), 'abcdef012345');
  for (const bad of ['', '#', '#join=', '#join=xyz', '#join=abcdef01234', '#other=abcdef012345', '#join=abcdef012345&x=1']) assert.equal(joinCodeFromHash(bad), null, bad);
});

// ---------------------------------------------------------------- shared expenses in the entry record
test('cleanEntry accepts shared expenses that add up and refuses the rest', () => {
  const e = shared(A, { [A]: 40, [B]: 60 });
  const ok = cleanEntry({ ...e, shares: { [A.toUpperCase()]: 40, [B]: 60 } });
  assert.deepEqual(ok!.shares, { [A]: 40, [B]: 60 });
  assert.equal(ok!.group_id, G);
  assert.equal(ok!.paid_by, A);
  const bad = (over: object) => assert.equal(cleanEntry({ ...e, ...over }), null, JSON.stringify(over).slice(0, 60));
  bad({ shares: { [A]: 40, [B]: 50 } });
  bad({ shares: { [A]: -10, [B]: 110 } });
  bad({ shares: { [A]: 40.005, [B]: 59.995 } });
  bad({ shares: { nope: 100 } });
  bad({ shares: [40, 60] });
  bad({ paid_by: null });
  bad({ shares: null });
  bad({ group_id: 'x' });
  bad({ group_id: null });                               // a private payment cannot carry a payer or shares
  assert.equal(cleanEntry({ ...e, group_id: null, paid_by: null, shares: null })!.group_id, null);
  assert.equal(cleanEntry({ ...e, group_id: undefined, paid_by: undefined, shares: undefined })!.shares, null, 'a Release 1 row has none of these');
});

test('editing a shared expense keeps the people in step with the amount', () => {
  const e = shared(A, { [A]: 40, [B]: 60 });
  const edited = editEntry(e, { amount: 200, group: { group_id: G, paid_by: A, shares: { [A]: 100, [B]: 100 } } }, '2026-11-10T00:00:00.000Z');
  assert.equal(edited.amount, 200);
  assert.deepEqual(edited.shares, { [A]: 100, [B]: 100 });
  const priv = editEntry(e, { group: null }, '2026-11-10T00:00:00.000Z');
  assert.deepEqual([priv.group_id, priv.paid_by, priv.shares], [null, null, null]);
  assert.deepEqual(editEntry(e, { note: 'x' }, '2026-11-10T00:00:00.000Z').shares, { [A]: 40, [B]: 60 }, 'other edits leave the split alone');
});

// ---------------------------------------------------------------- budget and export use my share
test('the budget and the export count a shared expense at the account\'s own share', () => {
  const mine = makeEntry({ amount: 500, category: 'Groceries', method: 'Cash', note: '', date: '2026-11-03' }, T0);
  const dinner = shared(A, { [A]: 600, [B]: 600, [C]: 600 }, { category: 'Eating out', note: 'dinner' });   // 1,800 in total
  const forOthers = shared(A, { [B]: 100 }, { category: 'Eating out' });                                    // A paid for B alone: nothing for A to log
  const theirs = shared(B, { [A]: 50, [B]: 50 }, { category: 'Eating out' });                                // B's expense, in B's budget
  const all = [mine, dinner, forOthers, theirs];

  assert.ok(isMine(dinner, A) && !isMine(theirs, A));
  assert.equal(myShare(dinner, A), 600);
  assert.equal(myShare(mine, A), 500);
  assert.equal(myShare(forOthers, A), 0);

  const b = budgetEntries(all, A);
  assert.deepEqual(b.map((e) => [e.category, e.amount]).sort(), [['Eating out', 600], ['Groceries', 500]]);
  const sum = summarizeMonth(b, null, '2026-11');
  assert.equal(sum.totalSpent, 1100);
  assert.equal(sum.count, 2);

  // before the phone knows the account (no sign-in yet) shared expenses cannot be counted
  assert.deepEqual(budgetEntries([dinner], null), []);
});

// ---------------------------------------------------------------- backup
test('an older backup that holds the imported plan, due list and marks still loads, and a new one writes none of them', () => {
  const entry = makeEntry({ amount: 5, category: 'x', method: null, note: '', date: '2026-11-09' }, T0);
  const legacy = {
    app: 'money-log', v: 1, exportedAt: T0, entries: [entry],
    due: { v: 1, items: [{ k: 'todo|2027-01-01|renew', kind: 'todo', title: 'Renew', due: '2027-01-01', amount: null, done: false }], importedAt: T0 },
    dueDone: { k: { d: 1, t: T0 } },
  };
  const r = parseBackup(JSON.stringify(legacy));
  assert.ok(r.ok);
  assert.deepEqual(r.due!.items.map((i) => i.title), ['Renew']);
  assert.deepEqual(r.dueDone, { k: { d: 1, t: T0 } });
  assert.equal(r.entries.length, 1);
  const fresh = JSON.parse(JSON.stringify(makeBackup([entry], T0)));
  assert.deepEqual(['plan', 'due', 'dueDone', 'networth'].filter((k) => k in fresh), [], 'nothing from the spreadsheet is written any more');
  const old = parseBackup(JSON.stringify({ app: 'money-log', v: 1, exportedAt: T0, entries: [], plan: null }));
  assert.ok(old.ok);
  assert.deepEqual([old.due, old.dueDone], [null, {}]);
  const withOldNet = parseBackup(JSON.stringify({ app: 'money-log', v: 1, exportedAt: T0, entries: [], plan: null, networth: { v: 1, asOf: null, items: [{ label: 'Net worth', value: 5, unit: '₹' }], importedAt: T0 } }));
  assert.ok(withOldNet.ok, 'a backup that still carries the old imported net worth block loads; the block is ignored');
  const tampered = parseBackup(JSON.stringify({ app: 'money-log', v: 1, exportedAt: T0, entries: [], plan: null, due: { v: 1, items: [{ k: 1 }], importedAt: T0 }, dueDone: { x: { d: 5, t: 'no' } } }));
  assert.ok(tampered.ok);
  assert.deepEqual([tampered.due, tampered.dueDone], [null, {}], 'invalid blocks and marks are dropped, not trusted');
});

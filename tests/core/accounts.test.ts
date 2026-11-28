import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_SETTINGS, applyCheckIn, cashMoves, changeAccount, dayBeforeMonth, startAccounts, checkInAsks, interestOn, isWorkedOut, lastCheckIn, setSettings, settingsField, settingsOf, whyItMoved, workAccounts, workedForYou } from '../../src/core/accounts.ts';
import type { AccountSettings } from '../../src/core/accounts.ts';
import { addNetUpdate } from '../../src/core/goals.ts';
import type { Goals, WorthItem } from '../../src/core/goals.ts';
import type { Settlement } from '../../src/core/groups.ts';
import { recordWorked } from '../../src/core/worth.ts';
import { netUpdates } from '../../src/core/goals.ts';
import { checkInDay, chosenFeatures, setCheckInDay, setFeature } from '../../src/core/features.ts';
import { makeEntry } from '../../src/core/logic.ts';
import type { Entry, NewEntryInput } from '../../src/core/logic.ts';
import { worthSummary } from '../../src/core/worth.ts';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = U(900);
const RAVI = U(901);
const T = '2026-11-01T10:00:00.000Z';
const NOW = '2026-12-01T10:00:00.000Z';
const TODAY = '2026-12-01';
const BANK = U(1); const CARD = U(2); const MF = U(3); const FD = U(4); const LOAN = U(5);

const item = (id: string, n: string, s: 'a' | 'd', c: string, a: number, w?: Partial<AccountSettings>): WorthItem => ({
  id, k: 'w', n, s, c, a, d: '2026-11-01', p: null, pd: '', e: c === 'loan' ? 4000 : 0, r: c === 'loan' ? 12 : 0, x: 0, t: T,
  ...(w ? { w: settingsField({ ...NO_SETTINGS, ...w }) } : {}),
});
const goals = (): Goals => ({
  [BANK]: item(BANK, 'HDFC savings', 'a', 'liquid', 80000, { pay: ['UPI'], inc: true }),
  [CARD]: item(CARD, 'HDFC credit card', 'd', 'card', 0, { pay: ['Card'], cat: ['Credit card bill'] }),
  [MF]: item(MF, 'Mutual funds', 'a', 'invest', 200000, { mk: true, cat: ['SIP'] }),
  [FD]: item(FD, 'FD', 'a', 'invest', 100000, { ir: 7 }),
  [LOAN]: item(LOAN, 'TV loan', 'd', 'loan', 20000),
});
let n = 0;
const pay = (over: Partial<NewEntryInput> & { date: string }, extra: Partial<Entry> = {}): Entry =>
  ({ ...makeEntry({ amount: 100, category: 'Groceries', method: 'UPI', note: '', ...over }, T, U(500 + ++n)), owner_id: ME, ...extra });
const entries = (): Entry[] => [
  pay({ amount: 140000, category: 'Salary', method: null, kind: 'in', date: '2026-11-02' }),
  pay({ amount: 5000, category: 'Groceries', date: '2026-11-03' }),
  pay({ amount: 12000, category: 'Shopping', method: 'Card', date: '2026-11-04' }),
  pay({ amount: 10000, category: 'Credit card bill', date: '2026-11-20' }),
  pay({ amount: 5000, category: 'SIP', date: '2026-11-10' }),
  pay({ amount: 15000, category: 'Rent', date: '2026-11-05', group: { group_id: U(800), paid_by: ME, shares: { [ME]: 9000, [RAVI]: 6000 } } }),
  pay({ amount: 800, category: 'Bills', date: '2026-11-06', group: { group_id: U(800), paid_by: RAVI, shares: { [ME]: 400, [RAVI]: 400 } } }, { owner_id: RAVI }),
  pay({ amount: 400, category: 'Bills', date: '2026-11-06' }, { share_of: U(999) }), // my share recorded privately: no money moved
  pay({ amount: 999, category: 'Groceries', date: '2026-11-07' }, { deleted_at: T }),
  pay({ amount: 777, category: 'Groceries', date: '2026-11-01' }), // the day the figure was confirmed: already in it
  pay({ amount: 555, category: 'Groceries', date: '2026-12-02' }), // tomorrow
];

test('settings are read safely: malformed or missing means kept by hand; interest and market values are for things owned', () => {
  const g = goals();
  assert.deepEqual(settingsOf(g[BANK] as WorthItem), { pay: ['UPI'], inc: true, cat: [], ir: 0, mk: false, at: null });
  assert.equal(settingsOf(g[LOAN] as WorthItem), null);
  assert.equal(settingsOf({ ...(g[BANK] as WorthItem), w: { pay: ['UPI'] } }), null, 'not switched on');
  assert.deepEqual(settingsOf({ ...(g[BANK] as WorthItem), w: { on: 1, pay: ['UPI', 'Crypto', 'UPI'], cat: [' SIP ', 7], ir: 'x', at: 'later' } }), { pay: ['UPI'], inc: false, cat: ['SIP'], ir: 0, mk: false, at: null });
  assert.deepEqual(settingsOf({ ...(g[CARD] as WorthItem), w: { on: 1, ir: 30, mk: 1, inc: 1 } }), { pay: [], inc: false, cat: [], ir: 0, mk: false, at: null });
  assert.ok(isWorkedOut(g));
  assert.equal(isWorkedOut({ [LOAN]: g[LOAN]! }), false);
});

test('each account is worked out from the payments since its day: money received, spending, a card, moves between accounts, interest', () => {
  const w = workAccounts(goals(), entries(), ME, TODAY);
  // 80,000 + salary 1,40,000 − groceries 5,000 − card bill 10,000 − SIP 5,000 − rent 15,000 (all of it: Ravi's share is in the group line)
  assert.equal(w[BANK]!.value, 185000);
  assert.equal(w[BANK]!.inflow, 140000);
  assert.equal(w[BANK]!.outflow, 35000);
  assert.equal(w[BANK]!.flows.length, 5);
  assert.equal(w[CARD]!.value, 2000, 'spent 12,000 on the card, paid 10,000 of it');
  assert.equal(w[MF]!.value, 205000, 'the SIP went in');
  assert.equal(w[FD]!.interest, 583.33, 'one month at 7% a year');
  assert.equal(w[FD]!.value, 100583.33);
  assert.equal(w[LOAN], undefined, 'kept by hand');
  assert.deepEqual(w[MF]!.flows.map((f) => [f.kind, f.amount]), [['moved-in', 5000]]);
  // the summary uses the worked figures; the loan keeps its estimate
  const sum = worthSummary(goals(), TODAY, [{ key: 'groups', label: '', amount: 5600 }], w);
  assert.equal(sum.assets, 185000 + 205000 + 100583.33 + 5600);
});

test('a payment with no way of paying comes from the UPI account (never a card); one by a way of paying not tracked moves nothing', () => {
  const g = goals();
  const w = workAccounts(g, [pay({ amount: 300, category: 'Groceries', method: 'Other', date: '2026-11-08' }), pay({ amount: 50, method: null, date: '2026-11-09' }), pay({ amount: 70, method: 'Cash', date: '2026-11-09' })], ME, TODAY);
  assert.equal(w[BANK]!.value, 80000 - 350, 'Other and none from the UPI account; cash is not tracked');
  const cardOnly = setSettings(g, BANK, null, NOW);
  const w2 = workAccounts(cardOnly, [pay({ amount: 2000, method: null, date: '2026-11-08' })], ME, TODAY);
  assert.equal(w2[CARD]!.value, 0, 'with the bank kept by hand, a payment with no way of paying does not land on the card');
  const same = setSettings(g, BANK, { ...settingsOf(g[BANK] as WorthItem)!, cat: ['Groceries'] }, NOW);
  assert.equal(workAccounts(same, [pay({ amount: 300, category: 'Groceries', date: '2026-11-08' })], ME, TODAY)[BANK]!.value, 80000);
});

test('a way of paying, and money received, belong to one account: giving them to another takes them away', () => {
  const g = setSettings(goals(), FD, { ...NO_SETTINGS, pay: ['UPI'], inc: true, ir: 7 }, NOW);
  assert.deepEqual(settingsOf(g[BANK] as WorthItem), { pay: [], inc: false, cat: [], ir: 0, mk: false, at: null });
  assert.deepEqual(settingsOf(g[FD] as WorthItem)!.pay, ['UPI']);
  assert.ok((g[BANK] as WorthItem).t > T, 'the account that lost them is changed too, so it syncs');
  const off = setSettings(g, FD, null, NOW);
  assert.equal(settingsOf(off[FD] as WorthItem), null);
  assert.ok(!('w' in off[FD]!));
});

test('interest is estimated monthly on the confirmed figure, for whole months only', () => {
  assert.equal(interestOn(100000, 12, '2026-01-15', '2026-02-14'), 0);
  assert.equal(interestOn(100000, 12, '2026-01-15', '2026-02-15'), 1000);
  assert.equal(interestOn(100000, 12, '2026-01-15', '2027-01-15'), 12682.5);
  assert.equal(interestOn(0, 12, '2026-01-15', '2027-01-15'), 0);
});

test('the check-in asks market values, then bank balances, then what is kept by hand; the rest is worked out for you', () => {
  const g = goals();
  const w = workAccounts(g, entries(), ME, TODAY);
  assert.deepEqual(checkInAsks(g, w, TODAY).map((a) => [a.kind, a.name, a.expected]), [['market', 'Mutual funds', 205000], ['bank', 'HDFC savings', 185000], ['kept', 'TV loan', 20000 - (4000 - 200)]]);
  assert.equal(checkInAsks(g, w, TODAY)[0]!.put, 5000, 'what was put in since');
  assert.deepEqual(workedForYou(g, w, TODAY).map((x) => [x.name, x.value]).sort(), [['FD', 100583.33], ['HDFC credit card', 2000]]);
});

test('saving a check-in confirms the accounts answered at today\'s figure; the rest keep counting from their own day', () => {
  const g = goals();
  const w = workAccounts(g, entries(), ME, TODAY);
  const after = applyCheckIn(g, { [MF]: 212000, [BANK]: 182000 }, w, TODAY, NOW);
  const mf = after[MF] as WorthItem;
  assert.deepEqual([mf.a, mf.d, mf.p, mf.pd], [212000, TODAY, 205000, '2026-11-01']);
  assert.equal(settingsOf(mf)!.at, NOW, 'the moment it was confirmed');
  assert.deepEqual([(after[BANK] as WorthItem).a, (after[BANK] as WorthItem).p], [182000, 185000]);
  assert.equal(after[CARD], g[CARD], 'worked out for you, not confirmed: a payment logged later with an earlier date still counts');
  assert.equal(after[LOAN], g[LOAN], 'not answered: kept as it was');
  const again = workAccounts(after, entries(), ME, TODAY);
  assert.deepEqual([again[BANK]!.value, again[CARD]!.value, again[MF]!.value], [182000, 2000, 212000]);
  assert.equal(lastCheckIn(after, again, TODAY), '2026-11-01', 'the loan was not answered: the check-in is not done in full');
  assert.equal(lastCheckIn(applyCheckIn(after, { [LOAN]: 16000 }, again, TODAY, NOW), again, TODAY), TODAY);
});

test('a check-in never stores a figure below zero (other devices would drop the item); a second one in a month adds up the market\'s moves', () => {
  const g = goals();
  const overspent = workAccounts(g, [pay({ amount: 90000, date: '2026-11-05' })], ME, TODAY);
  const after = applyCheckIn(g, { [BANK]: 0 }, overspent, TODAY, NOW);
  assert.deepEqual([(after[BANK] as WorthItem).a, (after[BANK] as WorthItem).p], [0, null]);
  const w = workAccounts(g, entries(), ME, '2026-11-15');
  const first = applyCheckIn(g, { [MF]: 210000 }, w, '2026-11-15', NOW); // expected 2,05,000: the market +5,000
  const w2 = workAccounts(first, [...entries(), pay({ amount: 1000, category: 'SIP', date: '2026-11-20' })], ME, '2026-11-28');
  const second = applyCheckIn(first, { [MF]: 216000 }, w2, '2026-11-28', NOW); // expected 2,11,000: the market +5,000 more
  const mf = second[MF] as WorthItem;
  assert.equal(mf.a - (mf.p as number), 10000, 'both surprises');
  assert.equal(whyItMoved(second, entries(), ME, 0, '2026-10-31', '2026-11-28').markets, 10000);
});

test('a payment logged later on the day a figure was confirmed still counts; one made before it does not', () => {
  const g = applyCheckIn(goals(), { [BANK]: 100000 }, workAccounts(goals(), [], ME, TODAY), TODAY, '2026-12-01T09:00:00.000Z');
  const later = { ...pay({ amount: 500, date: TODAY }), created_at: '2026-12-01T12:00:00.000Z' };
  const earlier = { ...pay({ amount: 700, date: TODAY }), created_at: '2026-12-01T08:00:00.000Z' };
  assert.equal(workAccounts(g, [later, earlier], ME, TODAY)[BANK]!.value, 99500);
});

test('settle-ups and Udhaar move the bank (the group and Udhaar lines move the other way, so net worth stays)', () => {
  const settled: Settlement[] = [
    { id: U(600), group_id: U(800), from_user: RAVI, to_user: ME, amount: 2000, settle_date: '2026-11-25', created_by: RAVI, created_at: T, updated_at: T, deleted_at: null, dirty: 0 },
    { id: U(601), group_id: U(800), from_user: ME, to_user: RAVI, amount: 300, settle_date: '2026-11-26', created_by: ME, created_at: T, updated_at: T, deleted_at: null, dirty: 0 },
  ];
  const lent: Goals = { ...goals(), [U(610)]: { id: U(610), k: 'u', n: 'Asha', a: 10000, w: 'gave', d: '2026-11-10', m: '', s: 0, x: 0, t: T }, [U(611)]: { id: U(611), k: 'u', n: 'Dev', a: 1000, w: 'took', d: '2026-11-11', m: '', s: 1, x: 0, t: '2026-11-20T10:00:00.000Z' } };
  const cash = cashMoves(settled, lent, ME);
  assert.deepEqual(cash.map((c) => c.amount), [2000, -300, -10000, 1000, -1000]);
  assert.equal(workAccounts(lent, [], ME, TODAY, cash)[BANK]!.value, 80000 + 2000 - 300 - 10000 + 1000 - 1000);
});

test('changing what moves an account starts from today: payments already counted stay where they were', () => {
  const g = goals();
  const before = workAccounts(g, entries(), ME, TODAY);
  const moved = changeAccount(g, FD, { ...NO_SETTINGS, pay: ['UPI'], ir: 7 }, before, TODAY, NOW);
  const after = workAccounts(moved, entries(), ME, TODAY);
  assert.deepEqual([after[BANK]!.value, after[FD]!.value], [before[BANK]!.value, before[FD]!.value], 'nothing re-routed into the past');
  assert.deepEqual(settingsOf(moved[FD] as WorthItem)!.pay, ['UPI']);
  const kept = changeAccount(g, CARD, null, before, TODAY, NOW);
  assert.deepEqual([(kept[CARD] as WorthItem).a, settingsOf(kept[CARD] as WorthItem)], [2000, null], 'kept by hand again at its worked-out figure');
});

test('why it moved: what was saved, markets, interest, the rest, and money moved between your own accounts', () => {
  let g = goals();
  const h = addNetUpdate(g, 350000, '2026-11-01', TODAY, T, U(700));
  assert.ok(h.ok);
  g = h.items;
  const w = workAccounts(g, entries(), ME, TODAY);
  const after = applyCheckIn(g, { [MF]: 212000 }, w, TODAY, NOW);
  const why = whyItMoved(after, entries(), ME, 438300, '2026-11-01', TODAY);
  assert.equal(why.came, 140000);
  assert.equal(why.saved, 140000 - (5000 + 12000 + 9000 + 400), 'groceries, the card shopping, my share of the rent and of Ravi\'s Wi-Fi; the card bill and the SIP only moved money');
  assert.equal(why.interest, 583.33, 'the FD\'s month of interest');
  assert.equal(why.markets, 7000);
  assert.equal(why.start, 350000);
  assert.equal(why.change, 88300);
  assert.equal(why.other, round(88300 - 113600 - 7000 - why.interest));
  assert.deepEqual(why.moved, [{ name: 'HDFC credit card', amount: 10000 }, { name: 'Mutual funds', amount: 5000 }]);
  assert.ok(why.kept !== null && Math.abs(why.kept - 113600 / 140000) < 1e-9);
});
const round = (x: number) => Math.round(x * 100) / 100;

test('the check-in day is kept with the features: the 1st by default, 1 to 28, and switching a part keeps it', () => {
  assert.equal(checkInDay({}), 1);
  const g = setCheckInDay({}, 15, NOW);
  assert.equal(checkInDay(g), 15);
  assert.deepEqual([...chosenFeatures(g)].sort(), ['insights', 'udhaar'], 'the defaults stay as they were');
  assert.equal(setCheckInDay(g, 29, NOW), g);
  assert.equal(setCheckInDay(g, 15, NOW), g);
  const on = setFeature(g, 'plan', true, '2026-12-02T10:00:00.000Z');
  assert.equal(checkInDay(on), 15);
  assert.equal(checkInDay(setCheckInDay(on, 3, '2026-12-03T10:00:00.000Z')), 3);
});

test('"this month" starts after the last day of the month before', () => {
  assert.equal(dayBeforeMonth('2026-12-15'), '2026-11-30');
  assert.equal(dayBeforeMonth('2026-03-01'), '2026-02-28');
  assert.equal(dayBeforeMonth('2028-03-10'), '2028-02-29');
  assert.equal(dayBeforeMonth('2027-01-05'), '2026-12-31');
});

test('the set-up is a fresh start: today\'s figures, and no earlier figure that would show as a move of the market', () => {
  const g = startAccounts(goals(), { [MF]: 210000, [BANK]: 150000, [LOAN]: -1 }, TODAY, NOW);
  const mf = g[MF] as WorthItem;
  assert.deepEqual([mf.a, mf.d, mf.p, mf.pd], [210000, TODAY, null, '']);
  assert.equal((g[BANK] as WorthItem).a, 150000);
  assert.deepEqual(g[LOAN], goals()[LOAN], 'an invalid figure leaves the item as it was');
  assert.equal(whyItMoved(g, entries(), ME, 400000, '2026-11-30', TODAY).markets, 0);
});

test('the worked-out figure is kept in the history at most once a week, and a check-in that day is updated, never pushed aside', () => {
  let g: Goals = {};
  g = recordWorked(g, 100, '2026-12-01', NOW);
  g = recordWorked(g, 110, '2026-12-03', NOW);
  assert.deepEqual(netUpdates(g).map((u) => [u.d, u.a, u.s]), [['2026-12-03', 110, 'w']], 'moved forward within the week');
  g = recordWorked(g, 120, '2026-12-10', NOW);
  assert.deepEqual(netUpdates(g).map((u) => [u.d, u.a]), [['2026-12-10', 120], ['2026-12-03', 110]], 'a new point a week on');
  const h = addNetUpdate(g, 130, '2026-12-11', '2026-12-11', NOW, U(720), 'c');
  assert.ok(h.ok);
  const same = recordWorked(h.items, 135, '2026-12-11', NOW);
  assert.deepEqual(netUpdates(same).slice(0, 1).map((u) => [u.d, u.a, u.s]), [['2026-12-11', 135, 'c']], 'today\'s check-in is updated in place');
  assert.equal(recordWorked(same, 135, '2026-12-11', NOW), same, 'nothing to change');
});

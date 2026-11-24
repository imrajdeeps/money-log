import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickLine } from '../../src/features/payments/quickLine.ts';
import { MAX_BATCH, readBatch, splitMessages } from '../../src/features/payments/batch.ts';
import { safeToSpend } from '../../src/core/safeToSpend.ts';
import { isRecapDay, weekRecap, weekStart } from '../../src/core/weekRecap.ts';
import { roundUpBudget, suggestBudgets } from '../../src/core/suggestBudgets.ts';
import { makeEntry } from '../../src/core/logic.ts';
import type { Entry, MonthRow } from '../../src/core/logic.ts';

const TODAY = '2026-11-24'; // a Tuesday
const CATS = [{ name: 'Eating out' }, { name: 'Groceries' }, { name: 'Rent' }, { name: 'Transport & fuel' }];
const NONE: never[] = [];
const q = (s: string, entries: Parameters<typeof parseQuickLine>[2] = NONE) => parseQuickLine(s, TODAY, entries, CATS);

test('one line: amount, note, method and a category, in any order', () => {
  assert.deepEqual(q('450 swiggy upi'), { ok: true, line: { amount: 450, note: 'swiggy', method: 'UPI', category: 'Eating out', date: null } });
  assert.deepEqual(q('swiggy 450'), { ok: true, line: { amount: 450, note: 'swiggy', method: null, category: 'Eating out', date: null } });
  assert.deepEqual(q('₹1,200 bigbasket card'), { ok: true, line: { amount: 1200, note: 'bigbasket', method: 'Card', category: 'Groceries', date: null } });
  assert.deepEqual(q('1.5k rent yesterday'), { ok: true, line: { amount: 1500, note: 'rent', method: null, category: null, date: '2026-11-23' } });
  assert.equal((q('2l fees') as { line: { amount: number } }).line.amount, 200000);
  assert.equal((q('85.50 chai cash') as { line: { method: string } }).line.method, 'Cash');
  assert.equal((q('gpay 300 auto') as { line: { method: string } }).line.method, 'UPI');
});

test('one line: what the person used for the same merchant before wins, and a line with only an amount has no note or category', () => {
  const earlier = [{ note: 'cafe corner', category: 'Groceries', deleted_at: null, created_at: '2026-11-01T00:00:00.000Z' }];
  assert.equal((q('90 cafe corner', earlier) as { line: { category: string } }).line.category, 'Groceries');
  assert.deepEqual(q('450'), { ok: true, line: { amount: 450, note: '', method: null, category: null, date: null } });
});

test('one line: no amount, or a bad one, is said plainly', () => {
  for (const bad of ['', '   ', 'swiggy', 'upi card']) assert.equal(q(bad).ok, false, bad);
  assert.equal(q('0 swiggy').ok, false);
  assert.equal(q('1.005 swiggy').ok, false, 'two decimals at most');
});

const MSG = (amt: string, ref: string, who: string) => `Rs ${amt} debited from A/c XX1234 to VPA ${who}@icici. UPI Ref ${ref}`;

test('a paste is split by blank lines, or one message per line when each line is a payment', () => {
  assert.equal(splitMessages(`${MSG('450.00', '412345678901', 'swiggy')}\n\n${MSG('120.00', '412345678902', 'metro')}`).length, 2);
  assert.equal(splitMessages(`${MSG('450.00', '412345678901', 'swiggy')}\n${MSG('120.00', '412345678902', 'metro')}`).length, 2);
  assert.equal(splitMessages('Rs 450 debited\nfrom your account\nto swiggy').length, 1, 'one message wrapped over lines stays one');
  assert.equal(splitMessages(Array.from({ length: 50 }, (_, i) => MSG('10.00', String(412345678000 + i), 'x')).join('\n\n')).length, MAX_BATCH);
});

test('each message is read, given a category, and repeats are flagged', () => {
  const saved = [{ note: 'UPI Ref 412345678902', category: 'Transport & fuel', deleted_at: null, created_at: '2026-11-01T00:00:00.000Z' }];
  const rows = readBatch([MSG('450.00', '412345678901', 'swiggy'), MSG('120.00', '412345678902', 'metro'), MSG('450.00', '412345678901', 'swiggy'), 'Hello, your OTP is 123456'].join('\n\n'), TODAY, saved, CATS);
  assert.equal(rows.length, 4);
  assert.deepEqual([rows[0]!.payment?.amount, rows[0]!.category, rows[0]!.duplicate], [450, 'Eating out', false]);
  assert.equal(rows[1]!.duplicate, true, 'already saved');
  assert.equal(rows[2]!.duplicate, true, 'the same reference earlier in this list');
  assert.equal(rows[3]!.payment, null);
  assert.ok(rows[3]!.problem);
});

test('safe to spend: what is left after what is still to come, over the days left (today counts)', () => {
  assert.deepEqual(safeToSpend(30000, 12000, 6000, '2026-11-21'), { perDay: 1200, left: 12000, upcoming: 6000, daysLeft: 10 });
  assert.equal(safeToSpend(30000, 12000, 6000, '2026-11-30')!.perDay, 12000, 'the last day: all of it');
  assert.equal(safeToSpend(10000, 9000, 3000, '2026-11-10')!.perDay, 0, 'never below zero');
  assert.equal(safeToSpend(10000, 9000, 3000, '2026-11-10')!.left, -2000, 'but the real figure is shown as it is');
  assert.equal(safeToSpend(0, 100, 0, '2026-11-10'), null, 'no budget, no figure');
});

const spend = (amount: number, category: string, date: string): Entry => ({ ...makeEntry({ amount, category, date, method: null, note: '' }, '2026-11-01T00:00:00.000Z') });
const groupOf = (c: string) => (c === 'Savings' ? 'Saving' as const : 'Spending' as const);

test('weeks run Monday to Sunday; the recap is for Monday and Tuesday', () => {
  assert.equal(weekStart('2026-11-24'), '2026-11-23'); // Tuesday -> Monday
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // Sunday -> the Monday before
  assert.equal(weekStart('2027-01-01'), '2026-12-28', 'across a year end');
  assert.deepEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-29'].map(isRecapDay), [true, true, false, false]);
});

test('last week: its total, its top three, and how it compares with a usual week', () => {
  const es = [
    spend(1000, 'Rent', '2026-11-16'), spend(400, 'Groceries', '2026-11-17'), spend(300, 'Groceries', '2026-11-20'), spend(150, 'Eating out', '2026-11-22'), spend(50, 'Transport & fuel', '2026-11-21'),
    spend(500, 'Savings', '2026-11-18'), // saving is not spending
    spend(999, 'Rent', '2026-11-23'), // this week: not last week
    spend(1000, 'Groceries', '2026-11-10'), spend(1400, 'Groceries', '2026-11-03'), // two earlier weeks: a usual week is 1200
  ];
  const r = weekRecap(es, groupOf, TODAY)!;
  assert.deepEqual([r.from, r.to, r.total, r.count], ['2026-11-16', '2026-11-22', 1900, 5]);
  assert.deepEqual(r.top, [{ category: 'Rent', amount: 1000 }, { category: 'Groceries', amount: 700 }, { category: 'Eating out', amount: 150 }]);
  assert.equal(r.usual, 1200);
  assert.ok(Math.abs(r.change! - 700 / 1200) < 1e-9);
  assert.equal(weekRecap([spend(10, 'Rent', '2026-11-23')], groupOf, TODAY), null, 'nothing last week: nothing to recap');
  assert.equal(weekRecap([spend(100, 'Rent', '2026-11-17')], groupOf, TODAY)!.change, null, 'no earlier week to compare with');
});

test('suggested budgets: last month\'s spending rounded up to a number a person would write', () => {
  assert.deepEqual([0, 1, 99.5, 100, 101, 4999, 5000, 5001, 5400].map(roundUpBudget), [0, 100, 100, 100, 200, 5000, 5000, 5500, 5500]);
  const rows: MonthRow[] = [
    { category: 'Rent', group: 'Spending', spent: 9000, planned: 0, left: 0, budgeted: false },
    { category: 'Groceries', group: 'Spending', spent: 2340, planned: 0, left: 0, budgeted: false },
    { category: 'Health', group: 'Spending', spent: 0, planned: 0, left: 0, budgeted: false },
  ];
  assert.deepEqual(suggestBudgets(rows), [{ name: 'Rent', amount: 9000 }, { name: 'Groceries', amount: 2400 }]);
});

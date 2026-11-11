import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alreadyAdded, findDate, noteFor, parseMessage, suggestCategory } from '../../../src/features/payments/smsParse.ts';
import type { ParsedMessage } from '../../../src/features/payments/smsParse.ts';

const TODAY = '2026-11-10';
const ok = (text: string): ParsedMessage => {
  const r = parseMessage(text, TODAY);
  assert.ok(r.ok, r.ok ? '' : r.problem);
  return r.payment;
};
const bad = (text: string): string => {
  const r = parseMessage(text, TODAY);
  assert.ok(!r.ok, 'expected a problem');
  return r.ok ? '' : r.problem;
};

test('UPI debit with a VPA, date and reference', () => {
  const p = ok('Rs 450.00 debited from A/c XX1234 on 09-11-26 and credited to VPA swiggy@icici. UPI Ref No 412345678901. Avl Bal Rs 12,500.00');
  assert.equal(p.amount, 450);
  assert.equal(p.merchant, 'Swiggy');
  assert.equal(p.date, '2026-11-09');
  assert.equal(p.method, 'UPI');
  assert.equal(p.ref, '412345678901');
});

test('card spend: the merchant after "at", the available balance is not the amount', () => {
  const p = ok('Spent Rs.1,299.00 on HDFC Bank Card XX4321 at AMAZON on 2026-11-08. Avl limit Rs 85,000');
  assert.equal(p.amount, 1299);
  assert.equal(p.merchant, 'Amazon');
  assert.equal(p.method, 'Card');
  assert.equal(p.date, '2026-11-08');
});

test('INR amount, month in words, UPI string', () => {
  const p = ok('INR 2,500.50 debited from your account on 5-Nov-2026. Info: UPI/DR/998877665544/BIG BASKET/Axis. Balance INR 3,000');
  assert.equal(p.amount, 2500.5);
  assert.equal(p.date, '2026-11-05');
  assert.equal(p.merchant, 'Big Basket');
  assert.equal(p.ref, null);
});

test('ATM withdrawal is cash', () => {
  assert.equal(ok('Rs 5000 withdrawn from ATM on 10/11/2026 using card XX1111').method, 'Cash');
});

test('a message with no date is today, a future date is ignored', () => {
  assert.equal(ok('Paid Rs 99 to zomato@hdfcbank via UPI').date, null);
  assert.equal(findDate('on 25-12-2026', TODAY), null);
  assert.equal(findDate('on 31-02-2026', TODAY), null);
});

test('money coming in is read as income, with who it came from and the category the words point to', () => {
  const p = ok('Rs 5,000.00 credited to A/c XX1234 on 09-11-26 by UPI from Ravi. Ref 123456789');
  assert.equal(p.kind, 'in');
  assert.equal(p.amount, 5000);
  assert.equal(p.merchant, 'Ravi');
  assert.equal(p.incomeCategory, null, 'no word points to a category: the person picks');
  const refund = ok('Refund of Rs 300 credited to your account');
  assert.equal(refund.kind, 'in');
  assert.equal(refund.incomeCategory, 'Refund');
  assert.equal(ok('Rs 120 cashback received on your UPI payment').incomeCategory, 'Cashback');
  assert.equal(ok('Salary Rs 52,000 credited to A/c XX9 on 01-11-26').incomeCategory, 'Salary');
  assert.equal(ok('Interest of Rs 410 credited to your savings account').incomeCategory, 'Interest & dividends');
});

test('a payment message stays spending, with no income category', () => {
  const p = ok('Rs 450.00 debited from A/c XX1234 to VPA swiggy@icici. UPI Ref 412345678901');
  assert.equal(p.kind, 'out');
  assert.equal(p.incomeCategory, null);
});

test('a debit that mentions "credited to" the shop is still a payment', () => {
  assert.equal(ok('Rs 80 debited from A/c XX1 and credited to VPA chai@okaxis').amount, 80);
});

test('one-time passwords and messages with no amount fill nothing', () => {
  assert.match(bad('123456 is your OTP for the transaction of Rs 450. Do not share it with anyone.'), /one-time password/);
  assert.match(bad('Your statement is ready. Visit our app.'), /No amount/);
  assert.match(bad('   '), /Paste/);
});

test('the note carries the reference so the same message is noticed twice', () => {
  const p = ok('Rs 450.00 debited from A/c XX1234 to VPA swiggy@icici. UPI Ref No 412345678901.');
  const note = noteFor(p);
  assert.equal(note, 'Swiggy · ref 412345678901');
  assert.ok(alreadyAdded([{ note, deleted_at: null }], p.ref));
  assert.ok(!alreadyAdded([{ note, deleted_at: '2026-11-10T00:00:00Z' }], p.ref)); // a deleted payment does not count
  assert.ok(!alreadyAdded([{ note, deleted_at: null }], null));
});

const cats = [{ name: 'Eating out' }, { name: 'Groceries' }, { name: 'Bills' }, { name: 'Other' }];
test('category: what the person chose for that merchant before wins', () => {
  const entries = [
    { note: 'Swiggy · ref 1', category: 'Groceries', deleted_at: null, created_at: '2026-10-01T00:00:00Z' },
    { note: 'Swiggy Instamart', category: 'Groceries', deleted_at: null, created_at: '2026-10-05T00:00:00Z' },
  ];
  assert.equal(suggestCategory('Swiggy', entries, cats), 'Groceries');
});
test('category: a well-known word, only if the category is in the list', () => {
  assert.equal(suggestCategory('Zomato', [], cats), 'Eating out');
  assert.equal(suggestCategory('Uber', [], cats), null); // no "Transport & fuel" in this list
  assert.equal(suggestCategory('Corner Shop', [], cats), null);
  assert.equal(suggestCategory(null, [], cats), null);
});

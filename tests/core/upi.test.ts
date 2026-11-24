import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanUpi, remindText, udhaarRemindText, upiLink } from '../../src/core/upi.ts';

test('a UPI id is name@bank, in any case, or nothing', () => {
  assert.equal(cleanUpi('  Asha.K@OKAxis '), 'asha.k@okaxis');
  assert.equal(cleanUpi('9876543210@ybl'), '9876543210@ybl');
  for (const bad of ['', 'asha', '@ybl', 'asha@', 'a@b', 'asha@bank name', 'asha@@ybl', 'x'.repeat(70) + '@ybl', null, undefined, 5]) assert.equal(cleanUpi(bad), '', String(bad));
});

test('the pay link has the payee, the amount with two decimals, rupees and a note', () => {
  const url = upiLink({ upi: 'Asha@okaxis', name: 'Asha K', amount: 750, note: 'Flat 12' });
  assert.equal(url, 'upi://pay?pa=asha@okaxis&pn=Asha%20K&am=750.00&cu=INR&tn=Flat%2012');
  assert.equal(upiLink({ upi: 'nope', name: 'x', amount: 1, note: '' }), '', 'no link without a good id');
  assert.ok(upiLink({ upi: 'a1@ybl', name: 'a&b=c', amount: 1.5, note: 'x y' }).includes('pn=a%26b%3Dc'), 'a name cannot break out of its place in the link');
});

test('the reminder names the amount and the group, and carries the UPI id and link only when there is an id', () => {
  const plain = remindText({ name: 'Ravi', amount: 750, group: 'Flat 12', upi: '', payeeName: 'Asha' });
  assert.ok(plain.includes('Ravi') && plain.includes('₹750') && plain.includes('"Flat 12"'));
  assert.ok(!plain.includes('upi://') && !plain.includes('UPI'));
  const withId = remindText({ name: 'Ravi', amount: 750, group: 'Flat 12', upi: 'Asha@okaxis', payeeName: 'Asha' });
  assert.ok(withId.includes('asha@okaxis') && withId.includes('upi://pay?pa=asha@okaxis&pn=Asha&am=750.00'));
  const loan = udhaarRemindText({ name: 'Rohit', amount: 2000, upi: '', payeeName: 'Asha' });
  assert.ok(loan.includes('Rohit') && loan.includes('₹2,000') && !loan.includes('upi://'));
});

test('a UPI id is found in a pasted reminder, and a typed bad value is not quietly replaced', async () => {
  const { extractUpi } = await import('../../src/core/upi.ts');
  assert.equal(extractUpi('asha@okaxis'), 'asha@okaxis');
  assert.equal(extractUpi('You can pay me on UPI: Asha.K@OKAxis upi://pay?pa=asha.k@okaxis&pn=Asha'), 'asha.k@okaxis', 'the first id in the text');
  assert.equal(extractUpi('pay asha@ybl.'), 'asha@ybl', 'a full stop after it is not part of it');
  for (const bad of ['', 'no id here', 'asha@', 5, null]) assert.equal(extractUpi(bad), '', String(bad));
});

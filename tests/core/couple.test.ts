import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUPLE_CHOICES, coupleChoiceOf, coupleLabel, coupleLine, coupleSetting, coupleSummary } from '../../src/core/couple.ts';
import { computeShares, sharesPaise, toPaise } from '../../src/core/groups.ts';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('each choice says who paid and who shares in it', () => {
  assert.deepEqual(coupleSetting('meHalf', ME, THEM), { paidBy: ME, included: [ME, THEM] });
  assert.deepEqual(coupleSetting('meAll', ME, THEM), { paidBy: ME, included: [THEM] });
  assert.deepEqual(coupleSetting('themHalf', ME, THEM), { paidBy: THEM, included: [ME, THEM] });
  assert.deepEqual(coupleSetting('themAll', ME, THEM), { paidBy: THEM, included: [ME] });
});

test('a split state is recognised as its choice, in any order, and anything else is null', () => {
  for (const c of COUPLE_CHOICES) {
    const s = coupleSetting(c, ME, THEM);
    assert.equal(coupleChoiceOf(s.paidBy, [...s.included].reverse(), ME, THEM), c);
  }
  assert.equal(coupleChoiceOf(ME, [], ME, THEM), null);
  assert.equal(coupleChoiceOf('someone-else', [ME, THEM], ME, THEM), null);
});

test('every choice always adds up to the amount, to the paisa, and is allowed to be recorded by me', () => {
  for (const total of [100, 99.99, 0.01, 1250.5, 7]) {
    for (const c of COUPLE_CHOICES) {
      const { paidBy, included } = coupleSetting(c, ME, THEM);
      const r = computeShares('equal', total, [ME, THEM], new Set(included), {});
      assert.ok(r.shares, c);
      assert.equal(sharesPaise(r.shares), toPaise(total), `${c} ${total}`);
      assert.ok(paidBy === ME || ME in r.shares, 'the person recording paid or shares in it');
    }
  }
});

test('the one line', () => {
  assert.deepEqual(coupleLine(125000, 'Priya'), { text: 'Priya owes you ₹1,250', tone: 'owed' });
  assert.deepEqual(coupleLine(-5050, 'Priya'), { text: 'You owe Priya ₹50.50', tone: 'late' });
  assert.deepEqual(coupleLine(0, 'Priya'), { text: 'You and Priya are all settled', tone: 'muted' });
});

test('the summary under the buttons', () => {
  assert.equal(coupleSummary('meHalf', 500, ME, THEM, 'Priya'), 'Priya owes you ₹250');
  assert.equal(coupleSummary('meAll', 500, ME, THEM, 'Priya'), 'Priya owes you ₹500');
  assert.equal(coupleSummary('themHalf', 500, ME, THEM, 'Priya'), 'You owe Priya ₹250');
  assert.equal(coupleSummary('themAll', 500, ME, THEM, 'Priya'), 'You owe Priya ₹500');
  assert.equal(coupleSummary('meHalf', 0, ME, THEM, 'Priya'), '');
  assert.equal(coupleLabel('themAll', 'Priya'), 'Priya paid · you owe all');
});

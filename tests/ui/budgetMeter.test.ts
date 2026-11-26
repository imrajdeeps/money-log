import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetText, fillPercent, meterTone } from '../../src/ui/budgetMeter.ts';
import { GROUPS, budgetState, fmtINR, nearBudget } from '../../src/core/logic.ts';
import type { Group } from '../../src/core/logic.ts';

// The meter's rules written out plainly (version 2.0, from the design: all paid, savings in the accent colour), compared on a grid of inputs.
function before(group: Group, spent: number, planned: number, over: boolean) {
  const st = budgetState(group, spent, planned, over);
  const saving = group === 'Saving';
  const diff = planned - spent;
  let text = '';
  if (saving) text = spent >= planned && planned > 0 ? 'on track' : planned > 0 ? `${fmtINR(Math.max(0, diff))} to go` : '';
  else text = diff === 0 && planned > 0 ? 'All paid · ₹0 left' : diff >= 0 ? `${fmtINR(diff)} left${nearBudget(spent, planned) ? ', nearly used' : ''}` : `${fmtINR(-diff)} over`;
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : spent > 0 ? 100 : 0;
  let tone: string;
  if (st === 'over' || st === 'short') tone = 'bad';
  else if (saving) tone = planned > 0 ? (spent >= planned ? 'good' : 'accent') : 'idle';
  else if (st === 'idle') tone = 'idle';
  else if (planned > 0 && spent === planned) tone = 'good';
  else tone = nearBudget(spent, planned) ? 'warn' : 'accent';
  return { text, pct, tone };
}

test('the words, the colour and the fill follow the rules on a grid of inputs', () => {
  for (const group of GROUPS) {
    for (const planned of [0, 100, 20000, Number.NaN]) {
      for (const spent of [0, 1, 79, 80, 99.5, 100, 101, 250, 20000, 30000, Number.NaN]) {
        for (const over of [false, true]) {
          const want = before(group, spent, planned, over);
          const saving = group === 'Saving';
          const tone = meterTone(budgetState(group, spent, planned, over), saving, spent, planned);
          const label = `${group} spent ${spent} of ${planned}, month over ${over}`;
          assert.equal(budgetText(saving, spent, planned), want.text, label);
          assert.ok(Object.is(fillPercent(spent, planned), want.pct), label);
          assert.equal(tone, want.tone, label);
        }
      }
    }
  }
});

test('in words: room left, nearly used, over, and savings on the way', () => {
  assert.equal(budgetText(false, 500, 10000), '₹9,500 left');
  assert.equal(budgetText(false, 8500, 10000), '₹1,500 left');
  assert.equal(budgetText(false, 9200, 10000), '₹800 left, nearly used');
  assert.equal(budgetText(false, 10000, 10000), 'All paid · ₹0 left');
  assert.equal(budgetText(false, 10500, 10000), '₹500 over');
  assert.equal(budgetText(true, 4000, 10000), '₹6,000 to go');
  assert.equal(budgetText(true, 10000, 10000), 'on track');
  assert.equal(budgetText(true, 4000, 0), '');
  assert.equal(fillPercent(0, 0), 0);
  assert.equal(fillPercent(5, 0), 100);
  assert.equal(fillPercent(250, 100), 100);
});

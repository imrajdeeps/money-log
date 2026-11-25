import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BASELINE_FILE, LIMIT, scanSrc, scoreSource } from '../support/complexity.ts';

// How hard a function is to read, counted the way SonarLint counts it (rule S3776, limit 15): every branch adds one, every level of
// nesting makes the next branch cost more, and a run of && or || counts once. The ratchet below keeps new code under the limit and lets
// the list of old offenders only get shorter. See docs/prd-code-health.md.

const scoreOf = (code: string): number => scoreSource('x.ts', code)[0]!.score;

test('the counting follows the published examples', () => {
  // SonarSource's "sumOfPrimes": for +1, nested for +2, nested if +3, continue to a label +1
  assert.equal(scoreOf(`function sumOfPrimes(max) { let total = 0; OUT: for (let i = 1; i <= max; ++i) { for (let j = 2; j < i; ++j) { if (i % j === 0) { continue OUT; } } total += i; } return total; }`), 7);
  // a switch counts once, however many cases
  assert.equal(scoreOf(`function words(n) { switch (n) { case 1: return 'one'; case 2: return 'a couple'; case 3: return 'a few'; default: return 'lots'; } }`), 1);
  // try adds nothing and does not nest; catch counts and nests: if +1, for +2, while +3, catch +1, if in catch +2
  assert.equal(scoreOf(`function m() { try { if (a) { for (;;) { while (b) {} } } } catch (e) { if (c) {} } }`), 9);
  // if, else if and else each count once (no extra nesting for else if)
  assert.equal(scoreOf(`function f(a) { if (a) { x(); } else if (b) { y(); } else { z(); } }`), 3);
  // a run of the same operator counts once, a change of operator counts again: if +1, && +1, || +1, && +1
  assert.equal(scoreOf(`function f() { if (a && b && c || d || e && f) { x(); } }`), 4);
  // a conditional expression counts, and nests the next one
  assert.equal(scoreOf(`function f() { return a ? b : c; }`), 1);
  assert.equal(scoreOf(`function f() { return a ? (b ? 1 : 2) : 3; }`), 3);
});

test('a function written inside another counts towards it, one level deeper; what is inside an operand counts as usual', () => {
  assert.equal(scoreOf(`function outer() { const g = () => { if (x) { y(); } }; return g; }`), 2);
  assert.equal(scoreOf(`function C() { return ok && items.map((i) => (i ? 1 : 2)); }`), 3);
  assert.equal(scoreOf(`const C = () => { if (a) { return b ? 1 : 2; } return 0; };`), 1 + 2);
  assert.deepEqual(scoreSource('x.ts', `function a() { if (x) {} } function a() { if (x) { if (y) {} } }`).map((f) => [f.name, f.score]), [['a', 1], ['a#2', 3]], 'two with one name are told apart');
});

// ---------------------------------------------------------------- the ratchet
type Baseline = Record<string, number>;
const baseline: Baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
const now = scanSrc();

test(`no function in src/ is over ${LIMIT} unless it is on the list of old ones`, () => {
  const fresh = Object.entries(now).filter(([key]) => !Object.hasOwn(baseline, key)).map(([key, v]) => `${key} is ${v.score} (line ${v.line})`);
  assert.deepEqual(fresh, [], `split these into smaller pieces (the limit is ${LIMIT}); a long function is not a reason to extend the list`);
});

test('a function on the list does not get worse', () => {
  const worse = Object.entries(baseline).filter(([key, was]) => (now[key]?.score ?? 0) > was).map(([key, was]) => `${key}: ${was} became ${now[key]!.score}`);
  assert.deepEqual(worse, []);
});

test('the list only shrinks: a function that is better now has its line lowered or removed', () => {
  const stale = Object.entries(baseline)
    .filter(([key, was]) => (now[key]?.score ?? 0) < was)
    .map(([key, was]) => `${key}: listed at ${was}, now ${now[key]?.score ?? `at most ${LIMIT} (or gone or renamed)`}`);
  assert.deepEqual(stale, [], 'run: npm run complexity -- --write, and commit tests/app/complexity-baseline.json');
});

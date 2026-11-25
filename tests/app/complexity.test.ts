import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BASELINE_FILE, LIMIT, scanSrc, scoreSource } from '../support/complexity.ts';

// How hard a function is to read, counted the way SonarLint counts it (rule S3776, limit 15): every branch adds one, every level of
// nesting makes the next branch cost more, a run of && counts once, and || and ?? do not count. Each function is scored on its own. The
// ratchet below keeps new code under the limit and lets the list of old offenders only get shorter. See docs/prd-code-health.md.

const scoreOf = (code: string): number => scoreSource('x.ts', code)[0]!.score;
const scoreTsx = (code: string): number => scoreSource('x.tsx', code)[0]!.score;

test('the counting follows SonarSource\'s worked examples', () => {
  // "sumOfPrimes": for +1, nested for +2, nested if +3, continue to a label +1
  assert.equal(scoreOf(`function sumOfPrimes(max) { let total = 0; OUT: for (let i = 1; i <= max; ++i) { for (let j = 2; j < i; ++j) { if (i % j === 0) { continue OUT; } } total += i; } return total; }`), 7);
  // a switch counts once, however many cases
  assert.equal(scoreOf(`function words(n) { switch (n) { case 1: return 'one'; case 2: return 'a couple'; case 3: return 'a few'; default: return 'lots'; } }`), 1);
  // try adds nothing and does not nest; catch counts and nests: if +1, for +2, while +3, catch +1, if in catch +2
  assert.equal(scoreOf(`function m() { try { if (a) { for (;;) { while (b) {} } } } catch (e) { if (c) {} } }`), 9);
  // if, else if and else each count once (no extra nesting for else if)
  assert.equal(scoreOf(`function f(a) { if (a) { x(); } else if (b) { y(); } else { z(); } }`), 3);
  // a conditional expression counts, and nests the next one
  assert.equal(scoreOf(`function f() { return a ? b : c; }`), 1);
  assert.equal(scoreOf(`function f() { return a ? (b ? 1 : 2) : 3; }`), 3);
});

test('a run of && counts once; || and ?? do not count (as SonarJS has it today)', () => {
  assert.equal(scoreOf(`function f() { return a && b && c; }`), 1);
  assert.equal(scoreOf(`function f() { return a && (b && c); }`), 1, 'parentheses do not start a new run');
  assert.equal(scoreOf(`function f() { return a || b || c; }`), 0);
  assert.equal(scoreOf(`function f() { return [o.a ?? 1, o.b ?? 2, o.c ?? 3]; }`), 0);
  // if +1, then && +1, || free, && after something else +1
  assert.equal(scoreOf(`function f() { if (a && b && c || d || e && f) { x(); } }`), 3);
  assert.equal(scoreOf(`function f() { return a && b || c && d; }`), 2);
});

test('&& straight inside JSX is free; any other short-circuit there counts as usual', () => {
  assert.equal(scoreTsx(`function C() { return <div>{a && <b/>}{c && <i/>}</div>; }`), 0);
  assert.equal(scoreTsx(`function C() { return <div>{a && b && <b/>}</div>; }`), 0);
  assert.equal(scoreTsx(`function C() { return <div>{a && b || c}</div>; }`), 1, 'two operators: not a plain short-circuit');
  assert.equal(scoreTsx(`function C() { return <div>{a ? <b/> : c && <i/>}</div>; }`), 1 + 1, 'the conditional counts, and the && inside it is not directly in the JSX');
  assert.equal(scoreOf(`function f() { const x = a && b; return x; }`), 1, 'outside JSX it counts');
});

test('every function is scored on its own: what is inside a nested function counts for that one, with nesting starting again at zero', () => {
  const r = scoreSource('x.ts', `function outer() { if (a) { const g = () => { if (x) { y(); } }; g(); } }`);
  assert.deepEqual(r.map((f) => [f.name, f.score]), [['outer', 1], ['outer>g', 1]]);
  const c = scoreSource('x.ts', `function C() { return ok && items.map((i) => (i ? 1 : 2)); }`);
  assert.deepEqual(c.map((f) => [f.name, f.score]), [['C', 1], ['C>(anonymous)', 1]]);
  assert.deepEqual(scoreSource('x.ts', `function a() { if (x) {} } function a() { if (x) { if (y) {} } }`).map((f) => [f.name, f.score]), [['a', 1], ['a#2', 3]], 'two with one name are told apart');
  assert.equal(scoreSource('x.ts', `const C = () => { if (a) { return b ? 1 : 2; } return 0; };`)[0]!.score, 1 + 2);
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

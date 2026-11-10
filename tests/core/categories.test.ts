import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN, MAX_ITEMS, MAX_NAME, MAX_OWN, addCategory, categoryList, checkName, cleanMine, mergeMine, missingFromPlan,
  planCovers, planForMonth, removeCategory, sameMine, setBudget,
} from '../../src/core/categories.ts';
import type { Mine } from '../../src/core/categories.ts';
import { catKey, makeEntry, normName, summarizeMonth } from '../../src/core/logic.ts';
import type { Entry, PlanData } from '../../src/core/logic.ts';
import { makeBackup, parseBackup } from '../../src/data/backup.ts';

const T0 = '2026-11-10T10:00:00.000Z';
const T1 = '2026-11-10T11:00:00.000Z';
const names = (l: { name: string }[]) => l.map((c) => c.name);
const mk = (over: Partial<Entry>): Entry => ({ ...makeEntry({ amount: 100, category: 'Rent', method: null, note: '', date: '2026-11-09' }, T0), ...over });

// a spreadsheet plan that spells things its own way
const PLAN: PlanData = {
  v: 1,
  months: ['2026-11', '2026-12'],
  rows: [
    { c: 'rent', g: 'Spending', p: [9000, 9500] }, // same category as the built-in Rent, other spelling
    { c: 'Bike EMI', g: 'EMI', p: [0, 12554] },
    { c: 'Savings', g: 'Spending', p: [100, 100] }, // the sheet files this one under another group
  ],
};

test('without any plan the person gets the built-in categories, grouped, and nothing is required', () => {
  const l = categoryList(null, {});
  assert.equal(l.length, BUILTIN.length);
  assert.deepEqual(l.map((c) => c.group), ['Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'EMI', 'Family', 'Saving']);
  assert.ok(l.every((c) => c.source === 'builtin' && c.budget === 0));
  assert.ok(BUILTIN.every((b) => checkName(b.c) === null && normName(b.c) === b.c), 'built-in names are tidy');
  assert.equal(new Set(BUILTIN.map((b) => catKey(b.c))).size, BUILTIN.length, 'no two built-ins share a key');
});

test('an own category appears in its group, sorted, and a budget on any category is kept', () => {
  let m: Mine = {};
  const a = addCategory(m, categoryList(null, m), '  Pet   food ', 'Family', T0);
  assert.ok(a.ok);
  m = a.ok ? a.mine : m;
  const b = addCategory(m, categoryList(null, m), 'Gym', 'Spending', T0);
  m = b.ok ? b.mine : m;
  m = setBudget(m, categoryList(null, m).find((c) => c.name === 'Rent')!, 9000, T0);
  const l = categoryList(null, m);
  assert.deepEqual(names(l).filter((n) => ['Gym', 'Pet food', 'Rent'].includes(n)), ['Rent', 'Gym', 'Pet food']);
  assert.equal(l.find((c) => c.name === 'Pet food')?.group, 'Family');
  assert.equal(l.find((c) => c.name === 'Pet food')?.source, 'mine');
  assert.equal(l.find((c) => c.name === 'Rent')?.budget, 9000);
});

test('an imported plan merges: its group, spelling and amounts win, the rest stays', () => {
  const l = categoryList(PLAN, {});
  const rent = l.filter((c) => catKey(c.name) === 'rent');
  assert.equal(rent.length, 1, 'one Rent, not two');
  assert.equal(rent[0]?.name, 'rent');
  assert.equal(rent[0]?.source, 'plan');
  assert.equal(l.find((c) => c.name === 'Savings')?.group, 'Spending', "the sheet's group wins over the built-in one");
  assert.ok(l.some((c) => c.name === 'Groceries' && c.source === 'builtin'), 'built-ins the sheet lacks stay');
  assert.ok(l.some((c) => c.name === 'Bike EMI' && c.group === 'EMI'));
});

test('a budget set in the app wins for its category; the plan decides the rest, and the app fills the months the plan lacks', () => {
  let m: Mine = {};
  const info = (name: string, plan: PlanData | null = PLAN) => categoryList(plan, m).find((c) => c.name === name)!;
  m = setBudget(m, info('Groceries'), 6000, T0);
  const row = (month: string, name: string) => planForMonth(PLAN, m, month).rows.find((r) => r.c === name)?.p[0];
  assert.equal(row('2026-11', 'rent'), 9000, 'no app budget: the sheet has the figure');
  m = setBudget(m, info('rent'), 1234, T0); // the plan covers this one in 2026-11
  assert.equal(row('2026-11', 'rent'), 1234, 'a budget set in the app wins over the sheet');
  assert.equal(row('2026-12', 'rent'), 1234);
  assert.equal(row('2027-03', 'rent'), 1234, 'outside the sheet the in-app budget applies');
  m = setBudget(m, info('rent'), 0, T0);
  assert.equal(row('2026-11', 'rent'), 9000, 'cleared: back to the sheet');
  assert.equal(row('2026-12', 'rent'), 9500);
  assert.equal(row('2027-03', 'rent'), 0);
  assert.equal(row('2026-11', 'Groceries'), 6000, 'a category the sheet lacks uses the app budget in every month');
  assert.equal(row('2026-11', 'Bike EMI'), 0);
  assert.equal(planCovers(PLAN, '2026-12'), true);
  assert.equal(planCovers(PLAN, '2027-03'), false);
  assert.equal(planCovers(null, '2026-12'), false);
  assert.equal(planForMonth(null, m, '2026-11').rows.find((r) => r.c === 'Groceries')?.p[0], 6000, 'no plan at all: only the app budgets');
});

test('a month with the merged plan adds up logged payments, whatever their spelling', () => {
  const m: Mine = {};
  const entries = [
    mk({ category: 'Rent', amount: 9000, entry_date: '2026-11-01' }), // logged before the import, built-in spelling
    mk({ category: 'Groceries', amount: 300, entry_date: '2026-11-03' }),
    mk({ category: 'Old category', amount: 50, entry_date: '2026-11-04' }),
    mk({ category: 'old  CATEGORY', amount: 25, entry_date: '2026-11-05' }),
  ];
  const s = summarizeMonth(entries, planForMonth(PLAN, m, '2026-11'), '2026-11');
  const rent = s.rows.find((r) => catKey(r.category) === 'rent');
  assert.deepEqual([rent?.spent, rent?.planned], [9000, 9000]);
  assert.deepEqual(s.extra, [{ category: 'Old category', spent: 75 }], 'spellings that differ in case or spacing are one line');
  assert.equal(s.totalSpent, 9375);
});

test('names: tidy, bounded, and a duplicate or a removed built-in is handled', () => {
  assert.equal(normName('  a\tb\nc  '), 'a b c');
  assert.equal(checkName('   '), 'Enter a name for the category.');
  assert.ok(checkName('x'.repeat(MAX_NAME + 1)));
  assert.equal(checkName('x'.repeat(MAX_NAME)), null);
  let m: Mine = {};
  const dup = addCategory(m, categoryList(PLAN, m), ' GROCERIES ', 'Family', T0);
  assert.deepEqual(dup, { ok: false, error: '"GROCERIES" is already in your list.' });
  assert.equal(addCategory(m, categoryList(PLAN, m), 'RENT', 'Spending', T0).ok, false, 'a plan category counts too');

  // remove a built-in, then add it back by name: it returns under its own spelling and group, with its budget
  const groceries = categoryList(null, m).find((c) => c.name === 'Groceries')!;
  m = setBudget(m, groceries, 5000, T0);
  m = removeCategory(m, groceries, T1);
  assert.ok(!names(categoryList(null, m)).includes('Groceries'));
  const back = addCategory(m, categoryList(null, m), 'groceries', 'Saving', '2026-11-10T12:00:00.000Z');
  assert.ok(back.ok);
  if (back.ok) {
    assert.equal(back.name, 'Groceries');
    const l = categoryList(null, back.mine);
    assert.deepEqual([l.find((c) => c.name === 'Groceries')?.group, l.find((c) => c.name === 'Groceries')?.budget], ['Spending', 5000]);
  }
});

test('removing an own category hides it from the pickers only', () => {
  let m: Mine = {};
  const r = addCategory(m, categoryList(null, m), 'Gym', 'Spending', T0);
  m = r.ok ? r.mine : m;
  const gym = categoryList(null, m).find((c) => c.name === 'Gym')!;
  m = removeCategory(m, gym, T1);
  assert.ok(!names(categoryList(null, m)).includes('Gym'));
  assert.equal(m[catKey('Gym')]?.x, 1, 'kept as a removal so the other phone drops it too');
  // payments already logged under it still show up as spending
  const s = summarizeMonth([mk({ category: 'Gym', amount: 40 })], planForMonth(null, m, '2026-11'), '2026-11');
  assert.deepEqual(s.extra, [{ category: 'Gym', spent: 40 }]);
});

test('a budget is rounded, cleared with 0, and an unchanged value changes nothing', () => {
  const info = categoryList(null, {}).find((c) => c.name === 'Bills')!;
  const m1 = setBudget({}, info, 1234.567, T0);
  assert.equal(m1[catKey('Bills')]?.b, 1234.57);
  assert.equal(setBudget(m1, info, 1234.57, T1), m1, 'same value: the same object, so nothing is saved or synced');
  assert.equal(setBudget({}, info, 0, T1) && Object.keys(setBudget({}, info, 0, T1)).length, 0, 'clearing a never-set budget adds nothing');
  const m2 = setBudget(m1, info, 0, T1);
  assert.equal(m2[catKey('Bills')]?.b, 0);
  assert.ok(m2[catKey('Bills')]!.t > m1[catKey('Bills')]!.t);
});

test('a later change is always stamped later, even from a phone whose clock is behind', () => {
  const info = categoryList(null, {}).find((c) => c.name === 'Bills')!;
  const m1 = setBudget({}, info, 100, T1);
  const m2 = setBudget(m1, info, 200, T0); // clock went backwards
  assert.ok(m2[catKey('Bills')]!.t > m1[catKey('Bills')]!.t);
});

test('limits: own categories and total items', () => {
  let m: Mine = {};
  for (let i = 0; i < MAX_OWN; i++) {
    const r = addCategory(m, categoryList(null, m), `Own ${i}`, 'Spending', T0);
    assert.ok(r.ok, `own ${i}`);
    m = r.ok ? r.mine : m;
  }
  const over = addCategory(m, categoryList(null, m), 'One too many', 'Spending', T0);
  assert.equal(over.ok, false);
  // a removed one frees a slot
  m = removeCategory(m, categoryList(null, m).find((c) => c.name === 'Own 3')!, T1);
  assert.ok(addCategory(m, categoryList(null, m), 'One more', 'Spending', T1).ok);
  assert.ok(MAX_ITEMS > MAX_OWN + BUILTIN.length);
});

test('merging two phones keeps each category\'s latest change', () => {
  const a: Mine = { rent: { n: 'Rent', g: 'Spending', b: 100, x: 0, t: T0 }, gym: { n: 'Gym', g: 'Spending', b: 0, x: 0, t: T0 } };
  const b: Mine = { rent: { n: 'Rent', g: 'Spending', b: 200, x: 0, t: T1 }, pets: { n: 'Pets', g: 'Family', b: 0, x: 0, t: T0 } };
  const merged = mergeMine(a, b);
  assert.deepEqual(Object.keys(merged).sort(), ['gym', 'pets', 'rent']);
  assert.equal(merged.rent?.b, 200);
  assert.ok(sameMine(mergeMine(b, a), merged), 'the order of the merge does not matter');
  const gone: Mine = { gym: { n: 'Gym', g: 'Spending', b: 0, x: 1, t: T1 } };
  assert.equal(mergeMine(a, gone).gym?.x, 1, 'a later removal wins over an earlier live copy');
  assert.equal(sameMine(a, a), true);
  assert.equal(sameMine(a, b), false);
});

test('anything malformed from the server or a backup is dropped, not repaired', () => {
  const good = { n: 'Gym', g: 'Spending', b: 10, x: 0, t: T0 };
  const out = cleanMine({
    gym: good,
    'bad key': good, // key is not the name's key
    pets: { ...good, n: 'Pets', g: 'Nope' },
    rich: { ...good, n: 'Rich', b: 1e9 },
    neg: { ...good, n: 'Neg', b: -1 },
    paise: { ...good, n: 'Paise', b: 1.234 },
    time: { ...good, n: 'Time', t: 'yesterday' },
    flag: { ...good, n: 'Flag', x: 2 },
    long: { ...good, n: 'x'.repeat(MAX_NAME + 1) },
    untidy: { ...good, n: ' Untidy ' },
    nothing: null,
  });
  assert.deepEqual(Object.keys(out), ['gym']);
  assert.deepEqual(cleanMine(null), {});
  assert.deepEqual(cleanMine('x'), {});
  const many = Object.fromEntries(Array.from({ length: MAX_ITEMS + 50 }, (_, i) => [`c${i}`, { ...good, n: `C${i}` }]));
  assert.equal(Object.keys(cleanMine(many)).length, MAX_ITEMS);
});

test('missingFromPlan lists categories the spreadsheet does not know, once each, and nothing without a plan', () => {
  assert.deepEqual(missingFromPlan(['Rent', 'rent', 'Gym', 'gym ', 'Bike EMI', 'Eating out'], PLAN), ['Eating out', 'Gym']);
  assert.deepEqual(missingFromPlan(['Gym'], null), []);
  assert.deepEqual(missingFromPlan([], PLAN), []);
});

test('names that every object already has a property for work like any other, and __proto__ is refused', () => {
  let m: Mine = {};
  for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const r = addCategory(m, categoryList(null, m), name, 'Spending', T0);
    assert.ok(r.ok, name);
    m = r.ok ? r.mine : m;
    const later = setBudget(m, categoryList(null, m).find((c) => c.name === name)!, 5, T1);
    assert.equal(later[catKey(name)]?.b, 5, name);
  }
  assert.equal(Object.keys(m).length, 4);
  const merged = mergeMine(m, {});
  assert.equal(Object.keys(merged).length, 4, 'merging into an empty cloud copy keeps them');
  assert.deepEqual(addCategory({}, categoryList(null, {}), '__Proto__', 'Spending', T0), { ok: false, error: 'Choose a different name.' });
  assert.deepEqual(cleanMine(JSON.parse('{"__proto__":{"n":"__proto__","g":"Spending","b":0,"x":0,"t":"2026-11-10T10:00:00.000Z"}}')), {});
  assert.equal(({} as any).n, undefined, 'the object prototype was not touched');
});

test('the backup file carries the categories and budgets, and an older backup without them still loads', () => {
  let m: Mine = {};
  const r = addCategory(m, categoryList(null, m), 'Gym', 'Spending', T0);
  m = r.ok ? r.mine : m;
  m = setBudget(m, categoryList(null, m).find((c) => c.name === 'Rent')!, 9000, T0);
  const text = JSON.stringify(makeBackup([], null, T0, { categories: m }));
  const back = parseBackup(text);
  assert.ok(back.ok);
  if (back.ok) assert.deepEqual(back.categories, m);
  const none = JSON.parse(JSON.stringify(makeBackup([], null, T0)));
  assert.equal('categories' in none, false, 'nothing is written when there is nothing to keep');
  const old = parseBackup(JSON.stringify(none));
  assert.ok(old.ok);
  if (old.ok) assert.deepEqual(old.categories, {});
  const tampered = parseBackup(JSON.stringify({ ...none, categories: { gym: { n: 'Gym', g: 'Nope', b: 1, x: 0, t: T0 } } }));
  assert.ok(tampered.ok);
  if (tampered.ok) assert.deepEqual(tampered.categories, {}, 'a malformed item is dropped, not trusted');
});

test('no budget is not a budget of zero: spending on an unbudgeted category is not "over", a spreadsheet zero still is', () => {
  const entries = [mk({ category: 'Groceries', amount: 450 }), mk({ category: 'Bike EMI', amount: 700 })];
  const bare = summarizeMonth(entries, planForMonth(null, {}, '2026-11'), '2026-11');
  assert.equal(bare.rows.find((r) => r.category === 'Groceries')?.budgeted, false);
  assert.equal(bare.groups.Spending.budgeted, false);
  assert.equal(bare.groups.Spending.spent, 450 + 0);

  let m: Mine = {};
  m = setBudget(m, categoryList(null, m).find((c) => c.name === 'Groceries')!, 6000, T0);
  const withBudget = summarizeMonth(entries, planForMonth(null, m, '2026-11'), '2026-11');
  assert.deepEqual(withBudget.rows.find((r) => r.category === 'Groceries'), { category: 'Groceries', group: 'Spending', spent: 450, planned: 6000, left: 5550, budgeted: true });
  assert.equal(withBudget.groups.Spending.budgeted, true);
  assert.equal(withBudget.rows.find((r) => r.category === 'Rent')?.budgeted, false, 'the others stay unbudgeted');

  const merged = summarizeMonth(entries, planForMonth(PLAN, m, '2026-11'), '2026-11');
  const bike = merged.rows.find((r) => r.category === 'Bike EMI');
  assert.deepEqual([bike?.planned, bike?.budgeted, bike?.spent], [0, true, 700], "the spreadsheet's own zero is a plan of zero");
  const later = summarizeMonth(entries, planForMonth(PLAN, m, '2027-03'), '2027-03');
  assert.equal(later.rows.find((r) => r.category === 'Bike EMI')?.budgeted, false, 'outside the sheet, no app budget means none');
  assert.equal(planForMonth(PLAN, m, '2026-11').rows.every((r) => !('u' in r) || r.u === 1), true);
});

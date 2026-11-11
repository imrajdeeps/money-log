import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN, MAX_ITEMS, MAX_NAME, MAX_OWN, addCategory, categoryList, checkName, cleanMine, mergeMine, migratePlan,
  planForMonth, removeCategory, sameMine, setBudget,
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
  const l = categoryList({});
  assert.equal(l.length, BUILTIN.length);
  assert.deepEqual(l.map((c) => c.group), ['Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'Spending', 'EMI', 'Family', 'Saving']);
  assert.ok(l.every((c) => c.source === 'builtin' && c.budget === 0));
  assert.ok(BUILTIN.every((b) => checkName(b.c) === null && normName(b.c) === b.c), 'built-in names are tidy');
  assert.equal(new Set(BUILTIN.map((b) => catKey(b.c))).size, BUILTIN.length, 'no two built-ins share a key');
});

test('an own category appears in its group, sorted, and a budget on any category is kept', () => {
  let m: Mine = {};
  const a = addCategory(m, categoryList(m), '  Pet   food ', 'Family', T0);
  assert.ok(a.ok);
  m = a.ok ? a.mine : m;
  const b = addCategory(m, categoryList(m), 'Gym', 'Spending', T0);
  m = b.ok ? b.mine : m;
  m = setBudget(m, categoryList(m).find((c) => c.name === 'Rent')!, 9000, T0);
  const l = categoryList(m);
  assert.deepEqual(names(l).filter((n) => ['Gym', 'Pet food', 'Rent'].includes(n)), ['Rent', 'Gym', 'Pet food']);
  assert.equal(l.find((c) => c.name === 'Pet food')?.group, 'Family');
  assert.equal(l.find((c) => c.name === 'Pet food')?.source, 'mine');
  assert.equal(l.find((c) => c.name === 'Rent')?.budget, 9000);
});

test('a month adds up logged payments, whatever their spelling', () => {
  const m: Mine = {};
  const entries = [
    mk({ category: 'Rent', amount: 9000, entry_date: '2026-11-01' }), // logged before the import, built-in spelling
    mk({ category: 'Groceries', amount: 300, entry_date: '2026-11-03' }),
    mk({ category: 'Old category', amount: 50, entry_date: '2026-11-04' }),
    mk({ category: 'old  CATEGORY', amount: 25, entry_date: '2026-11-05' }),
  ];
  const m2: Mine = setBudget(m, categoryList(m).find((c) => c.name === 'Rent')!, 9000, T0);
  const s = summarizeMonth(entries, planForMonth(m2, '2026-11'), '2026-11');
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
  const dup = addCategory(m, categoryList(m), ' GROCERIES ', 'Family', T0);
  assert.deepEqual(dup, { ok: false, error: '"GROCERIES" is already in your list.' });
  assert.equal(addCategory(m, categoryList(m), 'RENT', 'Spending', T0).ok, false, 'a built-in counts too');

  // remove a built-in, then add it back by name: it returns under its own spelling and group, with its budget
  const groceries = categoryList(m).find((c) => c.name === 'Groceries')!;
  m = setBudget(m, groceries, 5000, T0);
  m = removeCategory(m, groceries, T1);
  assert.ok(!names(categoryList(m)).includes('Groceries'));
  const back = addCategory(m, categoryList(m), 'groceries', 'Saving', '2026-11-10T12:00:00.000Z');
  assert.ok(back.ok);
  if (back.ok) {
    assert.equal(back.name, 'Groceries');
    const l = categoryList(back.mine);
    assert.deepEqual([l.find((c) => c.name === 'Groceries')?.group, l.find((c) => c.name === 'Groceries')?.budget], ['Spending', 5000]);
  }
});

test('removing an own category hides it from the pickers only', () => {
  let m: Mine = {};
  const r = addCategory(m, categoryList(m), 'Gym', 'Spending', T0);
  m = r.ok ? r.mine : m;
  const gym = categoryList(m).find((c) => c.name === 'Gym')!;
  m = removeCategory(m, gym, T1);
  assert.ok(!names(categoryList(m)).includes('Gym'));
  assert.equal(m[catKey('Gym')]?.x, 1, 'kept as a removal so the other phone drops it too');
  // payments already logged under it still show up as spending
  const s = summarizeMonth([mk({ category: 'Gym', amount: 40 })], planForMonth(m, '2026-11'), '2026-11');
  assert.deepEqual(s.extra, [{ category: 'Gym', spent: 40 }]);
});

test('a budget is rounded, cleared with 0, and an unchanged value changes nothing', () => {
  const info = categoryList({}).find((c) => c.name === 'Bills')!;
  const m1 = setBudget({}, info, 1234.567, T0);
  assert.equal(m1[catKey('Bills')]?.b, 1234.57);
  assert.equal(setBudget(m1, info, 1234.57, T1), m1, 'same value: the same object, so nothing is saved or synced');
  assert.equal(setBudget({}, info, 0, T1) && Object.keys(setBudget({}, info, 0, T1)).length, 0, 'clearing a never-set budget adds nothing');
  const m2 = setBudget(m1, info, 0, T1);
  assert.equal(m2[catKey('Bills')]?.b, 0);
  assert.ok(m2[catKey('Bills')]!.t > m1[catKey('Bills')]!.t);
});

test('a later change is always stamped later, even from a phone whose clock is behind', () => {
  const info = categoryList({}).find((c) => c.name === 'Bills')!;
  const m1 = setBudget({}, info, 100, T1);
  const m2 = setBudget(m1, info, 200, T0); // clock went backwards
  assert.ok(m2[catKey('Bills')]!.t > m1[catKey('Bills')]!.t);
});

test('limits: own categories and total items', () => {
  let m: Mine = {};
  for (let i = 0; i < MAX_OWN; i++) {
    const r = addCategory(m, categoryList(m), `Own ${i}`, 'Spending', T0);
    assert.ok(r.ok, `own ${i}`);
    m = r.ok ? r.mine : m;
  }
  const over = addCategory(m, categoryList(m), 'One too many', 'Spending', T0);
  assert.equal(over.ok, false);
  // a removed one frees a slot
  m = removeCategory(m, categoryList(m).find((c) => c.name === 'Own 3')!, T1);
  assert.ok(addCategory(m, categoryList(m), 'One more', 'Spending', T1).ok);
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

test('names that every object already has a property for work like any other, and __proto__ is refused', () => {
  let m: Mine = {};
  for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const r = addCategory(m, categoryList(m), name, 'Spending', T0);
    assert.ok(r.ok, name);
    m = r.ok ? r.mine : m;
    const later = setBudget(m, categoryList(m).find((c) => c.name === name)!, 5, T1);
    assert.equal(later[catKey(name)]?.b, 5, name);
  }
  assert.equal(Object.keys(m).length, 4);
  const merged = mergeMine(m, {});
  assert.equal(Object.keys(merged).length, 4, 'merging into an empty cloud copy keeps them');
  assert.deepEqual(addCategory({}, categoryList({}), '__Proto__', 'Spending', T0), { ok: false, error: 'Choose a different name.' });
  assert.deepEqual(cleanMine(JSON.parse('{"__proto__":{"n":"__proto__","g":"Spending","b":0,"x":0,"t":"2026-11-10T10:00:00.000Z"}}')), {});
  assert.equal(({} as any).n, undefined, 'the object prototype was not touched');
});

test('the backup file carries the categories and budgets, and an older backup without them still loads', () => {
  let m: Mine = {};
  const r = addCategory(m, categoryList(m), 'Gym', 'Spending', T0);
  m = r.ok ? r.mine : m;
  m = setBudget(m, categoryList(m).find((c) => c.name === 'Rent')!, 9000, T0);
  const text = JSON.stringify(makeBackup([], T0, { categories: m }));
  const back = parseBackup(text);
  assert.ok(back.ok);
  if (back.ok) assert.deepEqual(back.categories, m);
  const none = JSON.parse(JSON.stringify(makeBackup([], T0)));
  assert.equal('categories' in none, false, 'nothing is written when there is nothing to keep');
  const old = parseBackup(JSON.stringify(none));
  assert.ok(old.ok);
  if (old.ok) assert.deepEqual(old.categories, {});
  const tampered = parseBackup(JSON.stringify({ ...none, categories: { gym: { n: 'Gym', g: 'Nope', b: 1, x: 0, t: T0 } } }));
  assert.ok(tampered.ok);
  if (tampered.ok) assert.deepEqual(tampered.categories, {}, 'a malformed item is dropped, not trusted');
});

test('no budget is not a budget of zero: spending on an unbudgeted category is not "over"', () => {
  const entries = [mk({ category: 'Groceries', amount: 450 }), mk({ category: 'Bike EMI', amount: 700 })];
  const bare = summarizeMonth(entries, planForMonth({}, '2026-11'), '2026-11');
  assert.equal(bare.rows.find((r) => r.category === 'Groceries')?.budgeted, false);
  assert.equal(bare.groups.Spending.budgeted, false);
  assert.equal(bare.groups.Spending.spent, 450 + 0);

  let m: Mine = {};
  m = setBudget(m, categoryList(m).find((c) => c.name === 'Groceries')!, 6000, T0);
  const withBudget = summarizeMonth(entries, planForMonth(m, '2026-11'), '2026-11');
  assert.deepEqual(withBudget.rows.find((r) => r.category === 'Groceries'), { category: 'Groceries', group: 'Spending', spent: 450, planned: 6000, left: 5550, budgeted: true });
  assert.equal(withBudget.groups.Spending.budgeted, true);
  assert.equal(withBudget.rows.find((r) => r.category === 'Rent')?.budgeted, false, 'the others stay unbudgeted');

});

// ---------------------------------------------------------------- bringing the old imported plan across
const OLD_PLAN = { ...PLAN, importedAt: '2026-11-01T00:00:00.000Z' } as PlanData;

test('an old plan becomes budgets and categories: the month nearest to this one, the plan\'s spelling for new ones', () => {
  const r = migratePlan(OLD_PLAN, {}, '2026-12');
  assert.equal(r.added, 3);
  const l = categoryList(r.mine);
  assert.equal(l.find((c) => c.name === 'Rent')?.budget, 9500, 'a built-in keeps its own spelling and takes December\'s figure');
  assert.equal(l.find((c) => c.name === 'Bike EMI')?.budget, 12554);
  assert.equal(l.find((c) => c.name === 'Bike EMI')?.source, 'mine', 'a category the app lacked becomes one of the person\'s own');
  assert.equal(l.find((c) => c.name === 'Savings')?.budget, 100);
  assert.equal(l.find((c) => c.name === 'Savings')?.group, 'Saving', 'a built-in keeps its group');
  const before = migratePlan(OLD_PLAN, {}, '2026-01');
  assert.equal(categoryList(before.mine).find((c) => c.name === 'Rent')?.budget, 9000, 'a month before the plan uses its first month');
  const after = migratePlan(OLD_PLAN, {}, '2030-01');
  assert.equal(categoryList(after.mine).find((c) => c.name === 'Bike EMI')?.budget, 12554, 'a month after it uses its last month');
});

test('what the person set in the app wins, and migrating twice or on two phones gives the same result', () => {
  let m: Mine = setBudget({}, categoryList({}).find((c) => c.name === 'Rent')!, 1234, T0);
  const gym = addCategory(m, categoryList(m), 'Bike EMI', 'Spending', T0);
  assert.ok(gym.ok);
  m = gym.mine;
  const r = migratePlan(OLD_PLAN, m, '2026-11');
  assert.equal(categoryList(r.mine).find((c) => c.name === 'Rent')?.budget, 1234, 'an app budget is not overwritten');
  assert.equal(categoryList(r.mine).find((c) => c.name === 'Bike EMI')?.group, 'Spending', 'an own category of the same name is kept as it is');
  const once = migratePlan(OLD_PLAN, {}, '2026-11').mine;
  assert.deepEqual(migratePlan(OLD_PLAN, once, '2026-11'), { mine: once, added: 0 });
  assert.deepEqual(migratePlan(OLD_PLAN, {}, '2026-11').mine, once, 'the same items every time: no clock is read');
  assert.deepEqual(migratePlan(null, {}, '2026-11'), { mine: {}, added: 0 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LANG, LANGS, cleanLang, fill, getLang, setLang, tr, translation } from '../../src/core/i18n.ts';
import { HI } from '../../src/core/i18n/hi.ts';
import { HINGLISH } from '../../src/core/i18n/hinglish.ts';

const holes = (s: string) => new Set(s.match(/\{\d+\}/g) ?? []);

test('English is the key and the default', () => {
  setLang('en');
  assert.equal(DEFAULT_LANG, 'en');
  assert.equal(getLang(), 'en');
  assert.equal(tr('Add expense'), 'Add expense');
  assert.equal(tr('Saved {0} · {1}', '₹5', 'Groceries'), 'Saved ₹5 · Groceries');
  assert.equal(tr('Something with no translation at all'), 'Something with no translation at all');
});

test('values are filled in; false, null and nothing show as nothing', () => {
  assert.equal(fill('A{0}B{1}C', ['x', 2]), 'AxB2C');
  assert.equal(fill('{0}|{1}|{2}', [false, null, undefined]), '||');
  assert.equal(fill('{1} before {0}', ['a', 'b']), 'b before a');
  assert.equal(fill('no holes', []), 'no holes');
  assert.equal(fill('{0} and {0}', [7]), '7 and 7');
});

test('a language shows its own text, and English where it has none yet', () => {
  setLang('hi');
  assert.equal(tr('Add expense'), 'खर्च जोड़ें');
  assert.equal(tr('A text nobody has translated {0}', '₹5'), 'A text nobody has translated ₹5', 'a text with no entry falls back to English, values still filled');
  assert.equal(tr('{0} copied.', 'Link'), 'Link कॉपी हो गया।');
  setLang('hinglish');
  assert.equal(tr('Add expense'), 'Kharcha jodein');
  setLang('en');
  assert.equal(tr('Add expense'), 'Add expense');
});

test('an unknown or odd language name means English', () => {
  for (const v of ['', 'fr', null, undefined, 3, {}, '__proto__', 'constructor']) assert.equal(cleanLang(v), 'en');
  for (const l of LANGS) assert.equal(cleanLang(l.id), l.id);
  assert.equal(translation('hi', 'toString'), undefined, 'a text called toString must not find what every object inherits');
  setLang('hi');
  assert.equal(tr('constructor'), 'constructor');
  setLang('en');
});

test('a translation never uses a {n} the English text lacks, and is never empty', () => {
  for (const [name, dict] of [['hi', HI], ['hinglish', HINGLISH]] as const) {
    for (const [en, other] of Object.entries(dict)) {
      assert.ok(other.trim().length > 0, `${name}: empty translation of ${en}`);
      for (const h of holes(other)) assert.ok(holes(en).has(h), `${name}: ${h} is not in "${en}"`);
    }
  }
});

test('Hindi is in Devanagari and Hinglish is in Roman letters', () => {
  const deva = /[ऀ-ॿ]/;
  const KEEP = new Set(['Money Log', 'English', 'EMI', 'Log', 'App export']); // names and codes that stay as they are
  for (const [en, hi] of Object.entries(HI)) if (!KEEP.has(en) && /[A-Za-z]{4}/.test(en) && !/^[A-Z0-9 ,/.:+\-_(){}→·%₹]+$/.test(en) && !/^[a-z]+$/.test(en)) assert.ok(deva.test(hi) || /^[\w ,./:+\-(){}·→₹%]+$/.test(hi), `Hindi text without Devanagari: ${en}`);
  for (const [en, hl] of Object.entries(HINGLISH)) assert.ok(!deva.test(hl), `Hinglish text with Devanagari: ${en}`);
});

test('the two dictionaries cover the same texts', () => {
  assert.deepEqual(Object.keys(HI).sort(), Object.keys(HINGLISH).sort());
  assert.ok(Object.keys(HI).length > 700, 'the screens are translated');
});

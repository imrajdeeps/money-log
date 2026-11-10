import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { THEME_BG, THEME_KEY, cleanChoice, resolveTheme } from '../../../src/features/settings/theme.ts';
import type { ThemeChoice } from '../../../src/features/settings/theme.ts';

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
// the stylesheet is src/styles/index.css and the files it imports (tokens.css): read them in that order
const index = read('src/styles/index.css');
const css = [...index.matchAll(/@import '\.\/([\w-]+)\.css'/g)].map((m) => read(`src/styles/${m[1]}.css`)).join('\n') + '\n' + index;

test('only "light" and "dark" are real choices; anything else, or nothing, means match my phone', () => {
  assert.equal(cleanChoice('light'), 'light');
  assert.equal(cleanChoice('dark'), 'dark');
  for (const v of ['system', '', 'Dark', 'auto', null, undefined, 3, {}]) assert.equal(cleanChoice(v), 'system', String(v));
});

test('a chosen theme wins over the phone; "system" follows the phone', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

// public/theme-init.js runs before the app does, so it cannot import src/theme.ts: run it for real and compare.
function runInit(stored: unknown, phoneDark: boolean, opts: { storageThrows?: boolean; noMatchMedia?: boolean } = {}) {
  const attrs: Record<string, string> = {};
  const metaAttrs: Record<string, string> = {};
  const sandbox: Record<string, unknown> = {
    localStorage: { getItem: (k: string) => { if (opts.storageThrows) throw new Error('blocked'); return k === THEME_KEY ? stored : null; } },
    document: {
      documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } },
      querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? { setAttribute: (k: string, v: string) => { metaAttrs[k] = v; } } : null),
    },
  };
  if (!opts.noMatchMedia) sandbox.matchMedia = () => ({ matches: phoneDark });
  runInNewContext(read('public/theme-init.js'), sandbox);
  return { theme: attrs['data-theme'], color: metaAttrs.content };
}

test('the early script and the app resolve the theme the same way, whatever is stored', () => {
  for (const stored of ['light', 'dark', 'system', null, 'junk']) {
    for (const phoneDark of [false, true]) {
      const want = resolveTheme(cleanChoice(stored), phoneDark);
      assert.deepEqual(runInit(stored, phoneDark), { theme: want, color: THEME_BG[want] }, `${String(stored)} / phone dark: ${phoneDark}`);
    }
  }
});

test('the early script copes with blocked storage and a browser without matchMedia', () => {
  assert.equal(runInit('dark', true, { storageThrows: true }).theme, 'dark', 'follows the phone when storage is blocked');
  assert.equal(runInit('dark', false, { storageThrows: true }).theme, 'light');
  assert.equal(runInit('dark', false, { noMatchMedia: true }).theme, 'dark', 'an explicit choice needs no matchMedia');
  assert.equal(runInit(null, false, { noMatchMedia: true }).theme, 'light', 'no matchMedia and no choice: light');
});

test('the page loads the early script and keeps a single theme-color tag', () => {
  const html = read('index.html');
  assert.match(html, /<script src="\.\/theme-init\.js"><\/script>/);
  assert.equal((html.match(/name="theme-color"/g) ?? []).length, 1, 'one tag, so the app can set it for its own theme');
  assert.match(read('vite.config.ts'), /"font-src 'self'"/, 'the bundled font must be allowed by the page rules');
});

// ---------------------------------------------------------------- colour contrast, read from the stylesheet
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block not found`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]!] = m[2]!.toLowerCase();
  return out;
}
const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") }; // the dark block only overrides what differs
const hero = { ...light, ...block('.hero') };

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };

// every pairing the stylesheet actually draws as text, at the WCAG AA level for normal text (4.5:1)
const TEXT: [string, string][] = [
  ['--ink', '--card'], ['--ink', '--bg'], ['--muted', '--card'], ['--muted', '--bg'], ['--accent', '--card'], ['--accent', '--bg'],
  ['--brand-ink', '--brand'], ['--primary-ink', '--primary'],
  ['--good', '--card'], ['--good', '--good-bg'], ['--bad', '--card'], ['--bad', '--bad-bg'], ['--warn', '--card'], ['--warn', '--warn-bg'],
  ['--brand', '--card'], ['--good-ink', '--good'], ['--bad-ink', '--bad'],
];

for (const [name, tokens] of [['light', light], ['dark', dark]] as const) {
  test(`${name} theme: every text and background pairing reads at AA (4.5:1)`, () => {
    for (const [fg, bg] of TEXT) {
      assert.ok(tokens[fg] && tokens[bg], `${name}: ${fg} or ${bg} is missing`);
      const r = contrast(tokens[fg]!, tokens[bg]!);
      assert.ok(r >= 4.5, `${name}: ${fg} ${tokens[fg]} on ${bg} ${tokens[bg]} is only ${r.toFixed(2)}:1`);
    }
  });
}

test('the big green tile reads at AA in both themes, and the page colours match the browser-bar colours', () => {
  const ground = hero['--hero']!;
  for (const fg of ['--muted', '--accent', '--good', '--bad', '--warn']) {
    const r = contrast(hero[fg]!, ground);
    assert.ok(r >= 4.5, `hero tile: ${fg} ${hero[fg]} on ${ground} is only ${r.toFixed(2)}:1`);
  }
  assert.ok(contrast('#ffffff', ground) >= 4.5);
  assert.equal(THEME_BG.light, light['--bg']);
  assert.equal(THEME_BG.dark, dark['--bg']);
});

test('the choice list covers exactly the three options the Settings card shows', () => {
  const choices: ThemeChoice[] = ['system', 'light', 'dark'];
  assert.deepEqual(choices.map((c) => cleanChoice(c)), choices);
});

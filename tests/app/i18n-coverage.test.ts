import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HI } from '../../src/core/i18n/hi.ts';
import { HINGLISH } from '../../src/core/i18n/hinglish.ts';

// Every text written as tr('...') in the code has a Hindi and a Hinglish translation. A new text without one would show in English
// in those languages (it never breaks), so this test is how the dictionaries stay complete: add the text to both.
function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(f) && !p.includes('/core/i18n')) out.push(p);
  }
  return out;
}
const unescape = (s: string) => s.replace(/\\(['"\\n])/g, (_, c: string) => (c === 'n' ? '\n' : c));

// texts that are meant to stay as they are in every language
const SAME = new Set(['Money Log']);

test('every tr() text has a Hindi and a Hinglish translation', () => {
  const missingHi: string[] = [];
  const missingHl: string[] = [];
  const re = /(?<![\w.])tr\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
  for (const f of files('src')) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) {
      const text = unescape(m[1] ?? m[2] ?? '');
      if (!/[A-Za-z]/.test(text) || SAME.has(text)) continue;
      if (!Object.hasOwn(HI, text)) missingHi.push(`${f}: ${text}`);
      if (!Object.hasOwn(HINGLISH, text)) missingHl.push(`${f}: ${text}`);
    }
  }
  assert.deepEqual(missingHi, [], `no Hindi for:\n${missingHi.join('\n')}`);
  assert.deepEqual(missingHl, [], `no Hinglish for:\n${missingHl.join('\n')}`);
});

test('no translation is left over for a text that is no longer in the code', () => {
  const used = new Set<string>();
  const re = /(?<![\w.])tr\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
  let all = '';
  for (const f of files('src')) all += readFileSync(f, 'utf8') + '\n';
  for (const m of all.matchAll(re)) used.add(unescape(m[1] ?? m[2] ?? ''));
  // texts reached through a constant (settings parts, tour steps, group kinds ...) are written in the code as plain strings
  const stale = Object.keys(HI).filter((k) => !used.has(k) && !all.includes(k.replace(/'/g, "\\'")) && !all.includes(k));
  assert.deepEqual(stale, [], `translations for texts that are gone:\n${stale.join('\n')}`);
});

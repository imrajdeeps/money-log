import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appBasepath, appRootUrl } from '../../src/core/paths.ts';
import { SETTINGS_SECTIONS, cleanSection } from '../../src/features/settings/settingsSections.ts';

test('the app folder is found from where its script was loaded, on GitHub Pages and at a domain root', () => {
  assert.equal(appBasepath('https://imrajdeeps.github.io/money-log/assets/index-AbC123.js'), '/money-log');
  assert.equal(appBasepath('https://money.example.com/assets/index-AbC123.js'), '/');
  assert.equal(appBasepath('http://localhost:5173/src/paths.ts'), '/');
  assert.equal(appBasepath('http://127.0.0.1:54380/assets/index-x.js'), '/');
  assert.equal(appBasepath('https://example.com/a/b/assets/index-x.js'), '/a/b', 'a deeper folder works too');
});

test('the app address drops the page, the query and the fragment', () => {
  const r = (url: string, base: string) => appRootUrl(url, base);
  assert.equal(r('https://imrajdeeps.github.io/money-log/settings?s=password#access_token=x', '/money-log'), 'https://imrajdeeps.github.io/money-log/');
  assert.equal(r('https://imrajdeeps.github.io/money-log/', '/money-log'), 'https://imrajdeeps.github.io/money-log/');
  assert.equal(r('http://127.0.0.1:54380/settings#join=0123456789ab', '/'), 'http://127.0.0.1:54380/');
});

test('only the known parts of Settings are accepted from the address', () => {
  for (const s of SETTINGS_SECTIONS) assert.equal(cleanSection(s.id), s.id);
  for (const v of ['', 'Account', 'password ', '__proto__', 'constructor', 'toString', null, undefined, 3, {}, ['account']]) assert.equal(cleanSection(v), undefined, String(v));
  assert.equal(new Set(SETTINGS_SECTIONS.map((s) => s.id)).size, SETTINGS_SECTIONS.length, 'no part is listed twice');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// index.html starts with a small script that tells the browser where the app's folder is, so a page such as
// /money-log/groups/abc still finds ./assets/... Run the real script from the file against made-up addresses.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const source = /<script id="base-init">([\s\S]*?)<\/script>/.exec(html)?.[1];

function baseFor(pathname: string): string {
  assert.ok(source, 'index.html has the base-init script');
  let made = '';
  const head = { firstChild: null, insertBefore: (el: { href: string }) => { made = el.href; } };
  const document = { head, createElement: () => ({ href: '' }) };
  new Function('location', 'document', source)({ pathname }, document);
  return made;
}

test('the folder the app lives in, from any page address', () => {
  assert.equal(baseFor('/'), '/');
  assert.equal(baseFor('/groups'), '/');
  assert.equal(baseFor('/groups/6f1c2d3e-aaaa-4bbb-8ccc-1234567890ab'), '/');
  assert.equal(baseFor('/settings/password'), '/');
  assert.equal(baseFor('/add'), '/');
  assert.equal(baseFor('/money-log/'), '/money-log/');
  assert.equal(baseFor('/money-log/month'), '/money-log/');
  assert.equal(baseFor('/money-log/groups/abc'), '/money-log/');
  assert.equal(baseFor('/money-log/settings/backup'), '/money-log/');
  assert.equal(baseFor('/money-log/index.html'), '/money-log/');
  assert.equal(baseFor('/people/me/app/payments'), '/people/me/app/');
});

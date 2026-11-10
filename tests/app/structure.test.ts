import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';
import { test } from 'node:test';

// The folder rules in docs/structure.md, checked on every test run so the layout cannot drift.
//   core < data < ui < features < app < routes   (a file may import from its own layer and the ones before it)
//   a feature may be used by others only through its index.ts
//   core is plain TypeScript: no React, no router
const LAYERS = ['core', 'data', 'ui', 'features', 'app', 'routes'];
const ROOT = new URL('../../', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(ROOT + dir).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(ROOT + rel).isDirectory() ? walk(rel) : [rel];
  });
}
const files = walk('src').filter((f) => /\.tsx?$/.test(f) && !f.endsWith('routeTree.gen.ts'));
const layerOf = (f: string): string => f.split('/')[1]!;
const featureOf = (f: string): string | null => (layerOf(f) === 'features' ? f.split('/')[2]! : null);

function importsOf(file: string): string[] {
  const text = readFileSync(ROOT + file, 'utf8');
  return [...text.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)].map((m) => m[1]!);
}
const resolved = (file: string, spec: string): string => posix.normalize(posix.join(posix.dirname(file), spec));

test('src holds only the known folders', () => {
  const top = readdirSync(ROOT + 'src').sort();
  assert.deepEqual(top, ['app', 'assets', 'core', 'data', 'features', 'routeTree.gen.ts', 'routes', 'styles', 'ui']);
});

test('every layer is used from its own layer and the ones before it only', () => {
  for (const f of files) {
    for (const spec of importsOf(f).filter((s) => s.startsWith('.'))) {
      const target = resolved(f, spec);
      if (!target.startsWith('src/') || target.startsWith('src/assets') || !LAYERS.includes(layerOf(target))) continue;
      assert.ok(LAYERS.indexOf(layerOf(target)) <= LAYERS.indexOf(layerOf(f)), `${f} imports ${target}: ${layerOf(f)} must not depend on ${layerOf(target)}`);
    }
  }
});

test('a feature is used from outside only through its index.ts', () => {
  for (const f of files) {
    for (const spec of importsOf(f).filter((s) => s.startsWith('.'))) {
      const target = resolved(f, spec);
      const feature = featureOf(target);
      if (!feature || feature === featureOf(f)) continue;
      assert.equal(target, `src/features/${feature}/index.ts`, `${f} reaches into the ${feature} feature: use its index.ts`);
    }
  }
});

test('every feature has an index.ts', () => {
  for (const name of readdirSync(ROOT + 'src/features')) assert.ok(existsSync(`${ROOT}src/features/${name}/index.ts`), `src/features/${name}/index.ts`);
});

test('core is plain TypeScript', () => {
  for (const f of files.filter((x) => layerOf(x) === 'core')) {
    for (const spec of importsOf(f)) assert.ok(!/^(react|react-dom|@tanstack\/)/.test(spec), `${f} imports ${spec}`);
  }
});

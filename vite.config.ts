import { defineConfig, loadEnv, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Relative paths everywhere, so the same build works at https://name.github.io/repo/ and at a custom domain root.
const BASE = './';

function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, `${prefix}${name}/`));
    else out.push(`${prefix}${name}`);
  }
  return out;
}

// Content-Security-Policy as a <meta> tag (GitHub Pages cannot send headers). The page may talk only to itself
// and to the one Supabase origin it was built for. Production builds only: the dev server needs inline scripts.
function csp(supabaseUrl: string): Plugin {
  let origin = '';
  try { origin = supabaseUrl ? new URL(supabaseUrl).origin : ''; } catch { /* leave empty: local-only build */ }
  const policy = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'", // the bundled Outfit font files
    "img-src 'self' data: blob:", // blob: = receipt photos shown from this phone's own copy; nothing is loaded from elsewhere
    `connect-src 'self'${origin ? ` ${origin}` : ''}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'money-log-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return { html, tags: [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }] };
    },
  };
}

// A small hand-written service worker instead of a plugin: it caches this app's own files (hashed file names, so
// cache-first is safe) and nothing else. Requests to other origins, such as Supabase, never touch the cache.
function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'money-log-sw',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle(_options, bundle) {
      const files = new Set<string>(['./', './index.html']);
      for (const f of Object.keys(bundle)) files.add(`./${f}`);
      const publicFiles = publicDir ? listFiles(publicDir) : [];
      for (const f of publicFiles) files.add(`./${f}`);
      files.delete('./sw.js');
      const list = [...files].sort();
      // The cache id covers every file's content (index.html and the CSP in it included), not just file names.
      const hash = createHash('sha256');
      for (const f of list) hash.update(f);
      for (const item of Object.values(bundle)) hash.update(item.type === 'asset' ? String(item.source) : item.code);
      for (const f of publicFiles) hash.update(readFileSync(join(publicDir, f)));
      const id = hash.digest('hex').slice(0, 12);
      const source = `// Generated at build time. Cache id changes whenever any app file changes.
const CACHE = 'money-log-${id}';
const FILES = ${JSON.stringify(list)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(FILES.map((f) =>
        // cache: 'reload' skips the browser's own HTTP cache (GitHub Pages lets it keep files for 10 minutes), so a new
        // version is never put together from a mix of old and new files. Any failure aborts the install and the
        // previous version keeps running.
        fetch(new Request(f, { cache: 'reload' })).then((res) => {
          if (!res.ok) throw new Error(f + ' ' + res.status);
          return c.put(f, res);
        }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('money-log-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only this app's own files. Supabase and every other origin go straight to the network, never cached.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html').then((page) => page || fetch(req));
      return fetch(req);
    }),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: BASE,
    plugins: [csp(env.VITE_SUPABASE_URL ?? ''), serviceWorker()],
    build: { target: 'es2022', modulePreload: { polyfill: false } },
    oxc: { jsx: { runtime: 'automatic' } },
  };
});

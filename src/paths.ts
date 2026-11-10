// Where the app lives on its host, found from where its own script was loaded. The same build runs at
// https://name.github.io/money-log/ (a folder) and at a custom domain (the root), so the folder is not written down.
// The script sits one folder below the app (assets/index-xxxx.js; src/paths.ts in development).
export function appBasepath(scriptUrl: string): string {
  const folder = new URL('../', scriptUrl).pathname.replace(/\/+$/, '');
  return folder === '' ? '/' : folder;
}

// Where this running copy of the app lives. Only meaningful in the browser bundle (and in development).
export const BASEPATH = appBasepath(import.meta.url);

// The app's own address with no page and no fragment, for links that must open the app itself: the password reset
// email and the invite to a group.
export function appRootUrl(pageUrl: string, basepath: string): string {
  const u = new URL(pageUrl);
  u.pathname = basepath === '/' ? '/' : `${basepath}/`;
  u.search = '';
  u.hash = '';
  return u.toString();
}

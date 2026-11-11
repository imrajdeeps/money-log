// Runs before the page is drawn, so the first frame already has the right theme (no white flash on a dark phone).
// Same rule as src/theme.ts: a stored "light" or "dark" wins, anything else follows the phone.
(function () {
  var choice = 'system';
  try { var v = localStorage.getItem('money-log.theme'); if (v === 'light' || v === 'dark') choice = v; } catch (e) { /* no storage: follow the phone */ }
  var dark = choice === 'dark' || (choice === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0c110e' : '#f5f6f3');
})();

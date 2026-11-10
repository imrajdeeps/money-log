// Paste into the browser console (or run through a browser tool) on a running Money Log: it records the computed styles of
// every visible element on every page, in light and dark, and either keeps them as the baseline or compares them with it.
//   await window.__snap('save', 'name')      store this look as the baseline called `name`
//   await window.__snap('compare', 'name')   report what differs from the baseline (an empty list means the same look)
// Baselines live in localStorage of the page's origin. Run it at one width at a time (the width is part of the name).
(() => {
  const PROPS = ['display', 'position', 'width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'borderTopWidth',
    'borderTopColor', 'borderTopStyle', 'borderBottomWidth', 'borderLeftWidth', 'borderTopLeftRadius', 'boxShadow', 'textAlign', 'flexDirection', 'flexWrap',
    'alignItems', 'justifyContent', 'gap', 'opacity', 'textDecorationLine', 'overflow', 'cursor', 'whiteSpace', 'minHeight', 'maxWidth', 'zIndex', 'top', 'transform'];
  const ROUTES = ['/', '/month', '/plan', '/goals', '/payments', '/add', '/export', '/settings', '/settings/account', '/settings/recurring', '/settings/appearance',
    '/settings/plan', '/settings/receipts', '/settings/lock', '/settings/backup', '/settings/erase', '/settings/about', '/groups'];
  // more addresses to visit (for example the pages of groups that only exist in one browser): window.__snapExtra = ['/groups/<id>']
  const routes = () => [...ROUTES, ...(window.__snapExtra ?? [])];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const go = async (to) => { history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')); await wait(450); };

  function capture(styles) {
    // animations and transitions would be caught half way: cancel them (the animations only fill backwards, so the plain style shows)
    document.getAnimations().forEach((a) => a.cancel());
    const out = {};
    const walk = (el, path) => {
      const cs = getComputedStyle(el);
      // an element with display: contents has no box of its own, but its children do
      if (cs.display === 'contents') { [...el.children].forEach((c, i) => walk(c, `${path}/${i}`)); return; }
      if (!el.getClientRects().length) return;
      // long decimals (a meter's scaleX depends on how far into the month it is) are rounded, so the clock does not show as a change
      const vals = PROPS.map((p) => cs[p]);
      // a border of width 0 has no style or colour to see; a pill's radius is "999px" or "infinity", which draw the same
      if (cs.borderTopWidth === '0px') { vals[PROPS.indexOf('borderTopStyle')] = 'none'; vals[PROPS.indexOf('borderTopColor')] = ''; }
      const radius = PROPS.indexOf('borderTopLeftRadius');
      if (parseFloat(vals[radius]) > 5000) vals[radius] = '999px';
      const s = vals.join('|').replace(/-?\d+\.\d{3,}/g, (m) => (+m).toFixed(2));
      let id = styles.indexOf(s);
      if (id < 0) { id = styles.length; styles.push(s); }
      // keyed by position, tag and label only (not by class name: class names are what a conversion changes)
      out[`${path}<${el.tagName}${el.getAttribute('aria-label') ? ':' + el.getAttribute('aria-label').slice(0, 30) : ''}>`] = id;
      [...el.children].forEach((c, i) => walk(c, `${path}/${i}`));
    };
    walk(document.querySelector('#root'), '');
    return out;
  }

  // pages that need a click to appear (dialogs): `await window.__snap('save', 'name', 'scenes')` records only these
  const clickText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text))?.click();
  const SCENES = {
    'budgets dialog': async () => { await go('/month'); clickText('button', 'Categories and budgets'); await wait(450); },
    'edit dialog': async () => { await go('/payments'); document.querySelector('main ul button')?.click(); await wait(450); },
    'add category': async () => {
      await go('/add');
      const sel = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.textContent.includes('New category')));
      const opt = sel && [...sel.options].find((o) => o.textContent.includes('New category'));
      if (sel && opt) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })); }
      await wait(450);
    },
  };
  const closeDialogs = () => document.querySelectorAll('dialog[open]').forEach((d) => d.close());

  async function all(only) {
    const styles = [];
    const pages = {};
    const startTheme = document.documentElement.dataset.theme;
    const startPath = location.pathname;
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      if (only !== 'scenes') for (const route of routes()) { await go(route); window.scrollTo(0, 0); pages[`${theme} ${route}`] = capture(styles); }
      for (const [name, open] of Object.entries(SCENES)) {
        if (only !== 'scenes' && !window.__snapScenes) break; // the full run records scenes only when asked to
        await open(); pages[`${theme} scene ${name}`] = capture(styles); closeDialogs();
      }
    }
    document.documentElement.dataset.theme = startTheme;
    await go(startPath);
    return { styles, pages };
  }

  window.__snap = async (mode, name, only) => {
    const now = await all(only);
    const key = `snap:${name}`;
    if (mode === 'save') { localStorage.setItem(key, JSON.stringify(now)); return { saved: name, pages: Object.keys(now.pages).length, elements: Object.values(now.pages).reduce((n, p) => n + Object.keys(p).length, 0), styles: now.styles.length }; }
    const base = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!base) return { error: `no baseline called ${name}` };
    const diffs = [];
    const names = PROPS;
    for (const [page, els] of Object.entries(now.pages)) {
      const was = base.pages[page] ?? {};
      for (const k of new Set([...Object.keys(els), ...Object.keys(was)])) {
        const a = was[k] === undefined ? null : base.styles[was[k]];
        const b = els[k] === undefined ? null : now.styles[els[k]];
        if (a === b) continue;
        if (a === null || b === null) { diffs.push({ page, k, what: a === null ? 'appeared' : 'disappeared', props: [] }); continue; }
        const x = a.split('|'); const y = b.split('|');
        diffs.push({ page, k, what: '', props: names.map((p, i) => [p, x[i], y[i]]).filter(([, u, v]) => u !== v) });
      }
    }
    // A change of height or width usually just ripples down from a change elsewhere: group the real changes by what changed
    const RIPPLE = new Set(['height', 'width', 'top']);
    const CONTROLS = new Set(['<BUTTON>', '<INPUT>', '<SELECT>', '<TEXTAREA>', '<LABEL>', '<A>', '<SPAN>', '<B>', '<SMALL>']);
    const groups = new Map();
    for (const d of diffs) {
      const tag = d.k.replace(/^.*</, '<').replace(/>.*$/, '>');
      // a control that changes size on its own is a real change, a container that does is usually a ripple
      const real = d.props.filter(([p]) => !RIPPLE.has(p) || (CONTROLS.has(tag) && p !== 'top'));
      if (!real.length && d.what === '') continue;
      const sig = d.what || `${tag} ` + real.map(([p, u, v]) => `${p} ${u} -> ${v}`).join('; ');
      const g = groups.get(sig) ?? { count: 0, example: `${d.page} ${d.k}` };
      g.count++; groups.set(sig, g);
    }
    const list = [...groups].map(([sig, g]) => `${g.count}x ${sig.slice(0, 260)}  @ ${g.example.slice(0, 90)}`);
    return { compared: name, differences: diffs.length, changes: list.length, groups: list.slice(0, 40) };
  };
  return 'snapshot tool ready';
})();

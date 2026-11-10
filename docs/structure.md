# Project layout

Everything the app does lives under `src/`, in layers. A layer may use its own files and the layers before it, never the
ones after. `tests/app/structure.test.ts` checks these rules on every test run.

```
src/
  core/       shared plain TypeScript: the data models and rules (entries, groups, plan blocks, categories,
              recurring, receipts, history, kinds, couple), money and date helpers, paths. No React, no storage.
  data/       keeping and syncing: the on-phone store, cloud sync, backup, sign-in helpers, PIN lock, the app state
              (context.tsx) that every screen reads.
  ui/         small pieces several features share: icons, tiles (Bento), the budget line, the category picker,
              the sync pill, file helpers.
  features/   one folder per thing the app does. Screens, their components and logic only that feature uses.
    home/  payments/  recurring/  month/  plan/  goals/  export/  groups/  settings/
      index.ts    the only file other code may import from this folder
  app/        starts the app: main.tsx, the page frame (App.tsx), the router.
  routes/     one small file per address (TanStack Router reads this folder). routeTree.gen.ts is generated.
  styles/     tokens.css (the colours for the light and dark themes, kept for good), the Tailwind theme in index.css, and
              the old hand-written CSS, one file per area, shrinking as features move to Tailwind classes (see Styling).
  assets/     fonts.
tests/        mirrors src/: core/, data/, app/, features/<name>/. support/ holds the stand-in Supabase server and fixtures.
```

## Rules

1. **Direction:** `core` < `data` < `ui` < `features` < `app` < `routes`. A file may import from its own layer and the
   layers to its left.
2. **Features use each other only through `index.ts`.** `payments` exports what `home` and `groups` need; nothing else in
   `payments` is reachable from outside.
3. **`core` is plain TypeScript.** No React, no router. That is why the Node test runner can load it without a browser.
4. **Imports are relative** (`../../core/logic.ts`) and keep their `.ts` / `.tsx` extension.

## Styling (Tailwind, from version 1.11)

Components are styled with Tailwind utility classes. The colours live in `src/styles/tokens.css` as CSS variables, one set for
light and one for dark (`<html data-theme>`); `src/styles/index.css` gives them Tailwind names (`bg-card`, `text-muted`,
`border-line`, `text-good`, `bg-primary` ...) with `@theme inline`, so the two themes work with no `dark:` classes. Use those
names, not Tailwind's default palette (it is switched off).

During the move there are three CSS layers, lowest first: Tailwind's theme, `legacy` (the old CSS files) and utilities. A utility
therefore wins over a legacy rule where both apply, and a feature is converted by replacing its class names with utilities and
deleting its rules from the legacy file. There is no Tailwind preflight yet: the legacy base still does the resetting; it goes
last, when the last legacy file is gone. Plain CSS still belongs in `tokens.css` and in `index.css` (keyframes, `@font-face`).

### Motion

Keyframes and `animate-*` utilities are defined in `index.css` (`--animate-page-in`, `--animate-rise`, `--animate-toast`); use the
utility on a component (`animate-page-in`, `animate-rise`). Animations fill only backwards, so the finished state is the normal
style and hover and press effects keep working. Dialogs, meters and button presses are in the small `base` layer at the end of
`index.css` because they are elements, not components. The `prefers-reduced-motion` rule in `responsive.css` turns every
animation and transition into nothing.

### Checking the look after a CSS change

There are no visual tests. `tests/support/style-snapshot.js` records the computed style of every visible element on every
page (light and dark) and compares it later: serve a build (`npm run e2e:build`, copy the script to `dist-e2e/snap.js`,
`npm run e2e:serve`), load the script in the page, run `await window.__snap('save', 'name')` at phone width and at desktop width,
make the change, rebuild, and run `await window.__snap('compare', 'name')`. An empty list means the look did not change.

## Adding things

- **A feature:** make `src/features/<name>/` with its screen, add `index.ts` exporting the screen, add one file in
  `src/routes/` for its address, and draw it in `src/app/App.tsx`. Tests go in `tests/features/<name>/`.
- **A shared rule or model** that sync or backup also needs: `core/`. If only one screen needs it, keep it in that feature.
- **A piece two features need:** `ui/`. If it needs the app state, it can read it from `data/context.tsx`.
- **Styles:** use Tailwind classes in the component. Only a new colour needs CSS: add it to both themes in `tokens.css` and give
  it a name in the `@theme inline` block of `index.css`.
- **A new address:** a file in `src/routes/`; `npm run dev` or `npm run build` regenerates `src/routeTree.gen.ts`.

## Big files, and how they are split

- `features/settings/SettingsScreen.tsx` is only the list; each part is a file in `features/settings/parts/` (one per
  `/settings/<part>` page, plus `shared.ts` for the version number and two small helpers).
- `features/groups/GroupsScreen.tsx` is the list; `GroupDetail.tsx`, `JoinCard.tsx`, `CreateCard.tsx` and `useAction.ts`
  hold the rest.
- `data/sync.ts` is the sync engine: one closure over the store, the session and the state, so it stays in one file. What
  does not touch that state is beside it: `syncTypes.ts` (state, error, options), `syncBlocks.ts` (the table of blocks) and
  `syncRows.ts` (the shape of each row sent). `sync.ts` still exports everything it always did.
- `data/context.tsx` is the provider (one set of callbacks sharing refs and state); the `AppApi` interface it offers is in
  `data/appApi.ts`.

A file that is one closure should be split only when a seam appears that does not need that closure's variables.

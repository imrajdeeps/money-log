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
    home/  payments/  recurring/  month/  plan/  export/  groups/  settings/
      index.ts    the only file other code may import from this folder
  app/        starts the app: main.tsx, the page frame (App.tsx), the router.
  routes/     one small file per address (TanStack Router reads this folder). routeTree.gen.ts is generated.
  styles/     the stylesheet, one file per area, imported in order by index.css (later files may override).
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

## Adding things

- **A feature:** make `src/features/<name>/` with its screen, add `index.ts` exporting the screen, add one file in
  `src/routes/` for its address, and draw it in `src/app/App.tsx`. Tests go in `tests/features/<name>/`.
- **A shared rule or model** that sync or backup also needs: `core/`. If only one screen needs it, keep it in that feature.
- **A piece two features need:** `ui/`. If it needs the app state, it can read it from `data/context.tsx`.
- **Styles:** add a `.css` file in `src/styles/` and one `@import` line in `src/styles/index.css`, in the position where its
  rules should win or lose against the others.
- **A new address:** a file in `src/routes/`; `npm run dev` or `npm run build` regenerates `src/routeTree.gen.ts`.

## Later, if a file grows too big

`data/sync.ts` (about 800 lines), `data/context.tsx` (about 660), `features/settings/SettingsScreen.tsx` (about 580) and
`features/groups/GroupsScreen.tsx` (about 380) are the large ones. Split them along the seams they already have (for
Settings, one file per part, matching `/settings/<part>`), as their own step, never mixed with moving files.

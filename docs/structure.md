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
    home/  payments/  recurring/  month/  plan/  goals/  export/  groups/  settings/  tour/  analytics/
      index.ts    the only file other code may import from this folder
  app/        starts the app: main.tsx, the page frame (App.tsx), the router.
  routes/     one small file per address (TanStack Router reads this folder). routeTree.gen.ts is generated.
  styles/     tokens.css (the colours for the light and dark themes) and index.css (the Tailwind theme, the plain element
              rules, and the two things a class says badly: see Styling).
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

## Styling (Tailwind)

Everything is styled with Tailwind utility classes in the components. The colours live in `src/styles/tokens.css` as CSS variables,
one set for light and one for dark (`<html data-theme>`); `src/styles/index.css` gives them Tailwind names (`bg-card`, `text-muted`,
`border-line`, `text-good`, `bg-primary` ...) with `@theme inline`, so the two themes work with no `dark:` classes. Use those
names, not Tailwind's default palette (it is switched off). Sizes are written in pixels (`text-[13px]`): the named sizes
(`text-sm`) also set a line height.

What every screen shares (buttons, cards, lists, rows, fields, messages, meters, the photo and split pieces) is in
`src/ui/styles.ts` as functions and constants: `btn('ghost', 'small')`, `card('notice')`, `list()`, `msg('bad')`, `field`,
`chips`... **Each variant is a complete class string, never "base plus override":** two utilities for the same property are
decided by the order of the generated stylesheet, not the order in the string. The page frame's classes are in
`app/shellStyles.ts`, the Overview tiles' in `ui/tileStyles.ts`, the tile grid in `ui/Bento.tsx` (a container query: `@container`,
`@min-[600px]:`). A rule that depends on a neighbour is written on the parent (`[&>li+li]:border-t`) or the card (`[ul+&]:mt-3.5`).

`index.css` keeps only what a class says badly: the `@theme` (colour names, animations), a `base` layer of plain element rules
(headings, form fields, dialogs: there is no Tailwind preflight), `.hero` (the one tile that re-points the colour tokens, so its text,
meters and chart recolour themselves) and `.pace` (the chart's SVG strokes).

### Motion

Keyframes and `animate-*` utilities are defined in `index.css` (`--animate-page-in`, `--animate-rise`, `--animate-toast`); use the
utility on a component (`animate-page-in`, `animate-rise`). Animations fill only backwards, so the finished state is the normal
style and hover and press effects keep working. Dialogs open from the `base` layer of
`index.css`; meters, button presses and tiles carry their own motion classes. The `prefers-reduced-motion` rule at the end of `index.css` turns every
animation and transition into nothing.

### Checking the look after a CSS change

There are no visual tests. `tests/support/style-snapshot.js` records the computed style of every visible element on every
page (light and dark) and compares it later. Serve a build (`npm run e2e:build`, copy the script to `dist-e2e/snap.js`,
`npm run e2e:serve`), load the script in the page, and run `await window.__snap('save', 'name')` at phone, tablet and desktop width
(reload the page after resizing). Make the change, rebuild, and run `await window.__snap('compare', 'name')`: it lists what changed,
grouped (a changed height that only ripples down from another change is left out). An empty list means the look did not change.
`window.__snapExtra = ['/groups/<id>']` adds pages that exist only in one browser; a third argument, `'scenes'`, records the
dialogs that need a click (budgets, an expense). Animations are cancelled while recording. Record the baseline from the build
**before** the change: keep that build's folder so it can be served again.

## Insights

`core/analytics.ts` holds the arithmetic (monthly totals, category trends, weekday spending, biggest payments, the month-end projection, group shares)
as pure functions over the budget entries (`budgetEntries`: a shared expense at the account's own share); `features/analytics/` draws it, with
small hand-written charts (`charts.tsx`: bars and a sparkline; no chart library). A new figure goes in `core/analytics.ts` with a test first.

## Language

Every visible text is written in English in the code as `tr('English text', value, ...)` (`core/i18n.ts`), and the English text is the
key: Hindi (Devanagari) and Hinglish (Hindi in Roman letters, as on WhatsApp) have dictionaries from that text to their own
(`core/i18n/hi.ts`, `hinglish.ts`), and a text with no entry shows in English, so nothing breaks. `{0}`, `{1}` are filled with the values
after the text; a translation may reorder them or leave one out. The choice is kept on the phone (`data/lang.ts`) and read before the
first screen is drawn; changing it draws the whole app again from the top (`app/App.tsx` keys the screen on the language), which is why
texts are looked up *while drawing*: a text kept in a constant is translated where it is shown (`tr(step.title)`), not where it is defined.
Dates follow the language (`core/format.ts`). **When you add visible text: write it with `tr()` and add it to both dictionaries**;
`tests/app/i18n-coverage.test.ts` fails otherwise. Not translated on purpose: the spreadsheet-import error messages (they quote exact
header names), what people typed (category names, notes, group names), and the names of payment methods.

## The guided tour

`core/tour.ts` holds the steps (`FIRST_STEPS`: the whole app; `NEWS_STEPS`: one step per new thing, each with the version that brought
it) and who gets which (`pickTour`). `data/tour.ts` keeps the last version whose tour was finished or skipped (on the phone only).
`features/tour/TourHost.tsx` draws it: a spotlight on the part named by a step's `target` (a `data-tour="..."` attribute somewhere in the
page; the first one that is showing, so a phone's bottom bar and a wide screen's header can share a name) and a card beside it.
**When you add a feature people will notice, add a news step with the new version in `NEWS_STEPS`**, put `data-tour` on the part to
point at, and bump `core/version.ts` and `package.json` together.

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

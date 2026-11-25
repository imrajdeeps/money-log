# PRD: code health (1.35)

**Status:** built in 1.35 (2026-11-25); approved by the owner on 2026-11-25 ("continue with the next release") against the standing request of 2026-11-11 ("fix all the sonarqube warning and bugs, also remember this for future code"), the one open code item on `docs/todo.md` that needs nothing from the owner. No change in what the app does, no SQL, no new package.

## The problem
SonarLint's "cognitive complexity" rule (S3776, limit 15) flags functions that are hard to read and easy to break. 1.23.1 fixed everything the owner's SonarLint panel listed at the time, but the panel shows only open files, so what was left was an estimate. It is now measured, and kept fixed.

## What was measured
A scorer in `tests/support/complexity.ts` reads `src/` with the parser that ships with Vite (`rolldown/utils`; Vite depends on `rolldown`, so nothing is added) and counts the way SonarJS does today. Its rules were first written from SonarSource's paper, which is older than SonarJS's current rule, and that was wrong in three ways: it added the functions written inside a function into the outer one, it counted `||` and `??`, and it counted `&&` inside JSX. On that stricter count 65 functions were over 15. An independent reviewer compared it with SonarJS's rule source (S3776 and its JSX helper, read 2026-11-25); it now scores **each function on its own** (nesting starts again inside each), lets `||`, `??` and a plain `&&` inside JSX go free, and looks through parentheses. On that count **6 functions** were over 15: `HomeScreen` 113, `BudgetLine` 29, `QuickLog`'s save 28, `pullKeyset` 20, `AccountCard` 20 and `pushDirty` 19. Those are the same names as on the owner's earlier SonarLint list (`docs/todo.md`), which is the best evidence that it agrees with the panel.

## What 1.35 does
1. **A check that keeps it fixed** (`tests/app/complexity.test.ts`, with a committed list of known offenders, now empty). It fails when a function is over 15 and not on the list, when a listed one gets worse, and when a listed one no longer needs to be, so the list only ever shrinks. The scorer is itself tested against SonarSource's worked examples and the current rules. `npm run complexity` prints the offenders (`-- --write` updates the list). It runs in `npm test`, so in CI for every pull request. This is "remember this for future code" made automatic instead of a note.
2. **The six functions** split into small named pieces: `HomeScreen` into one component per tile, `BudgetLine` into plain functions for its words, colour and fill, `QuickLog`'s save into three plain checks, `AccountCard` into a form hook and two views, `pushDirty` and `pullKeyset` into a chunk sender and a page reader.
3. **Also split, because the stricter first count flagged them:** 17 plain functions in `core/` and `data/` and 19 smaller screens. They are not over the limit by SonarLint's count, but they are smaller and tested now; nothing in them changes what the app does.

## Not in this plan
- Changing what anything does. A bug found on the way is written on the todo list, not mixed into a split.
- New packages. If the owner wants SonarLint or ESLint rules enforced in CI (`eslint-plugin-sonarjs`), that is a new dependency and the owner's call; the check above covers the one rule asked for.
- Other SonarQube rules. The owner's panel is the source for those: after 1.35 the owner is asked to refresh it and send a screenshot, to see whether it agrees with the scorer. The version of SonarJS inside the editor may be older or newer than the one read here, and the panel is the final word.

## Risks
- **A split changes behaviour.** Mitigation: small steps, the full test suite after each, no existing test edited, two independent reviews of the diff (the first found every function up to the last six equivalent, with one low-level timing difference that was put back), and, for the screens, a comparison of the rendered HTML of 19 pages between the build before and the build after (identical apart from clock-dependent text) plus the interactions checked in the browser.
- **The scorer differs a little from SonarLint** in a rule edge, or the editor runs another SonarJS version. The list can be adjusted.
- **The check depends on `rolldown/utils`**, a part of Vite not declared in `package.json`. If Vite changes its bundler the check fails loudly in CI and is repaired or its parser swapped; nothing in the app depends on it.

## Checks
- The existing tests pass unchanged after every split; new tests for the pieces that had none (`personPowers`, `budgetMeter`, `monthStatus`, `safeLine`, the scorer).
- `npm run check`. The check itself: it passes today, fails for a new offender (tried on a deliberately complex function), and fails when a function is cleaned but left on the list.
- Browser checks for every changed screen at phone width; the page-by-page HTML comparison; an independent review of the diff.

# PRD: code health, in steps (1.35 onward)

**Status:** approved by the owner on 2026-11-25 ("continue with the next release") against the standing request of 2026-11-11 ("fix all the sonarqube warning and bugs, also remember this for future code"), the one open code item on `docs/todo.md` that needs nothing from the owner. No change in what the app does, no SQL, no new package.

## The problem
SonarLint's "cognitive complexity" rule (S3776, limit 15) flags functions that are hard to read and easy to break. 1.23.1 fixed everything the owner's SonarLint panel listed at the time, but the panel shows only open files, so the rest was an estimate. It is now measured.

## What was measured (2026-11-25)
A scratch scorer that follows SonarSource's published rules (the same ones SonarJS applies) was run over `src/`, using the parser that ships with Vite (`rolldown/utils`; Vite depends on `rolldown`, so nothing is added). It agrees with the earlier estimate on the functions that estimate named (`cleanDue` 18, `cleanSent` 17, `cleanMine` 18, `computeShares` 18, `parseAuthHash` 18). **54 functions are over 15:**
- **14 plain functions in `core/` and `data/`**, scoring 16 to 23 (`classifyDue` 23, `groupSummary` 19, `cleanDue`, `cleanMine`, `computeShares`, `parseAuthHash` 18, `cleanSent`, `summarizeMonth` 17, `migratePlan`, `cleanPlan`, `cleanReceipt`, `checkWorth`, `localPref`, `authMessage` 16). The tests cover them.
- **5 closures that hold a lot of shared state:** `createSync` 387, `AppProvider` 282, `idbStore` 55, `memoryStore` 46, `openStore` 16.
- **35 screens and cards** (React components), from `HomeScreen` 104 down to 16; 17 of them score 24 or less.

## The plan, one step per release
**1.35 (this one)**
1. **A check that keeps it fixed** (`tests/app/complexity.test.ts`, with a committed list of today's known offenders and their scores). It fails when a function over 15 is not on the list, when a listed one gets worse, and when a listed one no longer needs to be (so the list only ever shrinks). This is "remember this for future code" made automatic instead of a note. It runs in `npm test`, so in CI for every pull request.
2. **The 14 plain functions** brought to 15 or less by splitting them into small named pieces. Behaviour is unchanged: the existing tests stay as they are (and are not edited to pass), and a test is added where a path had none.
3. **The 17 smaller screens and cards** (24 or less), split into smaller components and hooks. Checked in the browser at phone width, dark and light, English and Hindi, and an independent review reads the diff.

**Later, each its own release:** the middle of the screens (25 to 55), the two stores, then `createSync` and `AppProvider` along seams that do not need their shared state (the idea already on the todo list), then the biggest screens (`QuickLog`, `HomeScreen`, `GroupDetail`, `Shell`).

## Not in this plan
- Changing what anything does. A bug found on the way is written on the todo list, not mixed into a split.
- New packages. If the owner wants SonarLint or ESLint rules enforced in CI (`eslint-plugin-sonarjs`), that is a new dependency and the owner's call; the check above covers the one rule asked for.
- Other SonarQube rules. The owner's panel is the source for those: after 1.35 the owner is asked to refresh it and send a screenshot, to see whether it agrees with the scorer.

## Risks
- **A split changes behaviour.** Mitigation: small steps, the full test suite after each function, the tests untouched, browser checks for screens, an independent review of the diff before the owner is asked to merge.
- **The scorer differs a little from SonarLint** (a rule edge such as how a JSX expression or a nested callback counts). It follows the published rules and matched the five known scores; the owner's refreshed panel is the final word, and the list can be adjusted.
- **The check depends on `rolldown/utils`**, a part of Vite not declared in `package.json`. If Vite changes its bundler the check fails loudly in CI and is repaired or its parser swapped; nothing in the app depends on it.

## Checks
- The existing tests pass unchanged after every split; new tests for any path that had none.
- `npm run check`. The complexity check itself: it passes today, fails for a new offender (tried on a deliberately complex function), and fails when a function is cleaned but left on the list.
- Browser checks for each screen split, and an independent review of the whole diff.

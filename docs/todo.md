# TODO

What is planned, in the order it will be picked up. **How it works:** anything the owner asks for while other work is running is written here first, in the owner's words. The running work is finished (and its pull request opened), then the next item is picked from this list.

## Version 1.9 (built; `version/1.9` goes into main with pull request #26)
- [x] Sticky top bar (#23)
- [x] Database foundation: trip dates, closing a trip, the flatmates' usual split (#24)
- [x] Trip screens: dates, summary, close and reopen (#25)
- [x] Swipe a due-list item left to delete it, with a trash icon (#27)
- [x] Flatmates usual split card, Family "This month", the Couple tile on the Overview, and the release number 1.9.0 (the fifth pull request of 1.9)

## Version 1.10: goals and a plan (the question round is done; the PRD is `docs/prd-goals.md`, waiting for the owner's go-ahead)
- [ ] **Goals and a plan** (step 1 of 5, the data, is built; steps 2 to 5 follow the PRD) — short-term and long-term goals made in the app (name, target amount, target date; short or long by the date), progress from manual top-ups and from payments in a linked category, and a generated plan: the monthly amount for each goal and whether the Saving budget covers it. Five steps, see the PRD.

## Version 1.11 (decided; was 1.10 until goals took that number)
- [ ] **Tailwind CSS** instead of the hand-written CSS (the owner's words: "add some animations, remove the css use tailwind css") (utility classes in the components, the CSS files deleted; colours and fonts in Tailwind's theme, light and dark kept). Approved to install `tailwindcss` 4.3.5 and `@tailwindcss/vite` 4.3.5 when it starts.
- [ ] **Animations** — page and tile transitions, list changes, swipe and sheet motion; always respecting reduced motion.

## Design, to go with Tailwind and animations in 1.11 (asked for while 1.9 was running)
- [ ] **Better icons for the whole app** — the owner's words: "the app icons in not looking good, if possible can se enhance the icons of the complete app". Two things to look at when this is picked up: the app icon on the home screen and in the browser tab (`public/icons`), and the small icons inside the app (`src/ui/Icon.tsx`). Ask which one the owner means, or do both.
- [ ] **A splash screen when the app opens** — "also add a splash sceen in the app when open". On a phone the installed app can show one while it starts (the manifest's background colour and icon, plus an in-app screen with the logo until the data is loaded; today it shows a plain loading placeholder).

## Last (the owner will pick this up at the end)
- [ ] **Analytics** — charts and insights inside the app (spending over time, category trends, month against month, goal progress). Needs a question round on which figures matter. In-app only: no tracking and nothing sent anywhere.

## Ideas that came up and are not scheduled
- A "repeat every month" tickbox in Add expense (makes a recurring payment).
- Undo after deleting or editing a payment.
- Category trends, home-screen shortcuts.
- Bank or UPI statement (CSV) import, and reading messages automatically (needs a native Android app).
- Calendar: when an event is deleted in the app, also send a cancel for it in the calendar file, so the phone's calendar removes it when the file is opened again.
- Splitting `data/sync.ts` and `data/context.tsx` further, only along a seam that does not need their shared state.

# TODO

What is planned, in the order it will be picked up. The owner says what is next; this list is where ideas wait.

## Version 1.9 (in progress, `version/1.9`)
- [x] Sticky top bar (#23)
- [x] Database foundation: trip dates, closing a trip, the flatmates' usual split (#24)
- [x] Trip screens: dates, summary, close and reopen (#25)
- [ ] Delete a calendar event (swipe a row left on a phone, tap Delete) — built, in review
- [ ] Flatmates: the usual split editor; Add expense starts from it
- [ ] Family: a "This month" summary; Couple: one Overview tile
- [ ] Release 1.9.0 (package.json and Settings, About)

## Version 1.10: goals and a plan (the question round is done; the PRD is `docs/prd-goals.md`, waiting for the owner's go-ahead)
- [ ] **Goals and a plan** — short-term and long-term goals made in the app (name, target amount, target date; short or long by the date), progress from manual top-ups and from payments in a linked category, and a generated plan: the monthly amount for each goal and whether the Saving budget covers it. Five steps, see the PRD.

## Version 1.11 (decided; was 1.10 until goals took that number)
- [ ] **Tailwind CSS** instead of the hand-written CSS (utility classes in the components, the CSS files deleted; colours and fonts in Tailwind's theme, light and dark kept). Approved to install `tailwindcss` 4.3.5 and `@tailwindcss/vite` 4.3.5 when it starts.
- [ ] **Animations** — page and tile transitions, list changes, swipe and sheet motion; always respecting reduced motion.

## Last (the owner will pick this up at the end)
- [ ] **Analytics** — charts and insights inside the app (spending over time, category trends, month against month, goal progress). Needs a question round on which figures matter. In-app only: no tracking and nothing sent anywhere.

## Ideas that came up and are not scheduled
- A "repeat every month" tickbox in Add expense (makes a recurring payment).
- Undo after deleting or editing a payment.
- Category trends, home-screen shortcuts.
- Bank or UPI statement (CSV) import, and reading messages automatically (needs a native Android app).
- Calendar: when an event is deleted in the app, also send a cancel for it in the calendar file, so the phone's calendar removes it when the file is opened again.
- Splitting `data/sync.ts` and `data/context.tsx` further, only along a seam that does not need their shared state.

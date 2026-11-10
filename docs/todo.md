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

## Next, needs a question round and a short PRD first
- [ ] **Goals and a plan** — long-term and short-term goals made in the app (what, how much, by when, progress), and a generated plan: what to set aside each month to reach them given the budgets. Today the "Net worth and goals" figures are only imported from the spreadsheet.

## Version 1.10 (decided)
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

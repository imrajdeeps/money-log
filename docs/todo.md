# TODO

What is planned, in the order it will be picked up. **How it works:** anything the owner asks for while other work is running is written here first, in the owner's words. The running work is finished (and its pull request opened), then the next item is picked from this list.

## Version 1.9 (done: on main as 1.9.0)
- [x] Sticky top bar (#23)
- [x] Database foundation: trip dates, closing a trip, the flatmates' usual split (#24)
- [x] Trip screens: dates, summary, close and reopen (#25)
- [x] Swipe a due-list item left to delete it, with a trash icon (#27)
- [x] Flatmates usual split card, Family "This month", the Couple tile on the Overview, and the release number 1.9.0 (the fifth pull request of 1.9)

## Version 1.10: goals and a plan (done: on main as 1.10.0)
- [x] **Goals and a plan**: the data, the Goals page, top-ups, the plan, and the Overview tile (see `docs/prd-goals.md`).

## Version 1.11: Tailwind setup, animations, icons, splash screen (done: on main as 1.11.0)
- [x] Tailwind CSS set up and proven on the Goals screens (#36)
- [x] **Animations** — pages come in, tiles rise one after another, the toast slides up, dialogs open with a small scale, meters grow, buttons give when pressed; all of it switched off by the phone's reduced-motion setting. (#37)
- [x] **Better icons for the whole app** — the owner's words: "the app icons in not looking good, if possible can se enhance the icons of the complete app". Two things to look at: the app icon on the home screen and in the browser tab (`public/icons`), and the small icons inside the app (`src/ui/Icon.tsx`). Do both unless the owner says which.
- [x] **A splash screen when the app opens** — "also add a splash sceen in the app when open". The manifest's background colour and icon give the installed app a start screen; add an in-app screen with the logo until the data is loaded. Done: a green screen with the logo shows from the first paint (static markup in `index.html`) until the data is ready, at least 0.9 s, then fades; no wait under reduced motion.

## Version 1.12: finish the move to Tailwind
- [ ] **Tailwind, the rest** (the owner's words: "add some animations, remove the css use tailwind css"): convert the remaining features from the hand-written CSS to utility classes and delete the CSS files; colours and fonts are already in Tailwind's theme. What stays in a small stylesheet because Tailwind cannot say it well: the keyframes, the SVG chart strokes, the one green tile that re-points the colour tokens, the Overview grid's container queries. `tests/support/style-snapshot.js` records the computed style of every visible element (both themes, phone and desktop width) and compares it after each conversion; record the baseline first.

## Asked for while 1.12 was running (not scheduled; the owner picks the order)
- [ ] **A button on the Month page for the picked category** — the owner's words: "on /month page on selected category show a button on top right btn which on click will ask set budget for this category or add expense for this category expense with prefilled category". When a category is picked on `/month`, show a button at the top right; it asks two things: set the budget for this category, or add an expense with this category already chosen. Needs: the Add expense page to take a category from the address, and the budgets dialog to open on one category.
- [ ] **Budgets set in the spreadsheet can be changed in the app** — "also the item that budget is set in the spreadsheet should still be able to change that". Today those rows say "set in the spreadsheet" and cannot be edited. Question to settle first: when the app's number differs from the spreadsheet's, which one wins after the next import (the app's own number kept as an override, or the spreadsheet's overwrites it)? Needs a short question round before building.

## Asked for while 1.11 was running (not scheduled; the owner picks the order)
- [ ] **Language: English, Hindi and Hinglish** — the owner's words: "add language change option default english add hindi and hinglish (whatsapp language)". A language choice in Settings (default English); Hindi in Devanagari; Hinglish is Hindi written in English letters, as people type it on WhatsApp. Needs: every screen's text moved out of the components into per-language lists, a Settings part (`/settings/language`) that remembers the choice on the phone, the long messages and validation errors included, and amounts and dates kept in the Indian format. To ask when it is picked up: who checks the Hindi and Hinglish wording (it must read naturally, not like machine output), and whether category names the person made stay as typed.

- [ ] **Question to answer: can AI be used in the app, and how, or why not?** (the owner's words: "after finishing this work can we use AI in this web-app if yes how, if no then why"). Answered in the report after version 1.11; if the owner wants it, it starts with a question round and a PRD.

## Last (the owner will pick this up at the end)
- [ ] **Analytics** — charts and insights inside the app (spending over time, category trends, month against month, goal progress), **and updated charts** (the owner's words: "update the charts and the deep analytics page or section"): refresh the charts the app already has (the month's pace line, where the money went) and add a deep analytics page or section. Needs a question round on which figures matter. In-app only: no tracking and nothing sent anywhere.

## Ideas that came up and are not scheduled
- A "repeat every month" tickbox in Add expense (makes a recurring payment).
- Undo after deleting or editing a payment.
- Category trends, home-screen shortcuts.
- Bank or UPI statement (CSV) import, and reading messages automatically (needs a native Android app).
- Calendar: when an event is deleted in the app, also send a cancel for it in the calendar file, so the phone's calendar removes it when the file is opened again.
- Splitting `data/sync.ts` and `data/context.tsx` further, only along a seam that does not need their shared state.

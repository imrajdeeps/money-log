# TODO

What is planned, in the order it will be picked up. **How it works:** anything the owner asks for while other work is running is written here first, in the owner's words. The running work is finished (and its pull request opened), then the next item is picked from this list.

**Open items are first, finished ones are under Done at the end.** Nothing is open right now: the next thing is whatever the owner asks for.

## Ideas that came up and are not scheduled
- Verify the WhatsApp number on the profile by sending a code on WhatsApp (skipped for now by the owner). Needs a provider (Meta WhatsApp Business API or Twilio via Supabase phone sign-in), per-message cost, a server-side secret, rate limits, and a privacy note.
- A "repeat every month" tickbox in Add expense (makes a recurring payment).
- Undo after deleting or editing a payment.
- Category trends, home-screen shortcuts.
- Bank or UPI statement (CSV) import, and reading messages automatically (needs a native Android app).
- Calendar: when an event is deleted in the app, also send a cancel for it in the calendar file, so the phone's calendar removes it when the file is opened again.
- Splitting `data/sync.ts` and `data/context.tsx` further, only along a seam that does not need their shared state.

## Done

### Versions 1.13 to 1.16 (done: on main)
- [x] **A button on the Month page for the picked category** — the owner's words: "on /month page on selected category show a button on top right btn which on click will ask set budget for this category or add expense for this category expense with prefilled category". When a category is picked on `/month`, show a button at the top right; it asks two things: set the budget for this category, or add an expense with this category already chosen. Needs: the Add expense page to take a category from the address, and the budgets dialog to open on one category.
- [x] **Budgets set in the spreadsheet can be changed in the app** — "also the item that budget is set in the spreadsheet should still be able to change that". Today those rows say "set in the spreadsheet" and cannot be edited. Decided (the owner was away): a number set in the app wins over the spreadsheet's for that category; clear it to go back to the spreadsheet's. An import never overwrites it.
- [x] **A guided tour of the app** — done in 1.14: a nine-step first-run tour for a new person and a what's-new tour for someone who already uses the app (steps are tied to versions), skippable, replayable from Settings, About. Own code, no library; the text is English for now (the language item will translate it).
- [x] **A profile page with a WhatsApp number** — the owner's words: "also design and create a user profile page" and "where they can add and verify whatsapp number". Done: a Profile part under Settings, Account (round initials picture, name, the account's email, an optional WhatsApp number kept on this phone, what the phone holds). The name is the one "your name in this group" starts from. **Verifying the number through WhatsApp was skipped on the owner's word** (see Ideas).
- [x] **Settings in groups, and Sign out / Switch account buttons** — done: the list is in five groups (Account, Money, Privacy and security, App, Danger zone) and, when signed in, a card at the top has Sign out and Switch account. Switch account says what happens: this phone's copy is erased (a phone holds one account's data), with the unsynced-changes warning and a pointer to Backup.
- [x] **Language: English, Hindi and Hinglish** — done in 1.15: Settings, Language; every screen, dialog, message and the tour are translated (about 820 texts); dates follow the language; a text without a translation shows in English; a test keeps the dictionaries complete. Not translated on purpose: the spreadsheet-import error messages, and what people typed.
- [x] **Analytics** — done in 1.16: an Insights page (months as bars over 3, 6 or 12 months, categories with trend lines and the same-days comparison with last month, this month by group, days of the week, biggest payments, goals), reachable from an Overview tile, the top menu and the Month page; the Overview's month chart refreshed (gridlines, scale label, dashed likely-month-end line from last month's shape). In-app only: no tracking, nothing sent. The figures were chosen without a question round (the owner was away): ask before adding more.

### Version 1.12: finish the move to Tailwind (done: on main as 1.12.0)
- [x] **Tailwind, the rest** (the owner's words: "add some animations, remove the css use tailwind css"): every feature now uses utility classes and the nine hand-written CSS files are gone. What stays in `src/styles/index.css`: the theme, the plain element rules, the hero tile that re-points the colour tokens, and the chart's SVG strokes. Checked with `tests/support/style-snapshot.js` at phone, tablet and desktop width, light and dark, plus the group pages and the dialogs.

### Version 1.11: Tailwind setup, animations, icons, splash screen (done: on main as 1.11.0)
- [x] Tailwind CSS set up and proven on the Goals screens (#36)
- [x] **Animations** — pages come in, tiles rise one after another, the toast slides up, dialogs open with a small scale, meters grow, buttons give when pressed; all of it switched off by the phone's reduced-motion setting. (#37)
- [x] **Better icons for the whole app** — the owner's words: "the app icons in not looking good, if possible can se enhance the icons of the complete app". Two things to look at: the app icon on the home screen and in the browser tab (`public/icons`), and the small icons inside the app (`src/ui/Icon.tsx`). Do both unless the owner says which.
- [x] **A splash screen when the app opens** — "also add a splash sceen in the app when open". The manifest's background colour and icon give the installed app a start screen; add an in-app screen with the logo until the data is loaded. Done: a green screen with the logo shows from the first paint (static markup in `index.html`) until the data is ready, at least 0.9 s, then fades; no wait under reduced motion.

### Version 1.10: goals and a plan (done: on main as 1.10.0)
- [x] **Goals and a plan**: the data, the Goals page, top-ups, the plan, and the Overview tile (see `docs/prd-goals.md`).

### Version 1.9 (done: on main as 1.9.0)
- [x] Sticky top bar (#23)
- [x] Database foundation: trip dates, closing a trip, the flatmates' usual split (#24)
- [x] Trip screens: dates, summary, close and reopen (#25)
- [x] Swipe a due-list item left to delete it, with a trash icon (#27)
- [x] Flatmates usual split card, Family "This month", the Couple tile on the Overview, and the release number 1.9.0 (the fifth pull request of 1.9)

### Questions answered
- [x] **Question to answer: can AI be used in the app, and how, or why not?** (the owner's words: "after finishing this work can we use AI in this web-app if yes how, if no then why"). Answered in the report after version 1.11; if the owner wants it, it starts with a question round and a PRD.

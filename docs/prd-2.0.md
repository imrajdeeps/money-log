# PRD: Hisaab 2.0 — the new design, a new name, shared udhaar

**Status:** approved by the owner on 2026-11-26 ("perfect, now start the implementation, in the code base with the major release of version/2.0.0"). Built on the branch `version/2.0.0`. One SQL section (shared udhaar) that the owner runs once on the live project.

## The owner's words (2026-11-26)
1. A full redesign brief ("Design the whole product from scratch: a design system, then every screen and state, in light and dark"), reviewed screen by screen on the design canvas (Claude Design, artifact "Hisaab").
2. "ok rename it to hisaab" — after a naming question; the logo is direction **B, the letter ह** (lime on deep green).
3. Udhaar: "if i use @ then list of my circle should be shown … a personal non-group expense should be visible …", then, after a proposal: "ok build this, also user can select the circle people and not circle people, if circle person is selected, this entry should also shown in the udhaar section of that person".
4. Profile: "UPI Id or the upload QR and read the upi id from the code and save them".
5. "can we add a minimal sound on toast message and on the notification, user can mute it in the setting".
6. "dropdown ui look weird, check the bottom arrow in the dropdown it touches the border"; "is this a setting button, if yes it doesn't look like setting".

## Why a major version
The name changes, the look changes on every screen, and udhaar entries can now be seen by another person. Nothing is removed and no stored data changes shape: a 1.35 phone opens 2.0 with every payment, group and goal as it was.

## Phases (each its own commit, tests after each)
1. **Design system in code.** New colour steps in `tokens.css` (field border at 3:1, control border, pressed, disabled, danger, open-tab pill, toast action, darker dark-mode hero), focus ring 2 px with a 2 px gap, fields 48 px with 12 px corners, buttons pressed by colour (not shrink), chips with a tick when chosen, budget words as tinted tags, tiles 16 px (hero 20), the open tab with a pill and a bold word, borderless 44 px header buttons, a left-aligned toast with a lime Undo. Dropdowns get their own chevron, 14 px from the edge. The settings icon becomes a toothed cog (the old one read as a sun).
2. **Hisaab.** The name in the manifest, page title, splash, texts in all three languages and the README; the ह mark for the home-screen icons, favicon, splash and header. Storage keys, the backup format and the database stay as they are, so nothing is lost in the switch.
3. **Sound and the UPI QR.** A soft tick when a toast appears and a gentle chime for a new note, made in the browser (no files fetched); a *Play soft sounds* switch in Settings, on by default, kept on this phone. Profile: *Scan QR* and *Upload QR image* read a UPI QR (`upi://pay?pa=…&pn=…`) with the browser's own barcode reader and fill the UPI id; the image is not kept. Where the browser has no reader the buttons say so and the id is typed. (The canvas said private entries stay "only on this phone"; they are in fact private to the account, synced and in the backup, so the app says "private, only you see it".)
4. **Udhaar with your Circle.** The *Who* field lists your Circle as you type; a name outside it stays private. Picking a Circle person shows *Share with {name}*, ticked (the owner: "if circle person is selected, this entry should also shown in the udhaar section of that person"); untick it to keep the entry private. A shared entry goes to that person's Udhaar as an invitation (*Accept* / *That is not right*) and counts for them only once accepted; after that either side can mark it settled and both see it. Groups gets a *With people, outside groups* part with one line per person. SQL: a `shared_udhaar` table, row security forced, reachable only through functions, both people must be linked in the Circle.
5. **Screens to match the canvas.** Add expense (order, one-line box, the two ticks in one card), Overview tiles, Month, the group page, Plan, Settings parts — layout and copy, same behaviour.

## Not in this plan
- Push notifications, sounds while the app is closed, sounds for errors.
- A QR library: the browser's reader is used where it exists (no new package).
- Tablet-specific layouts beyond what the existing breakpoints give.

## Risks
- **Look regressions** on screens not yet redrawn. Mitigation: the style snapshot tool (`tests/support/style-snapshot.js`) before and after each phase; the shared class strings stay complete (no base-plus-override).
- **Shared udhaar privacy.** An entry is only visible to its two people, only after the other accepts; non-Circle names never leave the phone. RLS tests cover a third person, an unlinked person and a declined entry.
- **Name change confusion** for people who already installed the app: the icon and name change after the next update; the address stays the same.

## Checks
`npm run check`, `npm test` (including the complexity and translation-coverage checks), new tests for every new rule, browser checks at phone, tablet and desktop width, light and dark, and an independent review of the diff before the pull request.

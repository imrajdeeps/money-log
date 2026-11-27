# PRD: Hisaab 2.1 — groups first, parts you turn on, history and repeats

**Status:** approved by the owner on 2026-11-27 ("now you know what to do, so start the coding … every thing should be as per the design"), after the screens were drawn on the design canvas (Claude Design, artifact "Hisaab", versions 35–42). Built on the branch `version/2.1`, on top of 2.0.1. Two SQL sections (simplify repayments, repeats in a group) that the owner runs once on the live project.

## The owner's words (2026-11-27)
1. "main use is groups so keep groups to the first not at the end tab"; on the canvas: "group should be the main focus of the app".
2. "What is new -> only show the feature that are released in the current month".
3. "try to enhance the tour of the app; simple and short and should cover all major feature".
4. "add a way to see the net-worth history; also i by mistake type a new number to 0, and there is no way to delete this invalid entry in net worth".
5. "net-worth is a complex feature, take a flag in the setting by default turned off, only the user turned on the flag will be able to see the networth section, but this does not mean that on turning off the existing data will vanish"; "add more sections like hide the plan section in setting, by default off".
6. In my month: "when i turned this on this should ask counted from, by default start of this month".
7. "an option in the group setting whether to simplify the repayments or not, if turned on then only simplify the repayments as splitwise is doing, if turned off then no repayments simplifies".
8. "me and one of my flatmate friend share the recurring payments like room rent … 15000 … my share is 9k and his share is 6k, how can i add this".
9. Logo: "The letter of hindi look weird, so use C · Hisaab barabar".

## Decisions
- **Groups first.** Phone bar: Groups · Home · (+) · Month · Plan. Desktop: Groups · Overview · Month · Plan · Settings. The app still opens on the Overview.
- **Features** (Settings, Features): Plan (goals, the due list, the calendar file) off by default; Net worth off by default and inside Plan (it needs Plan on); Udhaar on; Insights and cash flow on. Groups, the Overview, Month and Add cannot be turned off. Turning a part off only hides it (its pages, Overview tiles, notes on the bell and tour steps); nothing is deleted and everything keeps syncing. With Plan off its place in the bars goes to Udhaar (with Udhaar off too, to All payments). The choices are one item in the account's goals block (like the notification settings), so they follow the account to every device; no SQL.
- **What is new** shows only the cards of releases made this calendar month, the newest three at most. Each card carries its release date.
- **The tour**: seven short cards in the new order (Welcome, Groups, Add, Overview, Month, Plan when it is on, Done); the Plan card is left out when Plan is off.
- **Net worth history**: a page with the chart (6 months, 1 year, All), every update newest first with the change and where it came from, change or delete any of them (Undo), and "Looks wrong?" on an update far from the ones around it. Typing a new number asks first before saving ₹0 or a figure under half or over double the last one.
- **In my month** asks "Counted from" when turned on: Start of this month (the default), Today, or Another day.
- **Simplify repayments** is a group setting (admins change it), on by default, as today. Off: each pair of people nets out what they owe each other, and nobody pays someone they do not owe. SQL: a `simplify` column on groups and an admin-only function.
- **Repeats in a group** (rent): a group expense can repeat every month with its payer and its split; the group's members see it coming, anyone can log it with one tap on its day, and a month can only be logged once (the expense id comes from the repeat and the month). SQL: a list of repeats on the group and a function to change it.
- **Logo C** (two ledger lines and a tick, lime on deep green) everywhere: the header, the splash, the lock screen, the home-screen icons and the favicon.

## Pull requests (into `version/2.1`)
1. This PRD, Groups first, Features.
2. The tour, what is new, logo C.
3. Net worth history (change, delete, Undo, the guard).
4. Group settings: Counted from, Simplify repayments (SQL).
5. Repeats in a group (SQL), the release (2.1.0, README, the what's-new card).

## Not in this plan
- Net worth worked out from accounts moved by payments (the proposal on the canvas): a release of its own.
- Opening the app on Groups instead of the Overview.

## Risks
- **Plan and Net worth disappear after the update** for people who use them (off by default, as the owner asked). Mitigation: the what's-new card says where to turn them on, and nothing is deleted.
- **A device still on 2.0** drops the Features item when it saves the goals block; the next sync from an updated device puts it back (its copy wins the merge).
- **Simplify off with balances open** can show lines that look odd (a payment made under the simplified list); totals stay right. The setting says so when there are open balances.

## Checks
`npm run check`, `npm test` (complexity and translation coverage included), new tests for every new rule, the access tests for the two SQL sections on a scratch Postgres, browser checks at phone and desktop width, light and dark, and an independent review before the pull request.

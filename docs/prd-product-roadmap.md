# PRD: the product roadmap after the group release (versions 1.30 to 1.32)

**Status:** approved by the owner on 2026-11-24 ("Opus is right in many cases, so continue with the releases"); 1.30 and 1.31 built; 1.32 next.
**Source:** an independent senior-product-manager review (an Opus reviewer who read the README, the TODO and every PRD), judged and adjusted. The review's own words and the owner's reasons are kept in the conversation, not here; this file is the decision.

## The problem
The app is strong for one person who already budgets (the owner), and groups are a real wedge (no entry cap, Hindi and Hinglish, group kinds that fit India). But it is about to be handed to friends and family, and:
- **Getting in is heavy.** A group member installs the PWA, makes an account, sits through a nine-step tour, finds Groups, enters a code. One holdout stalls a trip group.
- **Nothing brings people back.** There is no push, and the bell works only while the app is open. A new person has no budgets, so "this month" shows "No budgets yet".
- **Logging is slower than it needs to be** (a native category list, a hidden bank-message box, no "add another").
- **A group never reaches your own month** unless you tap "Add my share" on each expense, and settling up only records.

## Version 1.30 "In and logging in 30 seconds" (no SQL)
1. **A short welcome instead of the nine-step tour for a new person:** language, then "Track my spending / Split with others / Both", then straight to the first expense (or to Groups). The full tour stays in Settings, About, and the what's-new tour is unchanged for existing users.
2. **An invitation link opens a one-screen start.** Someone who opens a group link while signed out sees "You were invited", with sign-up or sign-in right there, then the join form with the code filled in. No tour in between (already so while a link is pending).
3. **Faster Add expense:** every category is a tappable chip from the first entry (most used first), Today / Yesterday / pick a date, and **Save and add another**. A bank message can be pasted with a visible button beside the amount.
4. **The group page gets an "Add shared expense" button** that opens Add with that group chosen.
5. **A lighter Overview while getting started:** tiles that would only show an empty invitation (net worth, due soon, cash flow, insights, where it went, goals) are hidden until the person has logged a few payments. Nothing is removed; they appear by themselves.
6. **WhatsApp invites:** a "Share on WhatsApp" button next to Copy link, for group invitations and Circle codes (a `wa.me` link with the text; no phone number is used or sent).
7. **A nightly reminder through the calendar:** Settings, Notifications makes a calendar file with a repeating daily event ("Log today's spending", at a time the person picks) that the phone's calendar app turns into an alert. It is the only trigger outside the app that needs no server.
- **Not in code, for the owner:** password-reset and confirmation emails reaching other people need a custom SMTP provider in the Supabase dashboard (Authentication, SMTP); a sign-up allowlist needs a database change and is left for later.

## Version 1.31 "Groups close the loop" (no SQL)
1. **Your share of a friend's group expense counts in your own Month, automatically**, with a switch per group (on by default for flatmates and couples, off elsewhere), and never twice with "Add my share to my budget".
2. **A reminder that works without a server:** in a group's balances, *Remind* opens WhatsApp with the amount and your UPI ID filled in (the person who is owed is the one who sends it). An optional UPI ID in Profile stays on this phone and is shared only inside that message. *Pay* on the debtor's side opens a `upi://pay` link built from a UPI ID typed or pasted from the message.
3. **"Since you last opened":** at the top of a group, what others added or changed since this phone last looked, and a dot on the group list.
4. **Udhaar:** a private list of money lent or borrowed with anyone (not only app users): who, how much, which way, when, settled or not, with a WhatsApp reminder. Kept in the same private block as goals (synced, in the backup).

## Version 1.32 "Less typing" (no SQL)
1. **One-line entry:** type "450 swiggy upi" and press Enter; the amount, the merchant, the method and a category are filled in for a last look.
2. **Open the app with a message in the address** (`#sms=...`), so an iPhone Shortcut can send a bank message straight to Add; a README section explains the Shortcut. (Android's share target needs a service-worker change and is left for later.)
3. **Batch review of pasted messages:** paste several, see them as a checklist with guessed categories, save the ones that are right; duplicates are flagged from the reference numbers the app already keeps.
4. **Safe to spend:** one figure on the hero tile, "₹N a day": (budget minus spent minus recurring and due items still to come) divided by the days left; shown only when budgets exist.
5. **Monday recap:** a card with last week's total, its top three categories, how it compares with a usual week, and what is due next week.
6. **Suggested budgets:** after a full month of payments, one tap makes the month's budgets from last month's spending.

## What was deliberately not taken from the review
- **Hiding the Circle and shared goals behind a Labs switch:** the owner asked for them; they stay, but are not promoted.
- **Guest group members, bank-statement import, web push, an Android share target, a sign-up allowlist:** each needs more than this round has room for (server work or a service worker); they stay on the list.
- **Anything the review called a trap:** AI categorisation, PDF statement parsing, live fund prices, a native SMS reader, multi-currency, receipt OCR, account aggregator.

## Risks
- **Auto-counting a friend's expense can count it twice** (once automatically, once through "Add my share"). The rule: an expense I already added a share of by hand is never counted again; the manual button is hidden for groups where the switch is on.
- **The nightly reminder is a calendar file, not a push.** Whether the alert opens the installed app or only the browser differs by phone; the README says so, and it is checked on the owner's phones, not assumed.
- **UPI links:** `upi://pay` from a web app is handled differently by each phone; the message always carries the plain UPI ID as well.
- **Hiding empty tiles hides discovery.** They return after five payments, and every page stays reachable from the menu.
- **Translations:** every new text needs Hindi and Hinglish.

## How it is measured (the owner can see these without analytics)
- **1.30:** of the people invited, how many log at least one payment within two days, and on how many different days in their first week (counted from rows per account in his own database, and by asking local-only people).
- **1.31:** groups with three or more active members and ten expenses in two weeks; settlements recorded per group.
- **1.32:** the share of payments whose note carries a bank reference (the reader appends it), and how many of the first group are still logging in week four.

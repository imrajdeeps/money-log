# PRD: Add a payment from a bank message

## Problem
Typing every payment is the main chore of tracking money. The bank already sends an SMS or app alert for each one with the
amount, the merchant and the date. A web app cannot read SMS (no browser or phone lets it), so the person brings the text to
the app instead.

## Goal
Copy a bank message, paste it in Add expense, and get the form filled in. The person checks it and taps Save. Done in about
five seconds, with no typing in the common case.

## Scope (this release)
1. **A "Paste a payment message" box** at the top of Add expense, with a **Paste and read** button (reads the clipboard) and a
   text area for pasting by hand.
2. **Reading the message on the phone** (nothing is sent anywhere): amount, money out or in, merchant, date, method (UPI, card,
   cash) and the bank's reference number.
3. **A suggested category** from what the person chose for the same merchant before, else from a short list of well-known
   merchants and words (Swiggy, Zomato, Uber, electricity, pharmacy ...), and only if that category exists in their list.
4. **Always a suggestion.** The form is filled in; nothing is saved until the person taps Save.

## Rules
- Money coming in (credited, refund, deposit) fills nothing and says so: Money Log records spending.
- One-time passwords and messages without an amount fill nothing and say so.
- The balance in a message ("Avl bal Rs 12,000") is never taken as the amount.
- A message without a date is today's. A date in the future is ignored (today).
- The bank's reference number goes at the end of the note ("Swiggy · ref 4012...") so pasting the same message twice is
  noticed ("already added") and not saved twice. No database change is needed.
- Amounts follow the app's existing limits (positive, at most 2 decimals).

## Not in this release
- Reading messages automatically (needs a native Android app; not possible on an iPhone).
- A phone automation that opens the app with the message attached (a later, optional step; the text would travel in the part
  of the link after `#`, which is never sent to a server).
- Bank statement or CSV import.
- Credits and refunds as negative payments.

## Open questions
- Which banks and apps send the person's messages? The reader is built from the common Indian formats (UPI, debit and credit
  card, NEFT/IMPS, ATM); it needs real examples from the person's banks to be tuned. Messages it cannot read fill nothing and
  say so, so a miss is never silently wrong.

## How we know it works
- Tests with typical messages from several banks and apps, including OTPs, credits, balances and missing dates.
- In the browser: paste, form filled, Save adds the payment; pasting it again says it is already added.

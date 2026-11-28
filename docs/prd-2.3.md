# PRD: Hisaab 2.3 — net worth worked out from your accounts

**Status:** draft for the owner's review (2026-11-28). Built only after the owner's go-ahead. The screens are the proposal on the design canvas (Claude Design, artifact "Hisaab", row "Net worth, worked out · proposal": `NwPlan`, `NwSetup`, `NwAccount`, `NwCheck`, `NwCheckGap`, `NwWhy`). Branch `version/2.3`, from `main` at 2.2.0. No SQL: everything lives in the synced goals block, like net worth today.

## The owner's words
1. On the canvas (27 Nov): "as net-worth is a complex feature, take a flag in the setting by default turned off" (done in 2.1), and from the chat the same day, the proposal: net worth worked out from accounts that payments move, instead of typing every figure.
2. "continue with this" (28 Nov), on "net worth worked out from your accounts".
3. The answers of 28 Nov:
   - Worked out from payments: **bank and credit card**, **FD, RD and PPF**, **mutual funds and stocks**. Loans are not on the list, so they keep today's estimate from their EMI and rate.
   - Groups and Udhaar: **count both ways**.
   - Check-in: **monthly, on a day I pick**.
   - Today's typed figures: **switch, keep the history**.

## Decisions
- **Set up once (about two minutes).** *Your accounts* asks:
  - *Where does your salary land?* (money you log as received goes to that account);
  - *What do you pay with?* (UPI, debit card, credit card and cash: each way of paying takes money from one account);
  - *What each holds today*, typed once.

  The items you have today become the starting list, and anything not listed is kept as one line, *Everything else*, until you split it up. After this the figures are worked out: "Nothing typed".
- **What moves an account:**
  - A payment takes its amount from the account its method pays from: UPI and debit card from the bank, cash from cash, and a credit card adds to what you owe on that card.
  - Money received adds to the salary account.
  - Moves between your own accounts are **moved, not changed**: net worth stays the same. They come from categories mapped to an account (your *Saving* categories into FD, RD, PPF, mutual funds or stocks; *Credit card bill* pays the card).
  - Each account shows *What moves this account*, which you can change.
  - A payment with no method comes from the account you pay most with.
- **Shared expenses** count once. When you paid the whole rent, the bank goes down by all of it. What the others owe you comes back through the group line, so net worth moves by your share only. When someone else paid, your bank is untouched and your share is in the group line.
- **Interest and markets:**
  - FD, RD and PPF count their interest from the yearly rate you give, estimated monthly, the way loans already pay down.
  - Mutual funds and stocks add what you put in. Their market value is asked at the check-in, and the difference shows as *the market*.
- **Loans** stay as today: the balance is estimated from the EMI and rate, and confirmed at a check-in. An EMI payment lowers the bank it is paid from.
- **Groups and Udhaar** are always counted (the lines that exist today): what people owe you adds, what you owe them takes away.
- **The monthly check-in**, on the day you pick (the 1st unless you choose another), puts one note on the bell. It asks only what the app cannot know:
  - the market value of mutual funds and stocks;
  - "From your payments the bank should be about ₹1,21,000. Is it?" (*Yes, about that* / *No, it is different*);
  - loans and *Everything else*.

  A gap in the bank shows as spending you did not log ("₹3,000 went out that you did not log"), with *Add ₹3,000 to Other* or *Leave it out*.
- **Why it moved** (`NwWhy`) splits a month's change into what you saved, markets and interest, lists *Moved, not changed* apart, and says how much of what came in you kept ("You kept 58% of what came in this month").
- **History:** every figure you typed before stays in the history and the chart. From the switch on, the worked-out figure is recorded at most once a day when it changes, and at each check-in.
- Still **off by default**, inside Plan (Settings, Features). Off only hides it; nothing is deleted.

## Data (goals block, no SQL)
- A net worth item gains, optionally:
  - what pays from it (the methods);
  - whether money received lands in it;
  - the categories that move money into it or pay it off (card bill, saving categories);
  - for FD, RD and PPF, a yearly rate (the field loans already use).

  Its typed amount and date become "confirmed on" and "as of".
- The worked-out balance is calculated, never stored: the confirmed figure plus the payments logged since its date, plus interest. A check-in confirms new figures.
- A setting item holds the check-in day and the salary account.
- The history gains a third source, *worked out*, beside *checked in* and *typed*.
- Older devices (2.2) must keep the new fields when they save an item. Their cleaning has to keep what they do not know (as the Features item already does). This is a fix in a 2.2.x patch, shipped before 2.3.

## Pull requests (into `version/2.3`)
1. This PRD and the logic: moves, interest, worked-out balances, the check-in, why it moved, with tests.
2. Set-up and the account page (`NwSetup`, `NwAccount`), and the Net worth card on Plan (`NwPlan`).
3. The check-in with its gap, *Why it moved*, the bell note, and the release (2.3.0, README, the what's-new card).
- Before them, a 2.2.x patch so 2.2 devices keep unknown fields of net worth items.

## Not in this plan
- Loans moved by payments (they keep the EMI estimate).
- Reading balances from bank messages, and live market prices.
- More than one currency.

## Risks
- **A wrong mapping moves the wrong account** (a UPI payment made from a second bank). *What moves this account* can be changed, and the monthly check-in catches the drift.
- **Payments not logged** make the bank look richer than it is. The check-in shows the gap and offers to add it to Other.
- **A 2.2 device without the patch** would drop the new fields when it saves an item. Hence the 2.2.x patch first.

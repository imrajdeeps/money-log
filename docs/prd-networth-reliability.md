# PRD: net worth you can keep up (1.33), and reliability and housekeeping (1.34)

**Status:** approved by the owner on 2026-11-25 ("continue with other releases"); the net worth part answers the owner's own complaint ("net worth calculator is not so good, how can we make this a really useful feature") and an independent product review's advice; the reliability part comes from an independent engineering review. Both are built without any database change.

## 1.33 Net worth that earns its place

### The problem
Net worth is one number the person types ("6,21,302") and a date. Working the number out elsewhere is the hard part, so people stop after two updates; the app adds nothing to it (no picture of where the money sits, no sign of what moved it, no connection to the groups, Udhaar or spending it already knows); and a figure that is typed rarely stays true.

### What it becomes
- **A list of what you own and owe, not one number.** Items, each with a name and a value:
  - *You own:* Cash and bank (liquid), Investments (FD, mutual funds, stocks), Retirement (PF, PPF, NPS), Gold, Property, Other.
  - *You owe:* Loans, Credit card, Other.
  Net worth is the assets minus the debts. A person with no items keeps the old way (type one number) and is invited to break it down; every earlier update stays in the history.
- **A monthly check-in.** *Update* shows every item with its last value in one list; change what moved, save. One save is one snapshot in the history (the same line as before), and it resets the existing "update your net worth" reminder. A second save on the same day replaces that day's snapshot instead of adding another.
- **What moved:** under the figure, the items that changed most since the last check-in ("Gold ₹+8,000, Home loan ₹−6,000").
- **Where it sits:** assets by kind as bars; **liquid money** (cash and bank) against the rest.
- **Two honest numbers:** *Runway* (liquid money divided by your usual monthly spending, the average of the last three months that had any) and *Debts as a share of what you own*.
- **Loans that pay themselves down (optional per loan):** with an EMI and a yearly rate entered, the balance is estimated month by month from the day it was last set (interest first, the rest reduces the balance) and shown as "estimated"; typing a new balance resets it. No EMI: it is an ordinary item.
- **Automatic lines, switched on by the person (off by default):** *Group balances* (what friends owe you less what you owe them) and *Udhaar* (money lent less borrowed) are added from what the app already holds, labelled as automatic, and counted in the snapshot.

### Where it lives
Items are a new kind of item (`w`) in the same private block as goals, net worth snapshots and Udhaar, so they sync (merged item by item), are in the backup, and need no SQL. At most 100 items, removed ones included. The automatic switches are kept on the phone only.

### Not in this version
Per-item history charts, projections and milestones ("₹10 lakh by 2030"), asset prices pulled from outside (live fund or gold prices; the app never calls out), linking a goal to an item.

### Risks
- **A wrong estimate looks like a fact.** Estimated loan balances say "estimated", and the check-in shows them next to the real figure to correct.
- **Double counting:** the automatic Udhaar and group lines must not also be typed as items; the switch's text says so.
- **A snapshot that includes live group balances changes when the balances do**; the snapshot is a moment in time, written on a check-in, never rewritten later.

## 1.34 Reliability and housekeeping
From an independent engineering review (the product-side findings went into 1.30 to 1.32).
1. **Deleted items stop counting forever.** Removed goals, due items, top-ups, net worth updates and Udhaar entries count toward a lifetime cap and are never cleared, so after enough use "add" fails with an error that cannot be fixed. Caps count only live items; removed items older than 180 days are cleared when something changes; the clean-up cap leaves room for removed ones so nothing is dropped on sync.
2. **Failures are visible.** A root error screen with "Copy report" and "Reload" instead of a blank page; unhandled errors and rejected promises show a message with the same copy button. Nothing is sent anywhere.
3. **"A new version is ready, reload."** The service worker updates itself without telling the page, so a phone can run old code against new data; the page now says so.
4. **Checks that cover the work.** CI also runs for pull requests into `version/*` branches (they only ran for main); the tests are type-checked (nine errors found are fixed).
5. **Smaller and quicker to start:** Hindi and Hinglish are loaded only when chosen (about 200 KB less for English users); the start screen stays 500 ms, not 900.

Not in this version, and why: a custom SMTP provider and a sign-up allowlist (dashboard and database work for the owner), a weekly encrypted database dump (needs a private repository and a database secret), ESLint and Dependabot (new packages and bot pull requests: the owner's call), a schema-version row (SQL).

## Checks
- Unit tests for each pure piece (worth totals, loan estimate, check-in rules, runway, caps and clean-up, dictionary loading), the existing tests green.
- Browser checks at phone and wide width, light and Hindi: net worth from nothing, a check-in, a loan estimate, the automatic lines; the error screen, the update banner (simulated), the lazy language.

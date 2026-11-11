# PRD: Everything in the app, the backup file as the only import

**Status:** 1.20 and 1.21 built (2026-11-11); 1.22 is still to do.

## Problem
The Plan page's "Net worth and goals" block can only be filled by pasting a block from the spreadsheet's App export tab, so it cannot
be set in the app, and it is a long list of rows that looks messy. More widely the app has three spreadsheet-shaped doors in and out
(plan import, Log-tab export, backup) when the app should be the place where everything is made.

## The owner's decisions (2026-11-11)
- Remove the **net worth import**. The person creates **short-term goals, long-term goals and net worth** in the app, **from the same
  page** (Plan, the "Net worth and goals" section). The look of that section is redesigned.
- **Only one file goes in and out: the backup file** (Settings, Download backup / Restore). No other import or export is allowed in the app.
- So **all three spreadsheet doors go**: the *Spreadsheet plan* import (net worth, budget, due list) and the *Export* of payments to the
  sheet's Log tab. Each needs an in-app replacement first (below).
- The imported net worth figures on the phone now (net worth, long-term target, emergency fund) are **dropped**, not converted.

## Proposed split into versions (my proposal: each ships on its own, nothing is removed before its replacement exists)
| Version | What | What goes |
| --- | --- | --- |
| **1.20** | Net worth and goals in the app, redesigned section | the net worth import block |
| **1.21** | The due list in the app (add, edit, done, remove) and budgets only from the app | the due list and budget import blocks, so the Spreadsheet plan card goes |
| **1.22** | Backup is the only file in and out | the Export screen and tile, the "exported" mark on payments |

## 1.20: Net worth and goals, in the app
**What a person sees, top to bottom, on Plan:**
1. **Net worth card.** One big number ("Net worth now"), the date it was last updated, and the change since the previous update
   ("up ₹12,000 since 1 Oct"). **Update** opens a small form: an amount (may be negative) and a date (default today). Each update is
   kept, so the card can show a small line of the last updates; swipe to remove one. Nothing typed yet: a short invitation to enter it.
2. **Goals**, two groups: **Short term** (due within 12 months) and **Long term**, as compact cards: name, `saved of target`, a progress
   bar, date and months left. Tap a card to open it (edit, top-ups, delete: the existing goal screens). **Add goal** is one button at the
   top of the section and opens the existing goal form (name, target, date, amount already saved, optional linked category) as a
   sheet over the page. Short or long term stays automatic by date.
3. A link to the monthly plan card (what to set aside each month). The Goals page keeps that card; the goal lists are not repeated there.

**Removed:** the *Net worth and goals* paste block in Settings → Spreadsheet plan, the parser and the long figure list. Figures already
imported are not shown any more.

**Data (as built):** net worth updates are items of kind `n` (`{ id, k: 'n', a: amount, d: day, x, t }`) in the existing `goals` block next to
goals and top-ups, merged item by item like top-ups, so sync, backup and the database need **no change** (changed from the first
idea of a new payload in the `networth` block: the goals block already has the merge, backup and sync machinery). The old `networth`
block rows are ignored. The Overview tile shows the latest net worth.

**Also built:** the Goals page is folded into Plan (one page, one place to add goals); `/goals` opens Plan.

**Not in 1.20:** a net worth history chart (the Insights page may take it later), assets and debts as separate lists.

## 1.21: due list and budgets in the app (built)

**As built:** due items are items of kind `d` in the `goals` block (merged per item, no database change), added, changed, ticked and removed on Plan. The imported due list, its ticks and the imported plan are brought across once per phone by `data/legacy.ts` (same ids and time stamps on every phone, so no copies), then deleted from the phone; the sync of the old `budget`, `due` and `due_done` blocks is removed. The plan's amount for the month nearest to the current one becomes the app budget. Settings no longer has *Spreadsheet plan*; the pure `categoryList` and `planForMonth` take only the app's categories.
- **Due list:** an "Add due item" form on Plan (kind: payment or to-do; title; optional date; optional amount), edit, mark done, delete,
  with Undo. The calendar file and its cancels keep working from this list. Existing imported items are **kept once** as ordinary items
  (my proposal; say if you would rather drop them), with their done marks.
- **Budgets:** only the app's own (Month, Categories and budgets). The spreadsheet's planned amounts already imported are **copied once
  into the app's budgets** (this month's amount per category, my proposal), then the import and the "set in the spreadsheet" wording go.
- Needs a plan-block change only if the due list's stored shape changes: decided when 1.21 starts, with the SQL given to the owner to run.

## 1.22: backup is the only file
- Remove the Export screen, its tile and the "N to export" counter; the `exported_at` column stays in the database but nothing reads it.
- Settings: *Spreadsheet plan* and *Export* disappear; Backup stays (Download backup, Restore), and the README says it is the only file.
- The backup file's contents are checked so it holds everything that is in the app by then (goals, top-ups, recurring payments, due
  items, net worth, categories and budgets); anything missing is added in 1.20 to 1.22 as each piece lands.

## Risks and questions still open
- **Losing the sheet link:** after 1.22 payments cannot be sent to the spreadsheet any more, only to the backup file. Confirmed by the owner.
- **Undo of old paths:** removing the import cannot be undone by a setting; a person on an older cached app version still sees the old cards
  until the app updates.
- **Translations:** every new text needs Hindi and Hinglish (the dictionaries test enforces it).
- **Tour:** the first-run tour and the what's-new step mention the spreadsheet import and must be updated.

## Checks
- Unit tests for the net worth updates (merge, change since last, negative values), the converters in 1.21, and a backup round trip that
  contains every kind of item.
- Browser check of each page at phone, tablet and wide width in light and dark, English and Hindi.

# PRD: Income, and a monthly cash flow

**Status:** built in version 1.26.0 (2026-11-11), from the owner's request and one question round. The SQL was tested on a local Postgres; running it on the real project is the owner's go-ahead.

## Problem
Every entry in the app is money going out. There is no way to record money coming in (salary, a friend paying back a loan, cashback,
a refund), so the app can say what was spent against the budget but not whether the month ended with more in than out.

The owner's words (2026-11-11): "There should be a way to add income too in the app, and income category like salary, lent back,
cashback, refund and others. This feature helps the user to check the monthly cash flow."

## The owner's decisions (2026-11-11)
- **A refund or cashback counts as income** in version 1. It does not reduce the spending of the category it came from (that is more exact
  for budgets and can come later).
- **"Left" is income minus spending, and savings is shown on its own line.** A transfer to the *Savings* category is not counted as spending.
- **Scope of version 1.26:** the Spent / Received switch, the income categories, the Home card, the cash flow page, and the SMS-paste
  prefill. Repeating income, "expected salary vs actual" and a "salary not logged yet" notification wait for a later version.
- **The category list below is accepted.**

## How it works
- **One more kind of entry, not a second feature.** An entry gets a `kind`: `out` (what every entry is today) or `in`. The amount stays
  positive; `kind` says which way it went. Nothing changes for existing entries.
- **The Add page (`+`) gets a Spent / Received switch at the top.** Same fields (amount, date, category, note, method). Choosing Received
  swaps the category list for the income categories and hides what only spending has (receipt photos, "Repeat every month", group and
  split). Editing an entry shows the same switch.
- **Income categories, built in:** Salary, Business / Freelance, Lent back, Cashback, Refund, Interest & dividends, Rent received,
  Gift received, Other income. The person can add their own through the existing "my categories" list; they appear only under Received.
- **One new spending category:** *Lent to someone*, so money lent and money returned balance in the cash flow. Added to the built-in list
  (group *Spending*) and untouched for anyone who already has a category of that name.
- **Cash flow, for a month:**
  - **In**: all income of the month.
  - **Out**: all spending of the month, except the *Savings* category (a person's own share of a group expense, as today).
  - **Left** = In − Out. Positive is shown as good, negative as bad.
  - **Saved**: what went to *Savings*, shown beside it; "Kept X% of income" = Left ÷ In (nothing when In is zero).
- **Where it is shown:**
  - A **Home card** "This month": In, Out, Left, and a link to the cash flow page.
  - A **Cash flow page**: the month picker, the same four figures, income by category, the biggest outflows, and the last 6 months as in-vs-out
    bars (the chart rules of the Analytics page: one shared scale, a text alternative).
  - The **payments list** marks income entries with a plus and the good colour; the **backup file** carries the kind (there is
    no CSV export any more, since 1.22). An old backup without it is read as spending. *Built differently from the first draft:* the All
    payments header adds up what went out and what came in apart, so income never inflates the spending total there either.
- **SMS paste** (the paste-message feature): a message saying *credited / received / refund* opens the Add page on *Received*, amount and
  date filled; the category stays for the person to pick (a refund message suggests *Refund*).
- **Not counted as income, on purpose:**
  - A group settlement (a friend paying their share back). The group ledger already handles it; counting it would inflate income.
  - Income inside a group: income is private to its owner (the database refuses `kind = 'in'` on a shared or split row).
- **Budgets and the Plan page stay about spending.** Income categories never appear there, and no existing total, chart, budget status or
  notification changes because income was added.

## Data and SQL
One small change, run by the owner's go-ahead like earlier ones (the live database is empty, so no data has to be migrated):

```sql
alter table public.entries add column if not exists kind text not null default 'out' check (kind in ('out', 'in'));
alter table public.entries add constraint entries_income_private check (kind = 'out' or (group_id is null and share_of is null));
```

Added to `supabase/schema.sql` and to the access tests in `supabase/rls_tests.sql` (an income entry is stored and read back; another
person never sees it; an income entry in a group is refused). The phone's local database, the sync (push and pull), the backup and the
entry history carry the field like any other.

## Not in this version
- Repeating income (a salary that repeats), expected-salary vs actual, a "salary not logged yet" notification.
- A refund that reduces its category's spending; bank accounts or balances; reading bank messages automatically.

## Risks and questions
- **The biggest risk is a total that quietly counts income as spending** (month summary, analytics, Home, budget notifications, payments
  total, group shares). Answer: one shared helper picks the spending entries, every existing sum goes through it, and a test adds income
  to a month and checks that every figure that was there is unchanged.
- **An older cached copy of the app** would show an income entry as spending until it updates. The only user today is the owner, and the app
  updates itself on the next start.
- **Translations:** every new text needs Hindi and Hinglish; the category names are English words like the built-in ones, shown through
  the existing category-name mapping.
- **Where the cash flow page sits in the navigation** is decided while building, after looking at how the bottom bar and the wide-screen
  menu are laid out; the Home card is the main way in.
- **Sonar:** the new code follows the clean-code rules (small functions, no nested ternaries, `Readonly` props).

## Checks
- Unit tests: the cash flow figures (income only, spending only, savings split out, zero income, a group share, negative Left), the
  spending filter (income never leaks into any existing total), the SMS prefill, the backup round trip with and without `kind`.
- The SQL on a local Postgres, then the live project after the owner's go-ahead (access test inside a rolled-back transaction).
- Browser check at phone and wide width, light and dark, English and Hindi, with the stand-in server.

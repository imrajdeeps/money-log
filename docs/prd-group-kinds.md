# PRD: Group kinds that each do something different

## Problem
A group is "Family" or "Trip", but the choice is only a label: both behave exactly the same. Real groups differ. A trip has
dates and an end ("who owes whom, then we are done"). Flatmates split the rent the same way every month. A couple is two
people and mostly 50/50. A family goes on for years and wants a monthly view.

## Goal
Pick a kind when making a group and get the things that suit it, with nothing extra to learn for the kinds you do not use.

## The kinds (this release)
| Kind | Who | What it offers that the others do not |
|---|---|---|
| **Family** | Up to 20, ongoing | As today, plus a **This month** summary in the group: total spent, each person's share, by category. |
| **Trip** | Up to 20, has an end | Optional **start and end dates**; a **Trip summary** (total, per person, per category, per day); **Close trip**: once everything is settled the admin closes it, no new expenses can be added, and it moves to the bottom as "Closed". An admin can reopen it. |
| **Flatmates** | Up to 20, ongoing | A **usual split** (for example 60/40 for rent, or equal) set once by an admin; every new shared expense starts from it instead of from an equal split. It can still be changed for a single expense. |
| **Couple** | Exactly 2 | **One line**: "Priya owes you ₹1,250". Add expense shows **50/50**, **They owe all** and **I owe all** buttons instead of the full split editor. No invite after the second person joins. |

Not in this release: an Event or Friends kind, shared bills that repeat every month for Flatmates (it needs the Recurring
payments feature first), and changing the kind of an existing group (existing groups stay Family or Trip).

## How a person sees it
- **New group** shows the four kinds as cards, each with one sentence of what it offers. Trip also asks for the optional
  dates.
- The kind shows as a small tag next to the group name (it already does for Family and Trip).
- Everything else in Groups (balances, settle up, invites, leaving, the ledger) is unchanged for every kind.

## Rules
- The kind is chosen once, when the group is made.
- Couple: the second person joining fills it; a third join code is refused with a clear message (the database enforces it,
  not just the screen).
- Trip: a closed trip refuses new shared expenses (the database enforces it) but its ledger, balances and settle up still
  work, so a late settlement can be recorded. Only an admin can close or reopen.
- Flatmates: the usual split is a set of percentages adding to 100, or "equal". Only an admin can change it. People who join
  later are added as 0% until an admin updates it, and the screen says so.
- Amounts keep the app's existing rules (rupees, at most 2 decimals) and the groups' whole-paise arithmetic.

## Database change (one SQL for the owner to run in the Supabase SQL Editor)
Written and tested on a scratch Postgres before it is handed over, like the earlier ones. In outline:
1. Allow the new kind names (`flatmates`, `couple`) in the `groups.kind` check and in `create_group`.
2. Add to `groups`: `starts_on date`, `ends_on date`, `closed_at timestamptz`, `usual_split jsonb`.
3. `create_group` takes the optional dates; a new admin-only function sets the usual split, and one closes or reopens a trip.
   (Groups only ever change through functions, as now.)
4. `join_group` refuses a third member of a Couple; a trigger refuses a new shared expense in a closed group.
5. The app's own row-level-security tests (`supabase/rls_tests.sql`) are extended to cover each rule.
Nothing is lost or rewritten: existing groups and payments are untouched.

## Build order (each step is usable on its own)
1. The kinds themselves: the four cards, the tag, the database change, the Couple limit.
2. Couple: the one line and the three buttons.
3. Trip: dates, summary, close and reopen.
4. Flatmates: the usual split.
5. Family: This month summary.

## Open questions
- Is **Flatmates** right, or would you rather call it **Home** or **Roommates**?
- For Flatmates, is a fixed percentage split enough, or do you also want a fixed rupee amount for one person (for example
  "Raj always pays ₹12,000 of the rent")?
- Should a Couple's balance be shown on the Overview tile too?

## How we know it works
- Unit tests for the summaries, the usual split and the Couple buttons' shares (always adding up to the amount in paise).
- Row-level-security tests on a scratch Postgres for the two limits and the closed trip.
- In the browser: make one group of each kind, add expenses, close the trip, try a third person on a Couple.

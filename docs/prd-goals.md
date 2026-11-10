# PRD: Goals and a plan

## Problem
The Plan page shows a "Net worth and goals" block, but only figures imported from the spreadsheet. There is no way to make a
goal in the app, see how far along it is, or ask "what do I need to set aside each month to get there?".

## Goal
Make short-term and long-term goals in the app, see progress at a glance, and generate a plan: what to set aside each month
for each goal, and whether the Saving budget covers it.

## Decisions (the owner's answers, 2026-11-10)
- **A goal** is a name, a target amount and a target date, plus an optional amount already saved.
- **Short or long term is automatic, by the date:** within 12 months is short term, later is long term. A goal moves from
  long to short by itself as time passes. Nothing to choose.
- **Progress comes both ways:** (1) manual top-ups (an amount and a date, for money set aside outside Money Log), and
  (2) automatically from payments logged in a category the goal is linked to (for example Emergency fund or Savings).
- **The plan** gives a monthly amount for each goal and says whether the Saving budget covers the total.

## What a person sees
- **Goals page** (`/goals`): a short-term list and a long-term list. Each goal shows its name, `saved of target`, a progress bar,
  the date and how many months are left, and a one-line state: on track / needs ₹X a month / date passed / reached.
- **Making or editing a goal:** name, target, date, amount already saved (optional), and an optional category whose payments
  count towards it (a picker from the person's categories).
- **Add to a goal:** a top-up with an amount and a date; a top-up can be removed (swipe left, like the due list).
- **The plan** (a card at the top of the Goals page): per goal, the monthly amount; the total a month; and one sentence against
  this month's Saving budget: "Your Saving budget of ₹30,000 covers it, with ₹4,000 to spare" or "It is ₹6,500 a month short".
- **Overview tile:** the nearest short-term goal's progress, opening the Goals page. No goals: a short invitation to make one.
- The Plan page links to Goals; the existing imported "Net worth and goals" figures stay as they are.

## Rules
- **Saved so far** = the optional starting amount + the manual top-ups + (if a category is linked) the payments in that category
  dated on or after the day the goal was made. The two sources are separate by design, so nothing is counted twice, as long
  as a saving is logged as a payment *or* added as a top-up, not both. The goal's page says so.
- **Remaining** = target − saved, never below zero. A goal with nothing remaining is "reached" and drops out of the plan.
- **Months left** = the months from this month to the target date's month, counting this month, at least 1.
  **Monthly amount** = remaining ÷ months left, rounded up to the next rupee. A goal whose date has passed with money still to
  go shows "date passed" and is not in the monthly plan until its date is changed.
- **Does the budget cover it:** the Saving group's planned amounts for this month (the app's own budgets, or the spreadsheet's
  where it covers the month) against the plan's total.
- Amounts follow the app's rules (rupees, at most 2 decimals, positive). At most 30 goals and 500 top-ups.
- Goals are private to the person, like their budgets. Sharing goals in a group is not part of this.

## Storing and syncing
Goals and top-ups are made in the app, so they sync the way the categories and the recurring payments do: one block, merged
item by item, the latest change to each item wins, so two phones never overwrite each other. Top-ups are items of their own,
not a list inside a goal, so two phones adding a top-up at once keep both. Removing is a mark (the same idea as the due list).
Backup and restore include goals.

**Database:** one SQL change for the owner, the same shape as the recurring payments one: allow the new block name `goals`
in `plan_blocks_block_known`. Tested on a scratch Postgres first; `supabase/schema.sql` gets the same line and is safe to run
again.

## Not in this version
- Sharing goals with a group or a partner.
- Automatic reminders, notifications, or a goal in the calendar file.
- Charts of progress over time (that belongs to the analytics item, last).
- Interest, inflation, or investment returns: the plan is plain division, and says so.

## Build order (each step usable on its own)
1. The goals data: model, merge and sync as a block, backup, the database line, tests.
2. The Goals page: list by term, make, edit and remove a goal, progress from the starting amount and the linked category.
3. Top-ups: add and remove (swipe).
4. The plan card: monthly amounts and the Saving-budget check, with its tests.
5. The Overview tile, links from Plan, README, release number.

## Decided while building
- A goal's one-line state is **reached**, **date passed**, or **needs ₹X a month**. ("On track" was dropped: with no
  schedule to compare against, it would have been a guess.)
- A goal cannot be made with an amount already saved that equals or passes its target: it would already be reached.

## Open for the owner (defaults in bold, change any of them)
- The page lives at **`/goals`**, reached from the Plan page and the Overview tile (not a new bottom-bar button).
- **Twelve months** is the line between short and long term.
- The Overview shows **one tile** (the nearest short-term goal), not one per goal.

## How we know it works
- Unit tests: term by date (including the day it flips), saved from the three sources, months left, the monthly amount and
  rounding up, a passed date, a reached goal, the budget check both ways, merge and sync of goals and top-ups, backup.
- Access rules on a scratch Postgres for the new block name, and an upgrade from a 1.9 database.
- In the browser: make goals of both terms, link a category and log a payment in it, add and remove a top-up, generate the plan,
  change the budget and see the sentence change, sync between two sessions.

# PRD: Hisaab 2.2 — repeats in a group

**Status:** approved by the owner on 2026-11-27 ("Build 2.2 as drawn"), after the screens were drawn on the design canvas (Claude Design, artifact "Hisaab", version 43, row "Repeats in a group": `GroupRepeat`, `GroupRepeatLogged`, `GroupRepeatDark`, `GroupRepeatDesktop`, `RepeatAdd`, `RepeatSheet`, `RepeatEdit`). Built on the branch `version/2.2`, from `main` at 2.1.0. One SQL section (*Version 2.2: Repeats in a group*) that the owner runs once on the live project.

## The owner's words
1. "me and one of my flatmate friend share the recurring payments like room rent … 15000 … my share is 9k and his share is 6k, how can i add this" (2026-11-27).
2. "Design first, ship as 2.2" (2026-11-27), then "Build 2.2 as drawn" (2026-11-27).
3. Shared-goal invitations while Plan is off: proposed with the 2.2 plan ("keep them in the bell anyway, with a button that turns Plan on and opens the goal … unless you say otherwise, I'll build it that way"); the owner answered "Build 2.2 as drawn".

## Decisions
- **Setting one up.** In Add a shared expense, *Repeat every month* now works with a split (it was for private payments only). The note under it: "It comes up in Flat 302 on the 1st each month, paid by you and split the same way. Either of you can log it with one tap." Saving adds this month's expense now and sets it up from next month ("Saving adds this month's rent now, and sets it up for next month."). The day is the expense's day; a short month uses its last day. Setting one up needs a connection: offline, the expense is still saved and the toast says it could not be set to repeat.
- **The group page** gets *Every month* (above Balances; the left column on a wide screen) when the group has repeats: one card each, with its name, a tag, "On the 1st · you pay · You ₹9,000, Aakash ₹6,000", the amount and a ⋯ button.
  - *Due* (its day has come this month and the month is not done): the card is outlined, the tag says *Due today* (or *Due since 1 Dec*), with **Log December** and **Skip this month**, and the note "Either of you can log it, and it counts once for December, whoever taps first. Paid a different amount this month? Log it, then change that expense."
  - *Logged*: the tag *December logged* and a line saying who logged it, who paid and your share, and the next date.
  - *Skipped*: the tag *December skipped* and the next date. *Not due yet*: the tag *Next on 20 Dec*.
- **Counts once.** Logging adds the group expense on the server, with this month's date, the payer and the split, in one step that also marks the month done. A second tap (on any phone) is refused with "December is already done" and the list refreshes. Only this month is offered, as with private repeats: a month the app was not opened in is not offered later.
- **Who can act.** The people in it (the payer and everyone with a share) can log, skip, change and stop it; the rest of the group sees it. This is the rule expenses already follow (you record only what you paid or share in). Whoever changes the split stays in it, so nobody can move a debt onto others and step out. A group admin can also stop one, so a repeat whose people have all left can still go.
- **The ⋯ sheet**: "Flat 302 · every month on the 1st · set up by you", "Rent · ₹15,000", then *Change the amount, day or split*, *Skip December* (the next month not yet done) and *Stop repeating* (asks first). "Either of you can change, skip or stop it, and the other sees a note. Stopping keeps every month already logged."
- **Changing** the amount, day or split applies from the next month not yet done; changing the amount scales the shares in proportion, and each share can be typed. "From January. December and earlier stay as they were logged."
- **Notes.** Setting one up, changing, skipping and stopping show in *since you last opened* for the others ("Aakash skipped Rent for December"); a logged month shows as the new expense. History lines of logged months say "Every month · logged by Aakash · you paid ₹15,000".
- **Edge cases.** A closed trip refuses logging. When someone in it has left the group, logging is refused until the split is changed (or, if the payer left, it is stopped). A logged expense is an ordinary expense: its logger can change or delete it; deleting it does not offer the month again.
- **Limits.** 20 active repeats per group (200 rows per group, stopped ones included); the split follows the expense rules (at most 30 people, shares in rupees and paise that add up to the amount).
- **Shared-goal invitations while Plan is off** show on the bell: "Aakash invited you to a shared goal: Goa trip", with *Turn on Plan and open*. With Plan on, nothing changes (they show on Plan, as now).

## Data (SQL: *Version 2.2: Repeats in a group*)
- `group_repeats`: id, group, category, note, amount, day (1–31), paid_by, shares (as on an expense), `done_through` (the last month logged or skipped), who set it up, the last change (`change` add/edit/skip/stop, `change_month`, `changed_by`, `changed_at`; a logged month is told by its expense), `stopped_at`, `synced_at`. Members of the group read it (row-level security); nobody writes it directly.
- `entries` gets `repeat_id` and `repeat_month`, set only by the functions below (they run as the schema's owner; a user's own request is refused), never changed afterwards, and unique per repeat and month among live expenses.
- Functions (security definer, signed-in only): `add_group_repeat` (the repeat and this month's expense, in one step), `log_group_repeat`, `skip_group_repeat`, `edit_group_repeat`, `stop_group_repeat`. Each locks the repeat row, checks the caller is a current member and in the repeat, and checks the month is this month in some time zone on earth (a skip may also be next month); a month is logged from its day on. The expense goes through the same checks as any expense (the triggers on `entries`).
- The app reads `group_repeats` with the groups on every sync; before the SQL is run it reads nothing and shows no repeats.

## Pull request (into `version/2.2`)
One branch, `feat/group-repeats`, in three commits:
1. This PRD, the SQL with its access tests, the logic and the sync.
2. The screens: Add a shared expense, *Every month* on the group page, the sheet, the notes and the history lines.
3. Shared-goal invitations on the bell while Plan is off, and the release (2.2.0, README, the what's-new card).

## Not in this plan
- A bell or Overview reminder when a group repeat is due (not drawn; the group page shows it).
- Logging a month that was missed, and repeats other than monthly.
- Changing who pays (stop it and set it up again).

## Risks
- **A phone still on 2.1** shows logged months as ordinary expenses and no *Every month* section; nothing breaks.
- **Logging needs a connection**, unlike adding an expense. The button says so when offline.

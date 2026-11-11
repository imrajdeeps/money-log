# PRD: A notification center in the app

**Status:** built in version 1.24.0 (2026-11-11), from decisions taken in a question round with the owner.

**As built:** the rules are as written below. One change: a notification is dismissed with a cross button (also reachable by keyboard)
rather than by swiping left, because the swipe row's delete button says "Delete" and a dismissal deletes nothing.

## Problem
Things that need attention are spread over the app: the due list is on Plan, budgets are on Month, goals on Plan, group balances on
Groups, and nothing says that a backup is old or that changes are not reaching the cloud. The person has to open each page to find out.

## Goal
One bell in the top bar with a count, opening a page that lists everything that needs attention now, most urgent first, each with a
button that opens the right screen. It is worked out on the phone from data it already holds, so **no server and no database change
are needed and it works on the free Supabase plan**.

## The owner's decisions (2026-11-11)
- **Include:** due items; recurring payments waiting; budgets near or over their limit; goals; group balances; a reminder to update
  net worth; a reminder to download a backup; sync problems.
- **Due items** show **3 days before** the date, on the day, and every day they are overdue.
- **Budgets** appear at **80 percent used** (the "nearly used" wording the Month page already uses) and when **over**. **Goals** appear
  **30 days before their date** and when **behind**.
- **Where:** a **bell in the top bar** (on every page) with a count, opening **its own page** (`/notifications`).
- **Dismissing:** a dismissed notification is hidden for good **and the dismissal syncs to the other phones**. It comes back only when
  the situation changes (see the keys below).
- **Settings:** a *Notifications* part under Settings with **one switch per kind**; the switches sync too.

## What is in the list (rules, in `core/notifications.ts`, pure)
Each notification has a **kind**, a **key** (what a dismissal refers to), a **tone** (attention / soon / reminder), a title, a one-line
detail and where it opens. The list is sorted attention, then soon, then reminder, and inside each by date or size.

| Kind | Appears when | Key (a new key brings it back) | Opens |
| --- | --- | --- | --- |
| Due item | not done, and overdue, due today or due within 3 days | `due:<id>:<overdue \| today \| soon>` | Plan, due list |
| Recurring payment | this month's day has come and it is neither logged nor skipped | `rec:<id>:<month>` | Settings, Recurring payments |
| Budget | a category with a budget has used 80 percent or more of this month's budget (over: stronger wording) | `bud:<category>:<month>:<near \| over>` | Month |
| Goal | not reached, and its date is within 30 days or has passed, or it is behind (the share of time gone since it was made is more than 25 points ahead of the share saved) | `goal:<id>:<month>` | Plan, goals |
| Group balance | in a group with company, you are owed or you owe at least ₹1 | `grp:<id>:<owed \| owe>` | that group |
| Net worth | the latest update is more than 30 days old (nothing entered yet: no reminder, the Overview tile already invites) | `networth:<month>` | Plan, net worth |
| Backup | no backup downloaded for 30 days and the phone holds payments (the free plan keeps no database backups) | `backup:<month>` | Settings, Backup |
| Sync | changes have been waiting more than a day, or the last sync failed | `sync:<day>` | Settings, Cloud sync |

## What a person sees
- **The bell:** an icon beside the sync pill; a small count of what is shown (undismissed, from the kinds that are on), `9+` above nine,
  nothing when there is none.
- **The page:** a heading, then the list in three groups (*Needs attention*, *Coming up*, *Reminders*). A row: a coloured mark, a title
  ("Renew passport is overdue by 2 days"), a line of detail, an **Open** button, and a dismiss button (also swipe left like other lists).
  Empty: "Nothing needs you right now." A line at the bottom says what is switched off and links to Settings.
- **Settings, Notifications:** one switch per kind with a one-line example; all on by default.

## Where it is kept
- **Dismissals** and the **switches** are items in the existing `goals` block (kinds `k` for a dismissed key and `s` for the switches,
  the latter one item with a fixed id), merged per item, latest change wins, in the backup file. **No new SQL.** A dismissal older than
  90 days is dropped when a new one is written, and the list is capped at 500.
- **When a backup was last downloaded** is kept on the phone (`localStorage`), set by Settings, Backup.
- **Nothing is stored for the list itself:** it is recomputed from the data whenever the data or the day changes.

## Not in this version
- A buzz or banner when the app is closed. That needs **web push**, which needs a server and a provider; the free plan can hold the
  subscriptions but cannot send. If it is wanted later it is its own item.
- A badge on the app icon, email or WhatsApp messages.
- Changing the thresholds (3 days, 80 percent, 30 days); they are fixed for now.

## Risks and questions
- **Noise:** eight kinds can pile up. Mitigations: sorting, grouping, dismiss for good, and the switches.
- **The count must be cheap:** it is computed from data already in memory, once per change, not on every render.
- **A phone with an old version** (cached app) drops unknown items of the goals block when it syncs; the owner updates the app, and
  the same applies to every earlier change of this kind.
- **Translations:** every text needs Hindi and Hinglish (the dictionaries test enforces it), including the detail lines with numbers.
- **Tour:** a what's-new step for 1.24.0.

## Checks
- Unit tests for every rule (edges: exactly 3 days, 80 percent, 30 days, month change, done items, removed items), the keys, sorting,
  the dismissal merge, the 90-day trim, the switches, and a backup round trip.
- A sync test: a dismissal on one phone hides the notification on the other.
- Browser check at phone and wide width, light and dark, English and Hindi: bell and count, the page, dismiss, switches.

# PRD: goal delete, payment sorting, a simpler group page, a Circle, primary admin, shared goals

**Status:** draft for the owner's review (2026-11-14), from nine requests and one question round. Nothing is built. Three versions, each usable on its own.

## The owner's words (2026-11-14)
1. "currently there is no way to delete a goal, user should be able to delete a plan, ask confirmation before delete."
2. "there should be a option to create a share goal with friends"
3. "there should an option to add friends in the app"
4. "the groups members should automatically we be in the friends list, even better if we use a better naming for friends"
5. "there should be primary admin feature in the groups"
6. "the admin can only remove the members from a group once there dues amount is sorted in groups"
7. "recents logs added should be sorted by dates by default, but user can sort it differently and store that in local storage no backend sorting"
8. "groups page look bit complex, simplify, put the common things in the group settings button; group setting should be per group"
9. "group setting -> Invite people, Usual split"

## What the code already does (found while reading)
- **Goals can be deleted today**, by sliding a goal to the left (`GoalRow`, `removeGoal`). It is invisible: nothing on the goal says so, and no confirmation is asked. So point 1 is a visible Delete button plus a confirmation, not a new capability. "Plan" is read as "goal": the Plan page is worked out from the goals and has nothing of its own to delete.
- **Admins exist** (`group_members.role`, `make_admin`, several admins per group), and a group's creator is stored (`groups.created_by`). What is missing is a *primary* admin.
- **Point 6 is already enforced by the database**: `remove_member` refuses unless the person's balance is zero, and the Remove button is disabled. The gap is that the reason shows only as a hover tooltip, which a phone never shows. The fix is visible text, plus making the rule a stated part of the primary-admin design.
- **Recent payments** are ordered by when they were added (`byRecent`), not by the date of the payment.

## Version 1.27 — no database change
### Delete a goal (point 1)
- The goal's edit screen gets a **Delete goal** button (danger style) at the bottom. It asks: "Delete {name}? Its top-ups go with it. This cannot be undone." with *Delete* and *Keep*.
- Sliding left and tapping the trash asks the same question first. The "slide to remove" hint stays.
- Top-ups already go with the goal (`removeGoal`); this does not change.

### Sort the recent payments (point 7)
- A **Sort** control on the Recent sheet and All payments: *Date, newest first* (default), *Date, oldest first*, *Amount, high to low*, *Amount, low to high*, *Category A to Z*, *Last added*. Ties in date go by when added, newest first.
- The choice is kept **on this phone only** (`localStorage`, one key, wrapped in try/catch so a blocked store means "default"). Not synced, not in the backup, no database.
- The Overview tile keeps showing the latest few by date; the sort applies where the control is shown.
- *Changed on purpose:* the default moves from "last added" to "date of payment", as asked. A payment typed late for an old date now sits where its date puts it.

### A simpler group page and a Group settings button (points 8 and 9)
- The group page keeps what people open it for: the name and kind, **Balances**, **To settle up**, **Record a payment**, and the list of expenses.
- A **Group settings** button at the top right opens settings **for that group** (a route under the group, `/groups/<id>/settings`; nothing is shared between groups). It holds, in this order:
  - **Invite people** (code, link, copy, new code; admin only, as today).
  - **Usual split** (flatmates groups; admin only to change, as today).
  - **Trip settings** (trip groups: dates, close and reopen; as today).
  - **People**: the list with roles, rename yourself, make admin, remove (with the settle-up reason written out).
  - **Leave this group** (with the settle-up reason).
- The owner named Invite people and Usual split. People, Trip settings and Leave are moved too so the main page really gets lighter; say if any should stay on the main page.
- Nothing is removed or renamed; only moved. Members who are not admins see only what applies to them.

## Version 1.28 — SQL needed: primary admin and the Circle
### Primary admin (points 5 and 6)
- **The creator of a group is its primary admin.** Shown as *Primary admin* in People.
- The primary admin **cannot be removed and cannot be made a plain member**, and **cannot leave** until they hand the role to another current member (**Make primary admin**, which asks for confirmation).
- Other admins keep what they have (invite, remove members once settled). **Only the primary admin** can make or take away admin rights and hand over the primary role.
- **Removing a member needs a zero balance** (point 6, kept as is). When it is not zero the button stays and says why in words: "They must settle up first: they are owed ₹… / they owe ₹…".
- Groups that exist now: the primary admin is set from `created_by`. If that person has left or the account is gone, the longest-standing current admin becomes primary. The old rule "the next person to join an admin-less group becomes admin" stays as the last resort.
- Data: one column on `groups` (the primary admin's id), changed only through database functions (`make_primary_admin`; `make_admin`, `remove_member` and `leave_group` updated), with new access tests.

### The Circle (points 3 and 4; the name is the owner's choice)
- **Circle** is the list of people you can share with: **everyone you share a group with is in it automatically**, and you can **add a person by link or code** (same idea as a group invite: you send a link, they open it, you are both in each other's Circle). No search by email or name, so nobody can look up who has an account.
- A **Circle page** (in the menu): the people, how each came in (group name, or added by link), **Add someone** (link and code, copy), **Remove from my Circle**, and, per person, **Start a group** and **Share a goal** (the second arrives in 1.29).
- Removing someone removes the link both ways. A person you still share a group with stays listed through that group until one of you leaves it.
- **What a Circle member can see of you: your name only** (the name from your Profile, or your name in the group they know you from). Never your email, number, entries or goals.
- Limits: 100 people per Circle, 10 live Circle codes per person; a code works for 7 days and for one person to join (then it is spent).
- Data: a `circle_links` table (a pair of people), a `circle_invites` table (code, owner, expiry), and functions to join, remove and list. A person's Circle is read through a function (explicit links plus people from shared groups), not a table that could drift out of date.

## Version 1.29 — SQL needed: shared goals
### What it is (point 2)
One pot, many people: **one target and date; each person logs their own top-ups; everyone in it sees the total, the bar, and each person's top-ups.** Nobody sees anyone's other money.
- Made from the Goals page (**New shared goal**) or from a person in the Circle. The creator picks people **from the Circle**; each gets an **invitation** (on the Goals page and in the notification bell) and joins only by accepting. Declining or ignoring it changes nothing for them.
- **Roles:** the creator edits the goal and the date, removes a person (their top-ups stay in the history, shown as left), and deletes the goal. Every member adds and removes **their own** top-ups and can leave.
- **Delete** asks for confirmation and says everyone loses the goal. Leaving asks too.
- A shared goal sits in its own **Shared** section of the Goals page. It is **not** added to your private plan, net worth or any private total, so nothing is counted twice; the private goals page, the Plan and the backup keep working as they do.
- Limits: 10 people per shared goal, 20 shared goals per person.
- The backup file carries only your private goals. Shared goals live on the server (they cannot be shared otherwise) and need sign-in and sync. Without sign-in the section explains that.
- Data: `shared_goals`, `shared_goal_members`, `shared_goal_topups`, `shared_goal_invites`, with access rules: a member reads the goal and its members and top-ups; a person writes only their own top-ups; the creator changes the goal; a non-member sees nothing.

## Not in this plan
- Real money moving between friends (the app only notes what happened, as for group payments).
- Chat, comments or reminders to friends; push messages (the app has none).
- A refund or a shared goal feeding the private plan or net worth.
- Friends found by email, phone number or name search.

## Risks and questions
- **Privacy is the main risk of 1.28 and 1.29**: the Circle and shared goals are the first places where one person's data reaches another outside a group. Each function returns only the minimum (a name and an id); the access tests must prove a stranger and a former member read nothing.
- **A second, independent look at the database design is a gate** before the SQL for 1.28 and again for 1.29 is run: it is hard to undo once people use it.
- **Existing groups** change meaning slightly in 1.28 (a primary admin appears). The live database held 45 entries on 2026-11-13 (groups not counted yet); the backfill is checked on a copy first and run only with the owner's yes.
- **Translations:** every new text needs Hindi and Hinglish; the name "Circle" is kept as an English word in Hindi, as other app words are (to confirm).
- **Sonar:** `GroupDetail.tsx` is already on the complexity list; moving sections into settings components is the chance to pull it down, not push it up.

## Checks
- 1.27: unit tests for the sort orders and the saved choice (including a blocked store); the delete confirmation in the browser at phone width; the group page and settings route for admin and for member, for each group kind.
- 1.28 and 1.29: the SQL on a local Postgres with access tests (own, other member, stranger, former member, anonymous), then on the live project after the owner's yes with a rolled-back test.
- Browser checks at phone and wide width, light and dark, English and Hindi, with the stand-in server.

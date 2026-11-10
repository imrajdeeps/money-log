# Money Log

A small installable web app (PWA) for logging payments in about five seconds and seeing the month against your
spreadsheet plan. Release 1 is the quick log, month vs budget, cloud sync with email-code sign-in, and export to the
spreadsheet's Log tab. Release 2 adds shared groups (a family group, trip groups) with splits and settle-up, a due list
with a calendar file, and a net worth and goals snapshot. It works on iPhone and Android, and offline.

The repository holds code only. Your plan numbers, balances and payments never go in it; they live on your phone and
in your own Supabase database.

## What you set up once

You need a free Supabase account and a GitHub account. Names of menus may differ slightly from what is written here.

### 1. Supabase (the database and sign-in)

1. Create a new project. Note the project URL.
2. **SQL Editor:** paste and run `supabase/schema.sql`. Read it first; nothing in this repository applies it for you.
   Run it as the default `postgres` role (the SQL Editor does). It is safe to run again, and **if you already ran the
   Release 1 version, run this one on top of it**: it adds the groups and keeps your data.
3. Paste and run `supabase/rls_tests.sql`. The last message must be `ALL ACCESS TESTS PASSED`. It uses fake users,
   groups and rows inside a transaction that is rolled back, so nothing is kept. Run it again after every change to
   `schema.sql`.
4. **Authentication, email templates:** edit **both** the *Confirm signup* and the *Magic Link* templates so the email
   contains the 6-digit code, for example `Your Money Log code is {{ .Token }}`. A brand-new account's first email uses
   *Confirm signup*; every later one uses *Magic Link*. The app asks for the code, not a link.
5. **Sign-ups.** Turn **Allow new users to sign up** on **only while you are inviting someone**, and turn it off again
   once they have signed in once (people who already have an account keep working). Why it matters: the app's key is
   public by design, so while sign-ups are on a stranger can create an account on your project. Such an account can see
   none of your data and can store only a small, capped amount (see the security notes), but it is better left off.
   If you do not use groups at all, turn sign-ups off after your own first sign-in.
6. **Project settings, API:** copy the *Project URL* and the *publishable* (or *anon*) key. These two are public by
   design. **Never** copy the `service_role` or secret key into this project.

Supabase's built-in email sender has a low hourly limit. That is fine for occasional sign-ins because the session stays
on your phone; add your own email (SMTP) service in Supabase if you hit it.

### 2. GitHub (the website)

GitHub Pages on a free account needs a **public** repository, which is fine: it contains only code.

1. Create a repository, then push this folder to the `main` branch.
2. **Settings, Pages, Source:** choose *GitHub Actions*.
3. **Settings, Secrets and variables, Actions, Variables:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` with the two
   public values from step 1.6.
4. Push to `main` (or run the workflow by hand). It runs the tests, builds, and publishes to
   `https://YOUR-NAME.github.io/REPO-NAME/`. If you add or change the two variables later, run the whole workflow again
   (not just its failed step): the values are baked into the build. A pull request into `main` runs the same tests and
   build but publishes nothing; only a push to `main` (or running the workflow by hand) deploys.

**Keep this origin clean.** All sites under `YOUR-NAME.github.io` share one browser origin, so another page there
could read this app's stored data and sign-in. Do not host other sites you do not fully control under the same
GitHub account, or give this app its own account, organisation, or custom domain.

### 3. On your phone

1. Open the address from step 2.4. iPhone: use Safari, tap Share, then Add to Home Screen. Android: use Chrome, menu,
   Install app.
2. **Settings:** send yourself a code, sign in.
3. **Settings, Plan data:** paste the blocks from the spreadsheet (next section).

## Getting the plan from the spreadsheet

In your Money Plan v2 spreadsheet, the **App export** tab holds three blocks. Copy one, paste it in the app under
Settings, Plan data (or open a saved `.tsv` with *Choose a file*), check the preview, and import. The app recognises the
block by its header row. Importing replaces that block only and never touches payments. Copy a block again after you
change anything it depends on.

| Block | Copy | What it gives the app |
| --- | --- | --- |
| Budget | `A5` to `AL34` | The category list and the planned amount per month (Month tab). Needed first. |
| Due list | `A38` to `E66` | One-off payments (Inputs section 6, Active = Yes) and to-dos, with dates. |
| Net worth and goals | `A70` to `C79` | The snapshot on the Plan tab, labelled with the plan month. |

Keep such files out of this repository (`.gitignore` already skips `*.tsv`, `*.csv`, `*.xlsx` and backup files).

## Sending payments to the spreadsheet

Export tab, **Copy for Excel**, then in the spreadsheet's **Log** tab click column A of the first empty row and paste.
Then tap **Mark as exported**: it marks exactly the payments you just copied, so the next copy holds only new ones.
If you later edit or delete a payment that was already exported, the Export tab lists it under **Changed after export**,
because its spreadsheet row is now out of date and has to be fixed by hand.

The payment method is written at the start of the note, for example `[UPI] lunch`. Text that Excel might misread (it
starts with `=`, `+`, `-`, `@` or a quote, or looks like a date or number) gets a leading space so it stays plain text.

A **shared expense** is exported at **your share**, with the full amount kept in the note: `[UPI] dinner, my share of
1,800`. An expense you owe nothing on is not exported, and expenses other people made never are.

## Groups, splits and settling up

*Groups* tab. A group is a family or a trip, up to 20 people, and one person can be in several.

- **Make a group:** name it and say what others should call you. You become its admin.
- **Invite:** the group page shows a code (and a link that carries it). Send it only to people you mean to add. The code
  works for 7 days; *Make a new code* replaces it. The link keeps the code after the `#`, which browsers never send to
  any server. The person opens it, signs in (Settings) and confirms the join. This is where sign-ups must be on.
- **Share an expense:** on the Log tab pick the group under *Share with*, then who paid and how it is split:
  **Equal**, exact **Amounts**, or **Percent**. It is stored as exact rupee shares that add up to the amount. Everyone in
  the group sees the amount, category, note and date, and who paid. Only the person who made an expense can edit or
  delete it, and only while they are in the group. Your own budget counts only your share.
- **Settle up:** the group page shows each person's balance and the fewest payments that settle everyone. *Record a
  payment* notes that someone paid someone outside the app; the app never moves money. Either person can record a
  payment between them; only the person who recorded it can remove it.
- **Leaving:** you can leave once your balance is zero, and an admin can remove a member only at zero. Their earlier
  expenses stay. An expense or payment that names someone who has left is locked (its amount, split and deletion), so
  nobody's balance changes behind their back. If the only admin wants to leave, they hand over admin first.
- A shared expense must be one you paid or share in; nobody can record a debt between two other people.

Groups need a connection to create, join, leave or remove; expenses and payments inside a group can be added offline
like any other.

## Due list and calendar

*Plan* tab. **Due soon** lists the imported one-off payments and to-dos: overdue first, then by date, with a tick to mark
one done (marks sync between your phones and survive re-importing the same list; the spreadsheet stays the plan, so
tick items off there too). **Add to calendar** makes a calendar (`.ics`) file with an all-day event and an alert for each
dated item that is not done; by default the alert is 2 days before at 9:00, and you can change both. Opening the file
again later updates the same events instead of adding copies. Below it, **Net worth and goals** shows the imported
figures. They are the spreadsheet's numbers at the plan month shown; they do not change as you log payments.

## Updating the app

After a new version is published, open the app twice: the first open fetches the new files in the background, the
second one uses them.

## Backups

Settings, **Download backup** saves one JSON file with all *your own* payments (not other people's shared expenses),
the three plan blocks and the Done marks. Keep one in iCloud Drive now and then. **Restore** merges it back in (newer
copies win).

## Developing

```bash
npm ci           # install exactly the versions in package-lock.json
npm run dev      # local dev server (local-only mode unless you create .env.local, see .env.example)
npm test         # tests: logic, blocks, groups and splits, and sync against a stand-in for Supabase
npm run check    # type check
npm run build    # production build into dist/
```

`tests/mock-supabase.ts` is a small stand-in for the Supabase sign-in, REST and group-function endpoints the app uses.
It records how those APIs are understood to behave; it is not the real service. `npm run e2e:build` plus
`npm run e2e:serve` serve a build that talks to the stand-in, for checking in a browser.

Tests against your real spreadsheet export are skipped unless you point `MONEY_LOG_REAL_DIR` at the folder holding the
exported blocks (`MONEY_LOG_REAL_DIR=~/Finance npm test`); those files never go in the repository.

## Security notes

- The only secrets are the sign-in session tokens stored in this browser's IndexedDB. The page itself holds only the
  public Supabase URL and key.
- Every table has row-level security, and `supabase/rls_tests.sql` checks it. You read and write your own private rows
  and nothing else of anyone's. A shared expense or payment is readable by the current members of its group and changed
  only by its creator. Groups and memberships change only through database functions that check the rules (a valid code,
  an admin, a zero balance). The anonymous role has no access. The group functions run with the rights of the database
  owner, which must bypass row-level security (Supabase's `postgres` role does); the test script checks this.
- Members of a group see what they are meant to: the amount, category, note, date and payer of shared expenses, and each
  other's chosen names. They never see your private payments, your plan, or your email address. Recording a payment
  between two people needs no confirmation from the other: this is meant for groups of people who trust each other.
- Because the key is public and sign-ups are open while you invite people, each account is capped (20,000 payments and
  2,000 recorded group payments; plan data only under four known names; at most 10 groups made and 20 people per group),
  so a stranger's account cannot fill the free database. For stricter control keep sign-ups off except when inviting.
- **Do not delete a user in the Supabase dashboard** if they have shared expenses: it would delete their expenses and so
  change everyone else's balances (the database refuses it while others recorded them as payer). Ask them to leave their
  groups after settling up instead.
- A Content-Security-Policy limits the page to its own files and your one Supabase address. There are no third-party
  scripts, fonts, analytics or images.
- The service worker caches only this app's own files. Requests to Supabase are never cached.
- When two phones edit the same payment, the latest edit wins, on the phones and in the database alike (the database
  ignores a write older than the stored one). Sign out and Erase affect only the phone you use them on.
- Packages are installed with a lockfile and without install scripts. Workflow actions are pinned to major versions;
  pin them to commit SHAs if you want stricter supply-chain control.

## Not yet built

Receipt photos (Release 3). Your own budget does not count the part of someone else's expense that you owe until you
log it yourself. There are no push notifications: reminders are the due list and the calendar file.

# Money Log

A small installable web app (PWA) for logging payments in about five seconds and seeing the month against your
spreadsheet plan. Release 1 is the quick log, month vs budget, cloud sync with email-code sign-in, and export to the
spreadsheet's Log tab. Release 2 adds shared groups (a family group, trip groups) with splits and settle-up, a due list
with a calendar file, and a net worth and goals snapshot. Release 3 adds receipt photos, the edit history of shared
expenses, a one-tap "add my share to my budget", an optional PIN lock, and a Method column for the spreadsheet's Log tab.
Release 4 gives the app its own categories and budgets, so importing the spreadsheet is optional.
It works on iPhone and Android, and offline.

The repository holds code only. Your plan numbers, balances and payments never go in it; they live on your phone and
in your own Supabase database.

## What you set up once

You need a free Supabase account and a GitHub account. Names of menus may differ slightly from what is written here.

### 1. Supabase (the database and sign-in)

1. Create a new project. Note the project URL.
2. **SQL Editor:** paste and run `supabase/schema.sql`. Read it first; nothing in this repository applies it for you.
   Run it as the default `postgres` role (the SQL Editor does). It is safe to run again, and **if you already ran the
   Release 1, 2 or 3 version, run this one on top of it**: it adds what is new and keeps your data. It also creates the
   private Storage bucket `receipts` for photos (free plan: 1 GB of file storage, 50 MB largest upload; the bucket is
   limited to 1 MB JPEG files).
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
3. Start logging. Nothing has to be imported: the app has its own categories (see the next section). If you also keep the
   spreadsheet, **Settings, Spreadsheet plan:** paste its blocks (the section after that).

## Categories and budgets

The app starts with a short list, grouped as the spreadsheet groups them: **Spending** (Rent, Groceries, Eating out,
Transport & fuel, Bills, Shopping, Health, Other), **EMI** (Loan EMI), **Family** (Family support) and **Saving**
(Savings).

- **Add your own** with *＋ New category…* at the end of the category list on the Log tab (or in the edit dialogs), or in
  *Categories and budgets* on the Month tab. Pick the group it belongs to. A name that only differs in capitals or spaces
  from an existing one counts as the same category.
- **Remove** any category you do not use (the ✕ in *Categories and budgets*). It only leaves the pick list; payments already
  logged keep it and show under "Not in your categories". Add the same name again to bring it back.
- **Budgets:** in *Categories and budgets*, give a category a monthly amount (empty = none). It applies to every month. A
  category with no budget shows "no budget" instead of "over".
- Your categories and budgets sync between your phones (the latest change to each category wins) and are in the backup file.

## Getting the plan from the spreadsheet (optional)

If you also keep the Money Plan v2 spreadsheet, its **App export** tab holds three blocks. Copy one, paste it in the app
under Settings, Spreadsheet plan (or open a saved `.tsv` with *Choose a file*), check the preview, and import. The app
recognises the block by its header row. Importing replaces that block only and never touches payments. Copy a block again
after you change anything it depends on.

**The budget block merges with what is in the app, it does not replace it.** A category the spreadsheet lists keeps the
spreadsheet's spelling, group and planned amount for the months the spreadsheet covers (the amount you set in the app is
ignored for that category in those months, and used again for months the spreadsheet does not cover). Categories the
spreadsheet lacks stay as they are, with their app budgets, so a built-in such as "Eating out" can sit beside the sheet's
"Eating out / food orders": remove the one you do not want.

| Block | Copy | What it gives the app |
| --- | --- | --- |
| Budget | `A5` to `AL34` | The spreadsheet's categories, groups and planned amount per month (Month tab). |
| Due list | `A38` to `E66` | One-off payments (Inputs section 6, Active = Yes) and to-dos, with dates. |
| Net worth and goals | `A70` to `C79` | The snapshot on the Plan tab, labelled with the plan month. |

Keep such files out of this repository (`.gitignore` already skips `*.tsv`, `*.csv`, `*.xlsx` and backup files).

**Names must match for Export.** The spreadsheet adds payments up by the categories on its Budget tab (its Inputs tab
holds the list); its Log shows NOT IN LIST for any other name and Budget and Tracker leave that payment out. After you
import the budget block, the Export tab names the categories in the rows it is about to copy that the spreadsheet does not
have, so you can add them there or change the payment's category. Without an imported plan the app cannot know what the
spreadsheet holds and only reminds you of this.

## Sending payments to the spreadsheet

Export tab, **Copy for Excel**, then in the spreadsheet's **Log** tab click column A of the first empty row and paste.
Then tap **Mark as exported**: it marks exactly the payments you just copied, so the next copy holds only new ones.
If you later edit or delete a payment that was already exported, the Export tab lists it under **Changed after export**,
because its spreadsheet row is now out of date and has to be fixed by hand.

The payment method is written at the start of the note, for example `[UPI] lunch`, unless your Log tab has a **Method
column**: the current `Rajdeep - Money Plan v2.xlsx` does (Date, Category, Amount, Method, Note, then the Month and Group
formulas). Tick *My spreadsheet's Log tab has a Method column* on the Export tab and the copy becomes five columns, with
the note free of the prefix. It is off by default, so an older Log tab with four input columns keeps working; paste only
into a Log tab whose columns match the box. Text that Excel might misread (it starts with `=`, `+`, `-`, `@` or a quote, or
looks like a date or number) gets a leading space so it stays plain text.

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
- **Add my share to my budget:** tap someone else's expense and the button logs your share as a payment of your own
  (you pick the category), so your Month view and Log export include it. It does not change the group's balances, and
  the button is not offered twice for the same expense.
- **History:** a shared expense keeps a list of who created, changed or deleted it and what changed (amount, split, payer,
  category, note, date). It is kept in the cloud (needs a connection to open), only for groups with two or more people,
  the latest 100 changes per expense. An expense made private again leaves only "taken out of this group", never its values.

Groups need a connection to create, join, leave or remove; expenses and payments inside a group can be added offline
like any other.

## Due list and calendar

*Plan* tab. **Due soon** lists the imported one-off payments and to-dos: overdue first, then by date, with a tick to mark
one done (marks sync between your phones and survive re-importing the same list; the spreadsheet stays the plan, so
tick items off there too). **Add to calendar** makes a calendar (`.ics`) file with an all-day event and an alert for each
dated item that is not done; by default the alert is 2 days before at 9:00, and you can change both. Opening the file
again later updates the same events instead of adding copies. Below it, **Net worth and goals** shows the imported
figures. They are the spreadsheet's numbers at the plan month shown; they do not change as you log payments.

## Receipt photos

On the Log tab, **Take photo** or **Choose photo** before saving, or add and remove them later when you edit a payment (up
to 3 photos per payment). Each photo is drawn again at most 1,600 pixels on its longest side and saved as JPEG under 1 MB,
which also removes its location, camera and time. It is saved on the phone first, shows *Waiting to upload* until it has
reached your private Supabase Storage, and works offline. Photos of a **private** payment are visible only to you; photos of
a **shared** expense are visible to the members of that group, and stop being visible to them the moment the expense is made
private again or deleted. Deleting a payment deletes its photos, and the app then removes the files from Storage.

Limits: 3 photos per payment, 300 photos per account (each at most 1 MB, so at most 300 MB; the app counts photos because the
database cannot see real file sizes), and the free plan's 1 GB for the whole project. Settings shows the space used by every
photo you can see and warns at 80%. Photos are not in the backup file or the spreadsheet export. Because Storage files can
only be removed through the Storage service, a payment cannot be hard-deleted in the database while its photos' files remain,
and deleting a user in the dashboard leaves their files behind (see the security notes).

## App lock

Settings, *App lock*: a 4 to 8 digit PIN. The app starts covered by a PIN screen and covers itself again when you come back
after the time you choose (every time, after 1 minute, or after 5 minutes). After 4 wrong tries each further one makes you wait
longer (30 seconds, then 1, 2, 4... up to 15 minutes). It is a privacy screen, **not encryption**: the data stays readable in
this browser's storage to anyone who can open its developer tools, so your phone's own lock is what protects it. A forgotten PIN
cannot be recovered: you erase this phone's copy and sign in again (what is in the cloud stays).

## Updating the app

After a new version is published, open the app twice: the first open fetches the new files in the background, the
second one uses them.

## Backups

Settings, **Download backup** saves one JSON file with all *your own* payments (not other people's shared expenses),
the three plan blocks, the Done marks and your categories and budgets. It does not include receipt photos. Keep one in iCloud Drive now and then. **Restore** merges it back in (newer
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
  2,000 recorded group payments; plan data only under five known names; at most 10 groups made and 20 people per group),
  so a stranger's account cannot fill the free database. For stricter control keep sign-ups off except when inviting.
- Receipt photos: the Storage bucket `receipts` is private, JPEG only, 1 MB per file. A file can be uploaded only into your
  own folder and only for a photo you declared first; you can read your own files and those on shared expenses of groups you
  are in; you can remove only your own. Declaring a photo needs a payment of yours, and the 300-photo cap and the "purged only
  once the file is gone" rule stop an account from hiding stored files to make room for more. These rules are tested against a
  stand-in for Storage, not the real service, so check one upload, one view and one delete on your own project first.
- **Do not delete a user in the Supabase dashboard** if they have shared expenses or receipt photos: it would delete their expenses and so
  change everyone else's balances (the database refuses it while others recorded them as payer). Ask them to leave their
  groups after settling up instead.
- A Content-Security-Policy limits the page to its own files and your one Supabase address. There are no third-party
  scripts, fonts, analytics or images.
- The service worker caches only this app's own files. Requests to Supabase are never cached.
- When two phones edit the same payment, the latest edit wins, on the phones and in the database alike (the database
  ignores a write older than the stored one). Sign out and Erase affect only the phone you use them on.
- Packages are installed with a lockfile and without install scripts. Workflow actions are pinned to major versions;
  pin them to commit SHAs if you want stricter supply-chain control.

## Not built

Push notifications (reminders are the due list and the calendar file).

# Money Log

A small installable web app (PWA) for logging payments in about five seconds and seeing the month against your
spreadsheet plan. Release 1 is the quick log, month vs budget, cloud sync with sign-in, and export to the
spreadsheet's Log tab. Release 2 adds shared groups (a family group, trip groups) with splits and settle-up, a due list
with a calendar file, and a net worth and goals snapshot. Release 3 adds receipt photos, the edit history of shared
expenses, a one-tap "add my share to my budget", an optional PIN lock, and a Method column for the spreadsheet's Log tab.
Release 4 gives the app its own categories and budgets, so importing the spreadsheet is optional. Release 5 adds email and
password sign-in, account creation and session controls (email and password only, so no email is needed). The home screen is a
dashboard of tiles, each opening its details in a sheet, with a **+ Add expense** button always one tap away.
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
3. Paste and run `supabase/rls_tests.sql`. It must finish with no error and show a result table that says
   `ALL ACCESS TESTS PASSED` (the SQL Editor does not display the script's progress notices). It uses fake users,
   groups and rows inside a transaction that is rolled back, so nothing is kept. Run it again after every change to
   `schema.sql`. (Supabase's Storage refuses plain SQL deletes on its file tables, error 42501 "Use the Storage API instead".
   The test removes its fake files the way Storage itself does, by setting `storage.allow_delete_query` around that one
   delete. The app never deletes files through SQL: it uses the Storage API.)
4. **Authentication, how people sign in.** The app signs in with **email and password** (Settings, Create account). It sends
   no codes and needs no emails. Set this once:
   - **Authentication, Sign In / Providers, "Confirm email": switch it OFF** and Save. Why: Supabase's built-in email sender on
     the free plan only sends to the addresses of your own Supabase team members, at most 2 emails an hour (checked on
     Supabase's pages, 10 Nov 2026), so a confirmation link would never reach a family member. With it off, a new account can
     sign in at once with its password. The trade-off: anyone can create an account with any address, including one that is
     not theirs, while sign-ups are on (see step 5; they still see none of your data). If you leave it on, a new account must
     open an emailed link first and the app says so.
   - **Why there is no "email me a code".** While you use Supabase's built-in email, its email templates are locked (read-only,
     "Set up custom SMTP to edit templates", seen in the dashboard on 10 Nov 2026), and the default sign-in email holds a
     link, not a code. This app takes a password or a typed code, never a link, so it offers passwords only. If you ever add
     your own email service (Authentication, Emails, SMTP Settings; the free plan allows it) the templates unlock and a code
     could be offered again; nothing in the app needs it today.
   - **Authentication, URL Configuration, Site URL:** set it to your site's address, for example
     `https://imrajdeeps.github.io/money-log/`. Why: the "Forgot your password?" email holds a link that opens this address; while
     it is Supabase's default (`http://localhost:3000`) the link lands on a blank page.
5. **Sign-ups.** Turn **Allow new users to sign up** on **only while you are inviting someone**, and turn it off again
   once they have signed in once (people who already have an account keep working). Why it matters: the app's key is
   public by design, so while sign-ups are on a stranger can create an account on your project. Such an account can see
   none of your data and can store only a small, capped amount (see the security notes), but it is better left off.
   If you do not use groups at all, turn sign-ups off after your own first sign-in.
6. **Project settings, API:** copy the *Project URL* and the *publishable* (or *anon*) key. These two are public by
   design. **Never** copy the `service_role` or secret key into this project.

A signed-in phone stays signed in: it renews its sign-in by itself, so you rarely need an email or a password again.
Sign-ups and password sign-in attempts are rate limited by Supabase per IP address (30 sign-ups and 150 sign-ins per
5 minutes, checked 10 Nov 2026), which is plenty for a family.

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
2. **Settings:** *Create account* with your email and a password (at least 10 characters; a few words in a row work well), or
   sign in. If you once tried an email-code sign-in with the same address, delete that unfinished user first (Supabase,
   Authentication, Users, the three dots, Delete user) and then create the account here.
3. Start logging. Nothing has to be imported: the app has its own categories (see below). If you also keep the
   spreadsheet, **Settings, Spreadsheet plan:** paste its blocks (see "Getting the plan from the spreadsheet").

## Finding your way around

The app opens on **Overview**, a dashboard of tiles. Each tile shows one figure; tap it and its details open in a sheet
that rises from the bottom on a phone and slides in from the right on a wider screen. Close a sheet with its ✕, by tapping
the dimmed page, with Escape, or with Android's back gesture. Sheets keep what you typed, so a half-typed payment is still
there when you open it again.

| Tile | Shows | Opens |
| --- | --- | --- |
| This month | What you spent this month (savings not counted) against the budget for Spending, EMI and Family, the change from last month by the same day, and the month's spending by day | **Month**: the groups, every category against its budget, other months, *Categories and budgets* |
| Spending, EMI, Family, Saving | Each group's total, its budget and what is left | Month |
| Net worth | The net worth line from the imported snapshot, the first goal and two more figures | **Plan**, at *Net worth and goals* |
| Recent payments | The last 5 payments; tap one to edit or delete it | *See all*: the last 20 |
| Due soon | How many items are overdue or open, and the next two | Plan: the due list and the calendar file |
| Where it went | This month's biggest categories (savings not counted) and their share | Month |
| Groups | What you are owed or owe across your groups | **Groups** |
| Export | How many payments wait to go to the spreadsheet, and any that changed after export | **Export** |

**+ Add expense** (the round button in the middle of the bottom bar on a phone, the button at the top right on a wider
screen) opens the payment form with the amount ready to type; saving closes it. The bottom bar on a phone also has Home,
Month, Plan and Groups; Settings is the gear at the top right, and Export is its tile. On a wider screen all of them are
links at the top. The app shows no income, cash flow or net worth history, because it does not record them; tiles without
data say where the data comes from instead.

**Settings** is a short list of headings (Cloud sync, Password and sessions, Appearance, and so on); tapping one opens
just that part, and the back arrow returns to the list. The page and the part are in the address
(`/settings?s=password`), so a refresh, the back button or a bookmark lands in the same place. The pages are routed with
TanStack Router (files in `src/routes`; `src/routeTree.gen.ts` is generated from them by `npm run dev` or `npm run build`,
and is committed). GitHub Pages has no file for `/settings`, so the build also writes `404.html` as a copy of the app,
which Pages serves for such addresses; an unknown address goes to the Overview.

**All payments** (the Recent payments tile's *See all*) lists every payment on the phone, newest day first, with a search
(words in any order, matched against the category, note, method and amount; `4500` finds ₹4,500) and filters for month,
category and method. It shows the count and your total for what is listed. Only the rows near the screen are drawn
(TanStack Virtual), so thousands of payments scroll as smoothly as a few. A budget turns amber, with the words "nearly
used", from 80% of it, and red once it is over.

## Light and dark, colours and type

- **Light or dark:** the sun or moon button at the top switches between them. *Settings, Appearance* also has **Match my
  phone** (the default: the app follows the phone's own light or dark setting, live). The choice is kept on that phone only.
  The right theme is set before the page is first drawn, so a dark phone never flashes white.
- **Colours:** deep green for the big "This month" tile and selected chips, lime for the main buttons and the Add button,
  an off-white page with white cards by day and near-black green-tinted surfaces by night. Red means overspending or debt,
  amber means close to the limit, green means fine. Every text and background pairing is checked at the WCAG AA level
  (4.5:1) by `tests/theme.test.ts`, read straight from `src/styles.css`, so a later colour change cannot quietly make text
  hard to read. (The pale lime button has a soft ring because its edge alone is low-contrast on a white page; its label is not.)
- **Type:** Outfit, a free font (SIL Open Font License, `src/assets/fonts/OFL.txt`) kept inside the app, about 47 KB in two
  files, so nothing is fetched from the internet and it works offline. It has the ₹ sign, and amounts use its even-width digits.
- To change the look, edit the colour values at the top of `src/styles.css` (one block for light, one for dark).

## Categories and budgets

The app starts with a short list, grouped as the spreadsheet groups them: **Spending** (Rent, Groceries, Eating out,
Transport & fuel, Bills, Shopping, Health, Other), **EMI** (Loan EMI), **Family** (Family support) and **Saving**
(Savings).

- **Add your own** with *＋ New category…* at the end of the category list in *Add expense* (or in the edit dialogs), or in
  *Categories and budgets* under Month. Pick the group it belongs to. A name that only differs in capitals or spaces
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
| Budget | `A5` to `AL34` | The spreadsheet's categories, groups and planned amount per month (Month). |
| Due list | `A38` to `E66` | One-off payments (Inputs section 6, Active = Yes) and to-dos, with dates (Plan, and the Due soon tile). |
| Net worth and goals | `A70` to `C79` | The snapshot under Plan and on the Net worth tile, labelled with the plan month. |

Keep such files out of this repository (`.gitignore` already skips `*.tsv`, `*.csv`, `*.xlsx` and backup files).

**Names must match for Export.** The spreadsheet adds payments up by the categories on its Budget tab (its Inputs tab
holds the list); its Log shows NOT IN LIST for any other name and Budget and Tracker leave that payment out. After you
import the budget block, Export names the categories in the rows it is about to copy that the spreadsheet does not
have, so you can add them there or change the payment's category. Without an imported plan the app cannot know what the
spreadsheet holds and only reminds you of this.

## Sending payments to the spreadsheet

Open **Export** (its tile on Overview), **Copy for Excel**, then in the spreadsheet's **Log** tab click column A of the
first empty row and paste. Then tap **Mark as exported**: it marks exactly the payments you just copied, so the next copy
holds only new ones. If you later edit or delete a payment that was already exported, Export lists it under **Changed after export**,
because its spreadsheet row is now out of date and has to be fixed by hand.

The payment method is written at the start of the note, for example `[UPI] lunch`, unless your Log tab has a **Method
column**: the current `Rajdeep - Money Plan v2.xlsx` does (Date, Category, Amount, Method, Note, then the Month and Group
formulas). Tick *My spreadsheet's Log tab has a Method column* under Export and the copy becomes five columns, with
the note free of the prefix. It is off by default, so an older Log tab with four input columns keeps working; paste only
into a Log tab whose columns match the box. Text that Excel might misread (it starts with `=`, `+`, `-`, `@` or a quote, or
looks like a date or number) gets a leading space so it stays plain text.

A **shared expense** is exported at **your share**, with the full amount kept in the note: `[UPI] dinner, my share of
1,800`. An expense you owe nothing on is not exported, and expenses other people made never are.

## Groups, splits and settling up

*Groups* (bottom bar, or the Groups tile). A group is a family or a trip, up to 20 people, and one person can be in several.

- **Make a group:** name it and say what others should call you. You become its admin.
- **Invite:** the group page shows a code (and a link that carries it). Send it only to people you mean to add. The code
  works for 7 days; *Make a new code* replaces it. The link keeps the code after the `#`, which browsers never send to
  any server. The person opens it, signs in (Settings) and confirms the join. This is where sign-ups must be on.
- **Share an expense:** in *Add expense* pick the group under *Share with*, then who paid and how it is split:
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

*Plan* (bottom bar, or the Due soon and Net worth tiles). **Due soon** lists the imported one-off payments and to-dos: overdue first, then by date, with a tick to mark
one done (marks sync between your phones and survive re-importing the same list; the spreadsheet stays the plan, so
tick items off there too). **Add to calendar** makes a calendar (`.ics`) file with an all-day event and an alert for each
dated item that is not done; by default the alert is 2 days before at 9:00, and you can change both. Opening the file
again later updates the same events instead of adding copies. Below it, **Net worth and goals** shows the imported
figures. They are the spreadsheet's numbers at the plan month shown; they do not change as you log payments.

## Receipt photos

In *Add expense*, **Take photo** or **Choose photo** before saving, or add and remove them later when you edit a payment (up
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

## If someone forgets their password

**Changing a password you know:** *Settings, Password and sessions, Change password* (you are signed in, so no old password is
needed).

**Forgot it:** on the Sign in form, tap **Forgot your password?**, enter the email, and tap *Email me a reset link*. Open the
link **on that phone**: the app signs the person in and shows "choose a new password" in Settings. The link works once and runs
out quickly. It needs the **Site URL** set in Supabase (step 1.4), and Supabase's free built-in email only sends to your own
team's addresses, at most 2 an hour, so today this works for the project owner. For anyone else, either add your own email
service (step 1.4), or reset the password yourself in Supabase's **SQL Editor** (read the line, put the real address in, Run):

```sql
update auth.users
set encrypted_password = extensions.crypt('a-long-temporary-password', extensions.gen_salt('bf'))
where email = 'person@example.com';
```

Then the person signs in with that temporary password and changes it at once in *Settings, Password and sessions*. This is
the usual way to set a password directly in Supabase, written for its standard setup (the password functions live in the
`extensions` schema), but it has **not been tried on a real project**, and neither has the emailed link on the real one (only
against a stand-in for Supabase). The SQL Editor keeps a copy of what you ran: delete that snippet afterwards, and do not use a
password the person uses anywhere else.

## Updating the app

After a new version is published, open the app twice: the first open fetches the new files in the background, the
second one uses them.

## Backups

Settings, **Download backup** saves one JSON file with all *your own* payments (not other people's shared expenses),
the three plan blocks, the Done marks and your categories and budgets. It does not include receipt photos. Keep one in iCloud Drive now and then. **Restore** merges it back in (newer
copies win).

**The free Supabase plan does not back up your database automatically** (daily backups, kept for 7 days, start with the paid
Pro plan; checked on Supabase's backup pages on 10 Nov 2026). Supabase's own advice for Free projects is to export regularly
with its command-line tool, so this JSON file is your safety copy: download one now and then, and after anything important.
Photos are not in it; they live only in Supabase Storage.

**Free projects are paused when they go quiet.** Supabase pauses a Free project that has had too little database activity over
a week (it emails you about a week beforehand); using the app daily counts as activity. A paused project can be resumed from
the Supabase dashboard (Organizations, the project, Resume project) for up to a year after it was paused. Until you resume
it, sync stops but logging on the phone keeps working and catches up afterwards.

## Developing

```bash
npm ci           # install exactly the versions in package-lock.json
npm run dev      # local dev server (local-only mode unless you create .env.local, see .env.example)
npm test         # tests: logic, blocks, groups and splits, dashboard figures, and sync against a stand-in for Supabase
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
  public Supabase URL and key. Your password is sent to Supabase when you sign in or change it and is never kept in the app
  or in the repository; Supabase stores only a hash. The free plan does not check passwords against known leaks, so the app
  refuses short, very common and email-like passwords itself.
- Sessions: Supabase keeps a signed-in device signed in until it signs out; the free plan cannot time sessions out. Settings,
  *Password and sessions* signs out your other devices or every device (a device that is open at that moment drops out when it
  next renews its sign-in, within about an hour) and changes the password. Supabase gives an app no list of signed-in devices,
  so the app cannot show one. The "sign out other devices and everywhere" calls are written to Supabase's documented sign-out
  options but are checked here only against my stand-in server: try them once on your own project.
- Every table has row-level security, and `supabase/rls_tests.sql` checks it. You read and write your own private rows
  and nothing else of anyone's. A shared expense or payment is readable by the current members of its group and changed
  only by its creator. Groups and memberships change only through database functions that check the rules (a valid code,
  an admin, a zero balance). The anonymous role has no access. The group functions run with the rights of the database
  owner, which must bypass row-level security (Supabase's `postgres` role does); the test script checks this.
- Members of a group see what they are meant to: the amount, category, note, date and payer of shared expenses, and each
  other's chosen names. They never see your private payments, your plan, or your email address. Recording a payment
  between two people needs no confirmation from the other: this is meant for groups of people who trust each other.
- Because the key is public and sign-ups are open while you invite people, each account is capped (20,000 payments and
  2,000 recorded group payments; plan data only under six known names; at most 10 groups made and 20 people per group),
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
  ignores a write older than the stored one). Sign out and Erase affect only the phone you use them on. Sign out asks whether to also erase this phone's copy of your data (choose erase before handing the phone over or signing in with another account).
- Packages are installed with a lockfile and without install scripts. Workflow actions are pinned to major versions;
  pin them to commit SHAs if you want stricter supply-chain control.

## Not built

Push notifications (reminders are the due list and the calendar file).

# Money Log

A small installable web app (PWA) for logging payments in about five seconds and seeing the month against your
spreadsheet plan. Release 1 of the product requirements: quick log, month vs budget, cloud sync with email-code
sign-in, and export to the spreadsheet's Log tab. It works on iPhone and Android, and offline.

The repository holds code only. Your plan numbers, balances and payments never go in it; they live on your phone and
in your own Supabase database.

## What you set up once

You need a free Supabase account and a GitHub account. Names of menus may differ slightly from what is written here.

### 1. Supabase (the database and sign-in)

1. Create a new project. Note the project URL.
2. **SQL Editor:** paste and run `supabase/schema.sql`. Read it first; nothing in this repository applies it for you.
3. Paste and run `supabase/rls_tests.sql`. The last message must be `ALL ACCESS TESTS PASSED`. It uses fake users
   inside a transaction that is rolled back, so nothing is kept.
4. **Authentication, email templates:** edit **both** the *Confirm signup* and the *Magic Link* templates so the email
   contains the 6-digit code, for example `Your Money Log code is {{ .Token }}`. A brand-new account's first email uses
   *Confirm signup*; every later one uses *Magic Link*. The app asks for the code, not a link.
5. Sign in once from the app (below). Then, in Authentication settings, **turn off new sign-ups**, so nobody else can
   create an account on your project. (Release 2 will need sign-ups on again, for people you invite.)
6. **Project settings, API:** copy the *Project URL* and the *publishable* (or *anon*) key. These two are public by
   design. **Never** copy the `service_role` or secret key into this project.

Supabase's built-in email sender has a low hourly limit. That is fine for occasional sign-ins because the session stays
on your phone; add your own email (SMTP) service in Supabase if you hit it.

### 2. GitHub (the website)

GitHub Pages on a free account needs a **public** repository, which is fine: it contains only code.

1. **Copy this folder out of iCloud Drive before using git.** iCloud and a `.git` folder do not mix well.
   Do not copy `node_modules` or `node_modules.nosync`.
2. Create a repository, then push this folder to the `main` branch.
3. **Settings, Pages, Source:** choose *GitHub Actions*.
4. **Settings, Secrets and variables, Actions, Variables:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` with the two
   public values from step 1.6.
5. Push to `main` (or run the workflow by hand). It runs the tests, builds, and publishes to
   `https://YOUR-NAME.github.io/REPO-NAME/`.

**Keep this origin clean.** All sites under `YOUR-NAME.github.io` share one browser origin, so another page there
could read this app's stored data and sign-in. Do not host other sites you do not fully control under the same
GitHub account, or give this app its own account, organisation, or custom domain.

### 3. On your phone

1. Open the address from step 2.5. iPhone: use Safari, tap Share, then Add to Home Screen. Android: use Chrome, menu,
   Install app.
2. **Settings:** send yourself a code, sign in.
3. **Settings, Plan:** paste the block from the spreadsheet (next section).

## Getting the plan from the spreadsheet

In your Money Plan v2 spreadsheet, the **App export** tab holds the plan as a block. Copy **A5 to AL34**, paste it in
the app under Settings, Plan, check the preview, and import. You can also save the copied block as a `.tsv` file and
open it with *Choose a file*. Copy the block again after you change anything on the Inputs tab or switch scenario.
Importing replaces the plan and never touches payments. Keep such files out of this repository (`.gitignore` already
skips `*.tsv`, `*.csv`, `*.xlsx` and backup files).

## Sending payments to the spreadsheet

Export tab, **Copy for Excel**, then in the spreadsheet's **Log** tab click column A of the first empty row and paste.
Then tap **Mark as exported**: it marks exactly the payments you just copied, so the next copy holds only new ones.
If you later edit or delete a payment that was already exported, the Export tab lists it under **Changed after export**,
because its spreadsheet row is now out of date and has to be fixed by hand.

The payment method is written at the start of the note, for example `[UPI] lunch`. Text that Excel might misread (it
starts with `=`, `+`, `-`, `@` or a quote, or looks like a date or number) gets a leading space so it stays plain text.

## Updating the app

After a new version is published, open the app twice: the first open fetches the new files in the background, the
second one uses them.

## Backups

Settings, **Download backup** saves one JSON file with every payment and the plan. Keep one in iCloud Drive now and
then. **Restore** merges it back in (newer copies win).

## Developing

```bash
npm ci           # install exactly the versions in package-lock.json
npm run dev      # local dev server (local-only mode unless you create .env.local, see .env.example)
npm test         # tests: logic, spreadsheet block import, sync against a stand-in for Supabase
npm run check    # type check
npm run build    # production build into dist/
```

`tests/mock-supabase.ts` is a small stand-in for the Supabase sign-in and REST endpoints the app uses. It records how
those APIs are understood to behave; it is not the real service. `npm run e2e:build` plus `npm run e2e:serve` serve a
build that talks to the stand-in, for checking in a browser.

## Security notes

- The only secrets are the sign-in session tokens stored in this browser's IndexedDB. The page itself holds only the
  public Supabase URL and key.
- Every table has row-level security: a signed-in user can read and write only their own rows, and the anonymous
  role has no access. `supabase/rls_tests.sql` checks this; run it again after any change to `schema.sql`.
- A Content-Security-Policy limits the page to its own files and your one Supabase address. There are no third-party
  scripts, fonts, analytics or images.
- The service worker caches only this app's own files. Requests to Supabase are never cached.
- When two phones edit the same payment, the latest edit wins, on the phones and in the database alike (the database
  ignores a write older than the stored one). Sign out and Erase affect only the phone you use them on.
- Packages are installed with a lockfile and without install scripts. Workflow actions are pinned to major versions;
  pin them to commit SHAs if you want stricter supply-chain control.

## Not in Release 1

Shared group ledger and splits, due list and calendar file, net worth and goals snapshot, and receipt photos.

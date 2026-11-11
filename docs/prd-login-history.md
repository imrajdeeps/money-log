# PRD: Login history, and no more "Switch account"

**Status:** proposed (2026-11-11), decisions taken in a question round with the owner; waiting for the go-ahead to build. Planned as
**version 1.25.0** (a new feature, with a feature removed). Nothing is built yet.

## Problem
There is no way to see who has signed in to the account, and from where. And "Switch account" does nothing that "Sign out and erase this
phone" does not already do: it erases this phone's copy and asks for another sign-in.

## The owner's decisions (2026-11-11)
- **Remove "Switch account".** The top card of Settings keeps only *Sign out* (with its keep-or-erase choice). One phone still holds one
  account's data; signing in with another account on a phone that holds data still says to erase first. Several accounts on one phone
  was offered and not chosen.
- **Add a login history from Supabase's own record**, shown under Settings, *Password and sessions*:
  - **Signed in now:** every session that is still signed in: device and browser, since when, last active, with *this phone* marked.
  - **Recent activity:** the last 30 events of the server's sign-in record: signed in, signed up, password changed, recovery link asked
    for, signed out, each with its time. No IP address is shown.
  - **A fact the owner was told:** the server's record keeps no device for past sign-ins, so old entries have a time and an action
    only; the device and browser come from the live sessions.
- **A notification of a sign-in from a new device:** a ninth kind in the notification center (on by default, switchable) for a session on
  another device that the person has not dismissed.

## How it works
- **Two read-only database functions** (new SQL, in `supabase/schema.sql`), both `security definer`, both returning only the signed-in
  person's own rows (`auth.uid()`), executable by `authenticated` only:
  - `my_sessions()`: from `auth.sessions` the id, created, last refreshed, user agent, and `is_current` (the session id in the person's
    own token matches). The user agent is turned into "Chrome on Mac" on the phone, by a small pure function.
  - `my_sign_in_log(p_limit)`: from `auth.audit_log_entries` the time and the action for the person's own id, limited to the
    security-relevant actions (`login`, `user_signedup`, `user_recovery_requested`, `user_modified`, `logout`, `token_revoked`). No IP address is returned.
- **The app** asks for both when the section is opened and when the notification list is worked out (at most once a minute), never
  writes to them, and shows nothing (with a line saying so) when the phone is not signed in or offline.
- **The notification** has the key `signin:<session id>`, tone *attention*, title "Signed in on another device", detail "Chrome on Windows,
  3 hours ago", and opens Settings, Password and sessions. The cross dismisses it for good, like every notification. The phone's own
  session never produces one.
- **Removal:** the *Switch account* button and its panel, and the texts that only they used.

## Not in this version
- Several accounts on one phone (offered; not chosen).
- A map or place name for a sign-in, an IP address, a sign-out button per session (the existing "sign out other devices" stays as it is).
- A history of failed sign-in attempts (Supabase does not record them in these tables).

## Risks and questions
- **Is the server's record switched on?** Hosted Supabase projects normally fill `auth.audit_log_entries`, but this could not be read here
  (a read of the real project's sign-in log was declined by the safety check), so it is unconfirmed. If the list turns out empty after
  the SQL has run, the app says "No sign-in record yet" and the answer is a follow-up (an app-written table), not a silent gap.
- **The SQL touches the `auth` schema:** a function that reads it is owned by the database admin and checks `auth.uid()` itself; the
  access tests in `supabase/rls_tests.sql` get a section: another user's sessions and log are never returned, anonymous gets nothing,
  and the function's output has no IP or other people's data.
- **One SQL run is needed** (and is the owner's call, as before); until then the section shows "Not available yet" and the rest works.
- **Translations:** every text needs Hindi and Hinglish; browser and system names are shown as they are.
- **A patch to a phone with an old cached version** is harmless: the new section simply is not there.

## Checks
- Unit tests for the user-agent reading (Chrome, Safari, Firefox, Edge, Android, iPhone, unknown) and for the notification rule (other
  device only, this phone never, dismissed, new key per session).
- The SQL on a local Postgres with Supabase-style stand-ins for `auth.sessions` and `auth.audit_log_entries`, then the real project after
  the owner's go-ahead (access test inside a rolled-back transaction).
- Browser check at phone and wide width, light and dark, English and Hindi, with the stand-in server answering both functions.

# Project setup, in order

Everything in this file is done by hand in the dashboard or in the SQL editor.
No key is ever printed, echoed or committed by the repository, and `.env.local`
is ignored from the first commit.

## 1. Create the project

- Region: whichever is closest to the reviewer.
- Postgres 17.
- Keep the default asymmetric signing keys. Do not enable the legacy shared
  secret. Settings, then JWT Keys, should show a current key with an
  asymmetric algorithm.

## 2. Copy the keys into `.env.local`

Copy `.env.example` to `.env.local` and fill in three values from the
dashboard:

- `NEXT_PUBLIC_SUPABASE_URL` from Settings, Data API, Project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Settings, API Keys, the
  publishable key, which starts `sb_publishable_`.
- `SUPABASE_SECRET_KEY` from Settings, API Keys, Secret keys, which starts
  `sb_secret_`.

Use the publishable and secret keys, not the legacy `anon` and `service_role`
keys. The secret key is read by nothing in request handling; it exists for
administrative scripts only, and the browser only ever receives the
publishable key.

## 3. Run the schema

Open the SQL editor, paste the whole of `supabase/schema.sql`, run it. It
finishes by printing one row per organisation with the seeded counts, which
should read:

| organisation                | premium | seats | borrowers | scenarios | results | submissions | ledger | audit |
| --------------------------- | ------- | ----- | --------- | --------- | ------- | ----------- | ------ | ----- |
| Bayou City Lending Co       | false   | 3     | 14        | 5         | 12      | 4           | 3      | 1     |
| Harborline Mortgage Group   | true    | 3     | 15        | 10        | 26      | 6           | 8      | 4     |
| Red Oak Residential Finance | true    | 3     | 11        | 3         | 6       | 2           | 3      | 2     |

The file creates the private `borrower-docs` bucket itself, with its size limit
and its allowed MIME types, so there is no bucket to create by hand.

## 4. Enable the access token hook

Authentication, then Hooks, then Customize Access Token (JWT) Claims. Enable
it and select the Postgres function `public.custom_access_token_hook`.

Nothing works before this step. Without the hook a token carries no `org_id`,
so every policy sees a null tenant and every query returns nothing. That is the
correct failure mode, and it is worth seeing once.

## 5. Set the token lifetime to 600 seconds

Authentication, then Sessions, then Access token (JWT) expiry: `600`.

Seat takeover is enforced when a token is issued or refreshed. An access token
that has already been issued cannot be withdrawn before it expires, so this
number is the worst case delay before a displaced device loses access. Ten
minutes is short enough to demonstrate and long enough not to be irritating.

## 6. Create the nine seat accounts

Authentication, then Users, then Add user, then Create new user, with Auto
Confirm User ticked, for each of these. Any password will do; use the same one
for all nine so the demo is easy to drive.

```
harborline.admin@fieldstone.example
harborline.manager@fieldstone.example
harborline.lo@fieldstone.example
bayoucity.admin@fieldstone.example
bayoucity.manager@fieldstone.example
bayoucity.lo@fieldstone.example
redoak.admin@fieldstone.example
redoak.manager@fieldstone.example
redoak.lo@fieldstone.example
```

The addresses use the reserved `.example` top level domain, so they cannot
reach a real mailbox. Each seat row in the seed already names the account it
belongs to in `login_email`, and the token hook binds the two the first time
that account signs in. `harborline.admin@fieldstone.example` is the seat
flagged `is_demo_admin`, which is the login that can look across tenants in
the demo, and that flag is removed for production.

## 7. Run the isolation tests

Paste the whole of `supabase/tests/isolation.sql` into the SQL editor and run
it. It runs in one transaction and rolls back, so it leaves nothing behind. It
returns one row per test. Every row must read `pass`.

Expected: 26 passed, 0 skipped, 0 failed.

If a row reads `skipped` it names what is missing; the usual cause is running
it before step 6, which leaves the three token hook tests unable to bind a
seat to an account.

If the run fails immediately with `permission denied to set role
"authenticated"`, run `grant authenticated to postgres;` once and run the file
again. The tests deliberately impersonate the `authenticated` role rather than
running as the owner, because a test that runs as the owner proves nothing.

## What is checked before any of this

The same two files are executed against a real PostgreSQL engine on every
change, with `npm run test:schema`. That run needs no project, no container and
no network: PGlite is PostgreSQL compiled to WebAssembly, and
`supabase/tests/harness.sql` supplies the handful of platform objects the
schema depends on. It is not a substitute for step 7, because the engine
version differs from the managed project's and because the platform's own auth
and storage implementations are emulated there. It does mean a syntax error or
a broken policy is caught here rather than in the dashboard.

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

## 2. Fill in `.env.local`

Copy `.env.example` to `.env.local` and fill in all five values:

- `NEXT_PUBLIC_SUPABASE_URL` from Settings, Data API, Project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Settings, API Keys, the
  publishable key, which starts `sb_publishable_`.
- `SUPABASE_SECRET_KEY` from Settings, API Keys, Secret keys, which starts
  `sb_secret_`.
- `DATABASE_URL` from Settings, Database, connection string.
- `DEMO_PASSWORD`, which you choose. It becomes the password of all nine demo
  seat accounts and it is yours to hand out.

Use the publishable and secret keys, not the legacy `anon` and `service_role`
keys. The secret key bypasses row level security, so nothing in request
handling touches it: it is read by `scripts/seed-users.mjs` and by nothing
else. The browser only ever receives the publishable key.

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

```bash
npm run seed:users
```

The script reads the seat roster out of `public.seats`, so the accounts always
match whatever the schema seeded and there is no second list to drift. It
creates each account through the Auth admin API with the email already
confirmed, sets the password from `DEMO_PASSWORD`, and updates an account that
already exists rather than failing. It prints the addresses and the outcome,
and it never prints a key or the password.

The addresses use the reserved `.example` top level domain, so they cannot
reach a real mailbox. Each seat names its account in `login_email`, and the
token hook binds the two the first time that account signs in.
`harborline.admin@fieldstone.example` is the seat flagged `is_demo_admin`,
the login that can look across tenants in the demo, and that flag is removed
for production.

## 7. Run the isolation tests against the project

```bash
npm run test:schema
```

With `DATABASE_URL` set, this runs `supabase/schema.sql` and
`supabase/tests/isolation.sql` against the project itself, with no emulation,
and prints `mode: real`. The tests run in one transaction and roll back, so
they leave nothing behind.

Expected: **27 passed, 0 skipped, 0 failed**.

The schema file drops and recreates the portal tables, which is what makes it
re-runnable. To run only the tests against what is already there:

```bash
npm run test:schema -- --tests-only
```

The same file can be pasted into the SQL editor instead, which returns the
same table of results.

If a row reads `skipped` it names what is missing; the usual cause is running
before step 6, which leaves the token hook tests with no account to bind a
seat to.

If the run fails immediately with `permission denied to set role
"authenticated"`, run `grant authenticated to postgres;` once and run it
again. The tests deliberately impersonate the `authenticated` role rather than
running as the owner, because a test that runs as the owner proves nothing.

## What is checked before any of this

With no `DATABASE_URL`, `npm run test:schema` runs the same two files against
PGlite, which is PostgreSQL compiled to WebAssembly, with
`supabase/tests/harness.sql` supplying the platform objects the schema depends
on. It needs no project, container or network, and it prints `mode: local`.

It is not a substitute for step 7: the engine version differs from the managed
project's, and the platform's own auth and storage implementations are
emulated. It does mean a syntax error or a broken policy is caught here rather
than in the dashboard. Every evidence file under `docs/evidence` records which
mode produced it.

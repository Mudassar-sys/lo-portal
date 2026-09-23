# Project setup, in order

Steps 1 and 2 are done by hand. Everything after that is one command, and the
manual equivalents are kept below so a reviewer can check what was changed.
No key is ever printed, echoed or committed by the repository.

## 1. Create the project

- Region: whichever is closest to the reviewer.
- Postgres 17.
- Keep the default asymmetric signing keys. Do not enable the legacy shared
  secret. Settings, then JWT Keys, should show a current key with an
  asymmetric algorithm.

## 2. Fill in `.env.local`

Copy `.env.example` to `.env.local` and fill in all seven values:

- `NEXT_PUBLIC_SUPABASE_URL` from Settings, Data API, Project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Settings, API Keys, the
  publishable key, which starts `sb_publishable_`.
- `SUPABASE_SECRET_KEY` from Settings, API Keys, Secret keys, which starts
  `sb_secret_`.
- `DATABASE_URL` from Settings, Database, connection string.
- `DEMO_PASSWORD`, which you choose. It becomes the password of all nine demo
  seat accounts and it is yours to hand out.
- `SUPABASE_ACCESS_TOKEN`, a personal access token from the account tokens
  page. It is account wide, so it is the most sensitive value here and it is
  read by `scripts/provision.mjs` alone.
- `SUPABASE_PROJECT_REF`, the subdomain of the project URL.

Use the publishable and secret keys, not the legacy `anon` and `service_role`
keys. The secret key bypasses row level security, so nothing in request
handling touches it: it is read by `scripts/seed-users.mjs` and
`scripts/provision.mjs` and by nothing else. The browser only ever receives
the publishable key.

The file must be named exactly `.env.local`. Anything starting `.env` is
gitignored except the example, and the guard refuses any tracked or staged
environment file under any name, because a file once saved here as
`.env.local.txt` matched no ignore rule and sat in the tree holding live
credentials.

## 3. Provision the project

```bash
npm run provision -- --apply-schema
```

One command, and it is the only setup path. It applies `supabase/schema.sql`,
enables the access token hook at `public.custom_access_token_hook`, sets the
access token lifetime to 600 seconds, creates the private `borrower-docs`
bucket with its size limit and allowed types, then reads every one of those
settings back off the project and asserts it. Redacted evidence is written to
`docs/evidence/provision.txt`.

Expect: `9 assertions passed, 0 failed`.

The redirect allow list it sets is the deployed URL plus localhost. Preview
deployments are added only if `PREVIEW_URL_PATTERN` is exported when the
command runs, for example
`PREVIEW_URL_PATTERN='https://myapp-*-myaccount.vercel.app/**'`. It is not
one of the seven variables in `.env.example` because the pattern contains
the hosting account's own name, which this repository does not carry, and a
glob wide enough to avoid naming it would accept a redirect to anyone's
deployment of a project with the same name. The portal signs in with a
password and uses no redirect flow, so leaving it unset changes nothing here.

Drop `--apply-schema` to reconfigure without touching data. The schema file
drops and recreates the portal tables, which is what makes it re-runnable.

## 4. Create the nine seat accounts

```bash
npm run seed:users
```

The script reads the seat roster out of `public.seats`, so the accounts always
match whatever the schema seeded and there is no second list to drift. It
creates each account through the Auth admin API with the email already
confirmed, sets the password from `DEMO_PASSWORD`, and updates an account that
already exists rather than failing. It never prints a key or the password.

The addresses use the reserved `.example` top level domain, so they cannot
reach a real mailbox. Each seat names its account in `login_email`, and the
token hook binds the two the first time that account signs in.
`harborline.admin@fieldstone.example` is the seat flagged `is_demo_admin`, the
login that can look across tenants in the demo, and that flag is removed for
production.

## 5. Run the isolation tests against the project

```bash
npm run test:schema
```

With `DATABASE_URL` set this runs against the project itself, with no
emulation, and prints `mode: real`. The tests run in one transaction and roll
back, so they leave nothing behind.

Expect: **32 passed, 0 skipped, 0 failed**.

`npm run test:schema -- --tests-only` runs the tests without reapplying the
schema. `npm run test:schema -- --local` forces the emulator even when
`DATABASE_URL` is set, which is how the harness is checked against the real
project.

If the run fails immediately with `permission denied to set role
"authenticated"`, run `grant authenticated to postgres;` once and run it
again. The tests deliberately impersonate the `authenticated` role rather than
running as the owner, because a test that runs as the owner proves nothing.

## 6. Verify it in a browser

```bash
npm run final
```

Runs the whole sequence in order into `docs/evidence/final-run.txt`: the
secret sweep, the guards, lint, types, the build, the isolation tests,
provisioning twice for idempotency, the upload refusals, then every browser
suite twice and the 5,000 row scale run. It starts its own production server
and stops it again, and it records which attempt produced the transcript.

Expect: **37 of 37 steps ok**.

Against the deployed alias instead of a local build:

```bash
npm run verify:live
```

## What is checked before any of this

With no `DATABASE_URL`, or with `--local`, `npm run test:schema` runs the same
two files against PGlite, which is PostgreSQL compiled to WebAssembly, with
`supabase/tests/harness.sql` supplying the platform objects the schema depends
on. It needs no project, container or network, and prints `mode: local`.

It is not a substitute for step 5: the engine version differs from the managed
project's, and the platform's auth and storage implementations are emulated
there. Every evidence file under `docs/evidence` records which mode produced
it.

## Reviewer cross-check (not a setup path)

Nothing here needs doing. It is where to look in the dashboard to confirm the
provisioning landed, if you would rather see it than read an assertion.

- Authentication, Hooks: Customize Access Token (JWT) Claims is enabled and
  points at `public.custom_access_token_hook`.
- Authentication, Sessions: access token expiry reads 600.
- Storage: `borrower-docs` exists, is private, and allows
  `application/pdf, image/png, image/jpeg` up to 10 MB.
- SQL editor: `select count(*) from pg_policies where schemaname in
  ('public','storage');` returns 36, being 32 on the portal tables and 4 on
  storage objects.
- SQL editor: `select count(*) from information_schema.role_table_grants
  where table_schema='public' and grantee='anon';` returns 0.

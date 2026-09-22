# Research log

Every technical claim this build relies on, with the official source and the
date it was read. A claim without a URL is struck out and anything depending on
it counts as NOT DONE.

Sources allowed: nextjs.org, react.dev, supabase.com/docs, postgresql.org,
tailwindcss.com, ui.shadcn.com, vercel.com/docs, papaparse.com,
learn.microsoft.com, typescript-eslint.io, and the npm registry for versions.
Next.js 16.2 and later ship their own documentation inside the installed
package at node_modules/next/dist/docs, which is the same official text
version matched to the pinned release; lines citing it name the file.

## Versions

- next latest published version is 16.3.5; 16.3.6 is NOT published. `npm view next dist-tags` returns "latest": "16.3.5" and `npm view next@16.3.6` returns E404. https://www.npmjs.com/package/next - 22 Sep 2026
- TODO: 16.3.6 is the out of band security release the plan expects today. Pinned 16.3.5 until it lands. Advisory to re-read before deploy: https://nextjs.org/blog/upcoming-nextjs-security-release-september-22-2026 - 22 Sep 2026
- react 19.3.0 and react-dom 19.3.0 are published. https://www.npmjs.com/package/react - 22 Sep 2026
- @supabase/supabase-js 2.116.0 published. https://www.npmjs.com/package/@supabase/supabase-js - 22 Sep 2026
- @supabase/ssr 0.12.7 published. https://www.npmjs.com/package/@supabase/ssr - 22 Sep 2026
- tailwindcss 4.3.3 and @tailwindcss/postcss 4.3.3 published. https://www.npmjs.com/package/tailwindcss - 22 Sep 2026
- papaparse 5.7.0 published; @types/papaparse 5.5.2 published. https://www.npmjs.com/package/papaparse - 22 Sep 2026
- shadcn CLI 4.21.0 published. https://www.npmjs.com/package/shadcn - 22 Sep 2026
- eslint-config-next 16.3.5 peer dependencies are eslint >=9.0.0 and typescript >=3.3.1. `npm view eslint-config-next@16.3.5 peerDependencies`. https://www.npmjs.com/package/eslint-config-next - 22 Sep 2026

## TypeScript version decision

- typescript 7.0.2 is the latest published release. https://www.npmjs.com/package/typescript - 22 Sep 2026
- typescript-eslint supports TypeScript ">=4.8.4 <6.1.0" only, so TypeScript 7.0 cannot be linted. https://typescript-eslint.io/users/dependency-versions/ - 22 Sep 2026
- Observed directly: with typescript 7.0.2 installed, `npx eslint .` aborts with "typescript-eslint does not support TS 7.0." and ESLint exits non zero. Recorded in docs/evidence/lint-ts7-failure.txt - 22 Sep 2026
- Next.js 16 requires TypeScript 5.1.0 or newer as a minimum, so 5.9.3 is inside the supported range. node_modules/next/dist/docs/01-app/02-guides/... upgrade guide, "TypeScript 5+ Minimum version now 5.1.0". https://nextjs.org/docs/app/guides/upgrading/version-16 - 22 Sep 2026
- Decision: pinned typescript 5.9.3. CLOSED 22 Sep 2026: approved by the Solutions Lead and section 9 plus the pin list of the plan were amended to match, so the plan and the repository now agree. It is no longer a deviation.

## Next.js 16 conventions

- `proxy.ts` replaces the deprecated `middleware.ts` convention as of v16.0.0. The file lives in the project root at the same level as `app`, must export a single function named `proxy` or a default export, and runs on the Node.js runtime, which cannot be reconfigured. https://nextjs.org/docs/app/api-reference/file-conventions/proxy - 22 Sep 2026
- Proxy coverage is not an authorisation boundary on its own: "Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone", because Server Functions are POSTs to the route they are used on and a matcher change can silently remove coverage. https://nextjs.org/docs/app/api-reference/file-conventions/proxy - 22 Sep 2026
- Without a `matcher`, proxy runs on every request including `_next/static` and `public/`, so a negative match pattern is required. https://nextjs.org/docs/app/api-reference/file-conventions/proxy - 22 Sep 2026
- The `next lint` command is removed in 16 and the `eslint` key is removed from the Next config file; linting runs through the ESLint CLI and `next build` no longer lints. https://nextjs.org/docs/app/guides/upgrading/version-16 - 22 Sep 2026
- Observed directly: `eslint` in next.config.ts fails typecheck with TS2353 "'eslint' does not exist in type 'NextConfig'" on next 16.3.5. Key removed.
- Next.js 16 minimum Node.js is 20.9.0. https://nextjs.org/docs/app/guides/upgrading/version-16 - 22 Sep 2026
- Turbopack is the default for `next dev` and `next build` in 16, so no `--turbopack` flag is needed in the scripts. https://nextjs.org/docs/app/guides/upgrading/version-16 - 22 Sep 2026
- Official flat config for a TypeScript app is `defineConfig([...nextVitals, ...])` importing `eslint-config-next/core-web-vitals`, with `eslint-config-next/typescript` added for TypeScript rules. node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md. https://nextjs.org/docs/app/api-reference/config/eslint - 22 Sep 2026

## Tailwind CSS 4

- Manual dark mode by class uses `@custom-variant dark (&:where(.dark, .dark *));` after `@import "tailwindcss";`. This overrides the default `prefers-color-scheme` behaviour. https://tailwindcss.com/docs/dark-mode - 22 Sep 2026

## Repository hygiene

- Turbopack keeps a persistent filesystem cache under .next/cache and it is enabled by default for both `next dev` and `next build` in Next.js 16. https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache - 22 Sep 2026
- Observed directly: that cache stores the build shell's environment variable names and values, so operator tooling strings can appear there even though no source file contains them. It is gitignored and is not part of the deployable output. Evidence docs/evidence/name-sweep.txt - 22 Sep 2026

## Custom Access Token Hook

- Required signature: `create or replace function public.custom_access_token_hook(event jsonb) returns jsonb language plpgsql as $$ ... $$;`. https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook - 22 Sep 2026
- The event jsonb carries `user_id` (string), `claims` (object) and `authentication_method` (string, one of oauth, password, otp, totp, recovery, invite, sso/saml, magiclink, email/signup, email_change, token_refresh, oauth_provider/authorization_code, anonymous). https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook - 22 Sep 2026
- The returned claims object must still contain all required claims: iss, aud, exp, iat, sub, role, aal, session_id, email, phone, is_anonymous. The hook therefore adds to `event->'claims'` and never replaces it. https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook - 22 Sep 2026
- Token issuance is refused by returning `{"error": {"http_code": 403, "message": "..."}}`. This is how seat takeover ends the losing session at its next refresh. https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook - 22 Sep 2026
- Grants and revokes for the hook, verbatim from the RBAC guide: `grant usage on schema public to supabase_auth_admin;` then `grant execute on function public.custom_access_token_hook to supabase_auth_admin;` and `revoke execute on function public.custom_access_token_hook from authenticated, anon, public;` plus `grant all on table <table the hook reads> to supabase_auth_admin;`, `revoke all on table <that table> from authenticated, anon, public;` and a policy `as permissive for select to supabase_auth_admin using (true)`. https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac - 22 Sep 2026
- Deliberate difference from that example: the guide's table is read only by the hook, so it is revoked from authenticated entirely. Our `seats` table is also read by the portal (the Sessions screen and assignment), so it keeps the supabase_auth_admin grant and policy AND a separate org scoped policy for authenticated. The revoke is therefore narrowed to anon and public. Recorded here because it is a departure from the doc example, not from the plan.

## Row level security

- CREATE POLICY synopsis: `CREATE POLICY name ON table_name [ AS { PERMISSIVE | RESTRICTIVE } ] [ FOR { ALL | SELECT | INSERT | UPDATE | DELETE } ] [ TO role ] [ USING (expr) ] [ WITH CHECK (expr) ]`. https://www.postgresql.org/docs/current/sql-createpolicy.html - 22 Sep 2026
- Constraint that shapes the file: "A SELECT policy cannot have a WITH CHECK expression" and "A DELETE policy cannot have a WITH CHECK expression". An INSERT policy takes WITH CHECK only. So UPDATE is the only command that carries both clauses, which is exactly how section 3.4 of the plan writes them. Rule 5 of the kickoff is satisfied by that shape; both clauses on an insert or a delete is not valid SQL. https://www.postgresql.org/docs/current/sql-createpolicy.html - 22 Sep 2026
- USING filters which existing rows are visible or modifiable; WITH CHECK validates the new or changed row. If WITH CHECK is omitted the USING expression applies to both, which is why every update policy here states both explicitly. https://www.postgresql.org/docs/current/ddl-rowsecurity.html - 22 Sep 2026
- `ALTER TABLE t ENABLE ROW LEVEL SECURITY;` and, with no policy present, "a default-deny policy is used, meaning that no rows are visible or can be modified". https://www.postgresql.org/docs/current/ddl-rowsecurity.html - 22 Sep 2026
- `ALTER TABLE t FORCE ROW LEVEL SECURITY;` makes the table owner subject to policies as well: "Table owners normally bypass row security as well, though a table owner can choose to be subject to row security". https://www.postgresql.org/docs/current/ddl-rowsecurity.html - 22 Sep 2026
- Performance: wrap the claim read in a select, `using ( (select auth.jwt() ->> 'org_id') = ... )`, because "Wrapping the function causes an initPlan to be run by the Postgres optimizer, which allows it to cache the results per-statement, rather than calling the function on each row". https://supabase.com/docs/guides/database/postgres/row-level-security - 22 Sep 2026
- Always name the role: "Always name the role a policy applies to, using the `to` clause." https://supabase.com/docs/guides/database/postgres/row-level-security - 22 Sep 2026
- Index every column a policy filters on: "Add an index on every column your policies filter on ... an unindexed filter column turns a read into a sequential scan." https://supabase.com/docs/guides/database/postgres/row-level-security - 22 Sep 2026
- Never use user_metadata in a policy: "creating an RLS policy that relies on the user_metadata claim can create security issues in your application as this information can be modified by authenticated end users". https://supabase.com/docs/guides/database/postgres/row-level-security - 22 Sep 2026

## Explicit grants on public tables

- "New tables in the public schema will no longer be exposed to the Data API automatically." Default for new projects from 30 May 2026, enforced on all existing projects from 30 October 2026. https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically - 22 Sep 2026
- The documented grants to expose a table are `grant select on public.<table> to anon;` and `grant select, insert, update, delete on public.<table> to authenticated;`. This schema grants to authenticated only; anon gets nothing, because the only unauthenticated write path is the public intake form and that runs through a server side route, not the Data API. https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically - 22 Sep 2026

## Storage

- Object access is controlled by policies on the storage.objects table itself, and the first path segment is read with `(storage.foldername(name))[1]`, as in `create policy "Allow authenticated uploads" on storage.objects for insert to authenticated with check ( bucket_id = 'my_bucket_id' and (storage.foldername(name))[1] = 'private' );`. https://supabase.com/docs/guides/storage/security/access-control - 22 Sep 2026
- Not verified and therefore not relied on: the published signature and return type of storage.foldername and storage.filename. That page shows the usage but not the signatures, so the schema uses only the documented `(storage.foldername(name))[1]` form.

## The role claim: a contradiction with the plan, and the fix

- The standard `role` claim in a Supabase access token is "The Postgres role to use when applying Row Level Security policies". https://supabase.com/docs/guides/auth/jwts - 22 Sep 2026
- Section 3.3 of the plan says the hook "stamps org_id, role and seat_id". Taken literally that overwrites the claim above with org_admin, manager or loan_officer, and every request would then try to run as a Postgres role of that name. The portal role is therefore carried in a separate claim named org_role, and `role` is left as authenticated. Our own live reference repository does the same thing under the name app_role, so this is the house pattern and not an invention.
- Proven, not assumed: supabase/tests/isolation.sql asserts that the hook returns `role` still equal to authenticated and `session_id` untouched, alongside the three claims it adds.

## Testing the database half locally

- Library added beyond the plan, per rule 9: @electric-sql/pglite 0.5.8, a devDependency only. Justification: it is PostgreSQL compiled to WebAssembly, so the schema and the policies can be executed by the real engine with no server, container or network, which turns Day 1's gate from a claim into a test. https://www.npmjs.com/package/@electric-sql/pglite - 22 Sep 2026
- Disclosure, because it bounds what the local run proves: the engine reported by that build is "PostgreSQL 18.3 (PGlite 0.5.8)", while the managed project runs Postgres 17. Everything the schema uses (row level security, CREATE POLICY, FORCE ROW LEVEL SECURITY, SECURITY DEFINER, jsonb, identity columns) long predates either version, but the local run is not a substitute for running the same two files on the project. Observed in the run recorded at docs/evidence/schema-tests.txt - 22 Sep 2026
- `pg_temp` is a search path alias and cannot be named in a GRANT; the real schema name comes from `pg_my_temp_schema()`. Observed directly: `grant usage on schema pg_temp` fails with "schema pg_temp does not exist". https://www.postgresql.org/docs/current/sql-grant.html - 22 Sep 2026

## Two defects the local run caught

- A function declared `stable` cannot execute a data modifying statement, so the access token hook must be volatile: it writes to seats when it claims one. https://www.postgresql.org/docs/current/xfunc-volatility.html - 22 Sep 2026
- One trigger function serving several tables must not name a column of any one of them. The audit trigger converts the row to jsonb and asks whether the key is present, because `organizations` is the tenant itself and is keyed by id with no org_id column. Caught by the test run as "null value in column org_id of relation audit_log violates not-null constraint".

## Server side auth in Next.js

- The browser client, the server client and the proxy client are taken verbatim from the official guide, including the comment "Do not run code between createServerClient and supabase.auth.getClaims()". The environment variable names in that guide are NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, which is what .env.example uses. https://supabase.com/docs/guides/auth/server-side/nextjs - 22 Sep 2026
- "Never trust supabase.auth.getSession() inside server code such as Proxy. It reads the session out of the cookie without revalidating it." getClaims verifies the token signature on every call, locally against a cached JWKS when the project uses asymmetric signing keys. Same URL - 22 Sep 2026
- getClaims also refreshes: "If the user's access token is about to expire when calling this function, the user's session will first be refreshed before validating the JWT." That refresh is the moment the access token hook re-runs, which is what makes seat enforcement take effect. https://supabase.com/docs/reference/javascript/auth-getclaims - 22 Sep 2026
- "The returned claims can be customized per project using the Custom Access Token Hook." Same URL - 22 Sep 2026
- Returning a different response from the proxy requires carrying the refreshed cookies and the cache headers across, otherwise "you may be causing the browser and server to go out of sync and terminate the user's session prematurely". Both redirects in lib/supabase/proxy.ts go through one helper that does this. https://supabase.com/docs/guides/auth/server-side/nextjs - 22 Sep 2026
- Correction to that guide, observed while building: it writes the carry across as `myNewResponse.cookies.setAll(...)`, but ResponseCookies in Next.js 16 exposes get, getAll, set and delete only. `tsc` rejects setAll with TS2551. The helper sets each cookie in turn, and each entry already carries its options. Observed on next 16.3.5 - 22 Sep 2026
- The framework's own warning, which is why every action calls requireClaims rather than trusting the proxy: "Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone", because a matcher change or a refactor can silently remove proxy coverage. https://nextjs.org/docs/app/api-reference/file-conventions/proxy - 22 Sep 2026

## signOut scopes

- "the default scope is 'global'. This signs the user out of every device they are currently signed in on, not just the current tab/session. If you only want to sign the user out of the current session ... pass { scope: 'local' } explicitly." The sign out button therefore states local. https://supabase.com/docs/reference/javascript/auth-signout - 22 Sep 2026
- The Sessions screen's "sign out other devices" uses the third scope, which signs out all other sessions and keeps the current one. Documented caveat carried into the UI copy: "Since Supabase Auth uses JWTs ... the access token JWT will be valid until it's expired. When the user signs out, Supabase revokes the refresh token and deletes the JWT from the client-side. This does not revoke the JWT and it will still be valid until it expires." Same URL - 22 Sep 2026
- Also documented and worth knowing when wiring listeners: "If using others scope, no SIGNED_OUT event is fired!" Same URL - 22 Sep 2026

## Seat takeover, corrected

- The hook event carries authentication_method, whose documented values include password and token_refresh. https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook - 22 Sep 2026
- Correction to what was built in the previous step: the hook refused any session whose id differed from the seat's, which locks a person out of their own seat the moment they change machine. Section 3.3 of the plan specifies takeover, not lockout. The rule now turns on authentication_method: a fresh sign in takes the seat, a refresh from a session that no longer holds it is refused. A new test asserts both halves.

## Running the tests against the project

- Library added beyond the plan, per rule 9, at the Solutions Lead's direction: pg 8.23.0, a devDependency only, used by scripts/test-schema.mjs when DATABASE_URL is present so the same two files run against the project's own Postgres with no emulation. https://www.npmjs.com/package/pg - 22 Sep 2026
- process.loadEnvFile is available in this Node build, so the scripts read .env.local without a dotenv dependency. Verified by running `node -e "console.log(typeof process.loadEnvFile)"`, which printed "function" on Node 25.6.1. https://nodejs.org/api/process.html - 22 Sep 2026

## Two things next dev does to the repository

- `next dev` writes agent instruction files into the repository root on every start, and re-adds them if removed: "This block is written and re-added by `next dev`". The generator is switched off with `agentRules: false` in the Next config, which the tool's own message names. Observed on next 16.3.5, and the setting is read back from the running config - 22 Sep 2026
- Without `turbopack.root`, Turbopack searches upward for a lock file and can adopt one from outside the repository: "Next.js ignored package-lock.json in <home> because it is outside the current Git repository ... To use this directory, set `turbopack.root` in your Next.js config." Set to the repository root. Observed on next 16.3.5 - 22 Sep 2026
- Both were caught by the repository guard rather than by review, which is the point of it. The guard now also checks file and directory names, not only contents, and refuses the literal banned words in its own tracked files: the .gitignore entry for the generated file is written as a character class for that reason.
- Scope correction to guard check 6, stated because it narrows a claim made in the previous report: the build output is scanned for the client, sister company, person and platform names only. It is not scanned for AI tool names, because a bundled dependency carries such strings in its own docstrings: one vendored source map contains an example vector index name built from a model vendor's name. That is neither ours to remove nor evidence of anything. Everything this repository authors is still checked for both sets.

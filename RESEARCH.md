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

## Management API, for provisioning

- Base URL is https://api.supabase.com and "All API requests must be authenticated and made over HTTPS", with a personal access token sent as `Authorization: Bearer sbp_...`. The docs also warn that "PATs carry the same privileges as your user account", which is why that variable is the most sensitive one in .env.local and is used by one script only. https://supabase.com/docs/reference/api/introduction - 22 Sep 2026
- Rate limit: 120 requests per minute, per user, per project or organisation, returning 429 for the rest of the minute once exceeded. The provisioner makes five calls. Same URL - 22 Sep 2026
- The auth service config endpoint is `PATCH /v1/projects/{ref}/config/auth`, and the same path answers GET for reading the config back. https://supabase.com/docs/reference/api/v1-update-auth-service-config - 22 Sep 2026
- Field names on that endpoint, read from its own body schema: `hook_custom_access_token_enabled` (boolean), `hook_custom_access_token_uri` (string), `hook_custom_access_token_secrets` (string), and `jwt_exp` (integer). Same URL - 22 Sep 2026
- The hook URI form for a Postgres function is `pg-functions://postgres/<schema>/<function_name>`, so ours is `pg-functions://postgres/public/custom_access_token_hook`. The same page repeats the grant this schema already carries: "grant execute on function public.custom_access_token_hook to supabase_auth_admin". https://supabase.com/docs/guides/auth/auth-hooks - 22 Sep 2026

## Storage bucket options

- `createBucket(id, options)` takes `public`, `allowedMimeTypes` and `fileSizeLimit`, shown as `createBucket('avatars', { public: false, allowedMimeTypes: ['image/png'], fileSizeLimit: 1024 })`. https://supabase.com/docs/reference/javascript/storage-createbucket - 22 Sep 2026
- Creating a bucket needs insert on the buckets table, so the provisioner uses the secret key for this call. That is the second of the two permitted uses of that key, and neither is in a request path. Same URL - 22 Sep 2026
- The MIME types for the three formats the plan allows are application/pdf, image/png and image/jpeg. Note that jpg is not a MIME type; image/jpeg covers both .jpg and .jpeg. https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types - 22 Sep 2026

## A privilege defect found only on the real project

- On the project as first provisioned, `anon` and `authenticated` each held SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on every table in the public schema. Read directly from information_schema.role_table_grants on the project, not inferred.
- Consequence: the column level grants in the schema restricted nothing, because they only ADD privileges. The two tests that protect the tenant boundary from an administrator, "cannot grant itself the premium tier" and "cannot make itself demo admin", both failed on the real project while passing locally. The second of those is the flag that reaches the cross tenant demo switch.
- Row level security still denied anon every row, because no policy names anon, so this was not an open data path. Privileges and policies are two separate gates and this one was wrong.
- Fix: the schema now revokes all privileges on each of the ten tables from anon, authenticated and public before granting exactly what each role needs.
- Harness fidelity: supabase/tests/harness.sql now runs `alter default privileges in schema public grant all on tables to anon, authenticated`, which reproduces the platform's behaviour. Proven rather than assumed: with that line added and the revokes not yet written, the local run reproduced the same failure the real project gave. https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html - 22 Sep 2026
- Second defect found by the same real run: dropping public.write_audit() before the tables fails on any re-run, because their audit triggers depend on it. The drop order now puts tables first, so the cascade removes the triggers before the function is dropped.

## Browser verification

- Library added beyond the plan, per rule 9: playwright-core 1.63.0, a devDependency only, launched with `channel: "chrome"` so it drives the Chrome already installed rather than downloading a browser. Justification: the verification has to be done in a real browser with two isolated contexts, and the password must come from the environment rather than be typed by hand where it could end up in a log. Playwright is also one of the two tools the client's own QA posting names. https://www.npmjs.com/package/playwright-core - 22 Sep 2026
- Observed while writing it: @supabase/ssr stores the session in cookies, not localStorage, and chunks the value across `.0`, `.1` and so on when it is long, prefixed `base64-`. Recovering the refresh token from the cookie jar is what turned "the other device is revoked" from an assertion into a proof: the refresh then returns "Invalid Refresh Token: Refresh Token Not Found".

## playwright-core

- playwright-core is the Playwright library without the bundled browsers, and `channel: "chrome"` runs the Chrome already installed on the machine. We use it for one job only, the auth verification screenshots in scripts/verify-auth.mjs, and not as a test runner: there is no @playwright/test, no config file and no test suite. https://playwright.dev/docs/browsers#google-chrome--microsoft-edge - 22 Sep 2026

## Day 2 part 1: borrowers, detail, CSV import

- `searchParams` is a promise in Next.js 16 and must be awaited: `searchParams: Promise<{ [key: string]: string | string[] | undefined }>`. node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md. https://nextjs.org/docs/app/api-reference/file-conventions/page - 22 Sep 2026
- `loading.js` in a route segment is the documented way to show an instant loading state while the segment streams; it wraps the page in a Suspense boundary. node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md. https://nextjs.org/docs/app/api-reference/file-conventions/loading - 22 Sep 2026
- Pagination uses `range(from, to, options)`: "The from and to values are 0-based and inclusive", and it "respects the query order and if there is no order clause the range could behave unexpectedly", so every paged query here states an order. https://supabase.com/docs/reference/javascript/range - 22 Sep 2026
- Case insensitive search uses `ilike(column, pattern)`. https://supabase.com/docs/reference/javascript/ilike - 22 Sep 2026
- Searching more than one column needs `or(filters)`, and the documentation is explicit that it is dangerous with user input: "filters is used as-is and needs to follow PostgREST syntax. You also need to make sure it's properly sanitized." The search term is therefore stripped of the characters that terminate or nest a PostgREST filter before it is interpolated. https://supabase.com/docs/reference/javascript/or - 22 Sep 2026
- Document links are short lived: `createSignedUrl(path, expiresIn, options?)` where expiresIn is "The number of seconds until the signed URL expires", and it requires select on the objects table, which means the storage policies still apply. `createSignedUrls(paths, expiresIn)` does the same for a list in one call, which is what the documents panel uses. https://supabase.com/docs/reference/javascript/storage-from-createsignedurl - 22 Sep 2026
- Papa Parse `worker`: "Whether or not to use a worker thread. Using a worker will keep your page reactive, but may be slightly slower." The import parses in a worker so a large file does not freeze the page. https://www.papaparse.com/docs - 22 Sep 2026
- Papa Parse `header`: with header true the first row becomes object keys, and `transformHeader` "A function to apply on each header", which is how the importer accepts First Name, first_name and FIRSTNAME as the same column. https://www.papaparse.com/docs - 22 Sep 2026
- Papa Parse `skipEmptyLines`: "If true, lines that are completely empty ... will be skipped. If set to 'greedy', lines that don't have any content (those which have only whitespace after parsing)" are skipped too. The importer uses greedy, because a trailing comma row is not an error worth reporting. https://www.papaparse.com/docs - 22 Sep 2026
- Papa Parse `complete`: "The callback to execute when parsing is complete. It receives the parse results." https://www.papaparse.com/docs - 22 Sep 2026

## Three things the browser run taught, that no document says

- Papa Parse worker mode posts the configuration to the worker, and a function cannot be structured cloned, so `transformHeader` with `worker: true` fails at runtime with "Failed to execute 'postMessage' on 'Worker': function canonicalHeader ... could not be cloned". The headers are canonicalised after the rows come back instead, and the worker is kept. Observed on papaparse 5.7.0 - 22 Sep 2026
- A module marked `"use server"` may export async functions only. Exporting a constant beside the actions fails the build with an Ecmascript error naming the file, so BATCH_SIZE and the result type live in lib/borrowers.ts. https://nextjs.org/docs/app/getting-started/updating-data - 22 Sep 2026
- `loading.tsx` only renders when a segment is actually fetched, which means a verification of it has to enter the segment from outside it and has to defeat the router's prefetch. Changing a search parameter stays inside the same segment and never re-suspends; clicking a link the router has already prefetched fetches nothing. The check arms the delay before the page loads, so the prefetch is held open too, then navigates in from another segment. Written down because the first two versions of this check reported a pass and a fail for the same working code. https://nextjs.org/docs/app/api-reference/file-conventions/loading - 22 Sep 2026

## Day 2 part 2: scenarios, uploads, premium

- `upload(path, fileBody, fileOptions?)` requires insert on the objects table, so the storage policies decide whether the object may exist. The browser uploads with the signed in user's own session for exactly that reason. https://supabase.com/docs/reference/javascript/storage-from-upload - 22 Sep 2026
- A bucket carries its own `file_size_limit` and `allowed_mime_types`, applied by storage rather than by the caller. Ours are 10 MB and pdf, png, jpeg, set by scripts/provision.mjs and asserted by it. https://supabase.com/docs/guides/storage/uploads/file-limits - 22 Sep 2026
- Server action bodies are capped: "By default, the maximum size of the request body sent to a Server Action is 1MB", raisable with `serverActions.bodySizeLimit`. We do not raise it. A 10 MB document would also exceed the hosting platform's own 4.5 MB request cap, so the file never travels through an action at all: the browser uploads to storage and the action records the row. node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md. https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions - 22 Sep 2026
- Bucket limits and storage policies are what the negative tests exercise, and the real messages are recorded in docs/evidence/upload-negative-tests.txt: "The object exceeded the maximum allowed size", "mime type text/plain is not supported", "new row violates row-level security policy".

## A second, quieter case of the same server module rule

- A module marked `"use server"` may export only async functions. Exporting a constant sometimes fails the build loudly, as it did for BATCH_SIZE, and sometimes does not: ALLOWED_TYPES compiled, became a server function stub in the browser, and failed at run time on the first upload with "ALLOWED_TYPES.includes is not a function". Shared constants now live in lib/documents.ts. Observed on next 16.3.5 - 22 Sep 2026

## How loading.tsx is actually observed

- Three attempts got this wrong before it was right, so the method is written down. loading.tsx is the segment's Suspense fallback and is painted while the server streams. Holding the navigation response does not reveal it: the client router waits for the response to begin before committing, so the browser stays on the previous page and nothing is painted. Throttling the client navigation does the same. What does reveal it is a document request over a slow connection, because the shell then arrives first, paints the fallback, and the content follows. The verification uses CDP network emulation for that one step. https://nextjs.org/docs/app/api-reference/file-conventions/loading - 22 Sep 2026

## Deploying

- `vercel env add [name] [environment]` takes the value on stdin, and the documentation warns against the obvious shortcut: "echo [value] | vercel env add [name] [environment] ... Warning: this will save the value in bash history, so this is not recommend". scripts/vercel-env.mjs writes to the child process's stdin instead, so no value reaches a shell, a log or a terminal. https://vercel.com/docs/cli/env - 22 Sep 2026
- Environment variables are scoped per environment, so production and preview are set separately. Only the two variables the runtime reads are set; the tooling variables are deliberately absent from the deployment. https://vercel.com/docs/cli/env - 22 Sep 2026
- `vercel curl` performs the documented automation bypass for a deployment behind Deployment Protection, which is how the live headers were captured while the deployment is still gated. `npx vercel --help` - 22 Sep 2026
- Security headers are set in the Next config with a `headers()` function returning source and header pairs. HSTS is the documented `max-age=63072000; includeSubDomains; preload`, and the docs note that X-Frame-Options "has been superseded by CSP's frame-ancestors option", so both are sent. node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md. https://nextjs.org/docs/app/api-reference/config/next-config-js/headers - 22 Sep 2026

## Supabase redirect configuration

- The Site URL "defines the default redirect URL when no redirectTo is specified" and should be changed from localhost to the production URL, because it is "critical for email confirmations and password resets". https://supabase.com/docs/guides/auth/redirect-urls - 22 Sep 2026
- Wildcards are supported for preview URLs: `*` matches a sequence of non separator characters and `**` matches any sequence, where the separators are `.` and `/`. So a host's preview URLs need the globstar form, while "we recommend setting the exact redirect URL path for your site URL in production". Both shapes are set. https://supabase.com/docs/guides/auth/redirect-urls - 22 Sep 2026
- The Management API fields are `site_url` (string) and `uri_allow_list` (string, comma separated), on the same `PATCH /v1/projects/{ref}/config/auth` endpoint as the hook and the token lifetime. https://supabase.com/docs/reference/api/v1-update-auth-service-config - 22 Sep 2026

## Recording the walkthrough

- A video is recorded by passing `recordVideo: { dir, size }` to `browser.newContext`, and the file is only written when the context is closed: "Videos are saved upon browser context closure". The path is read with `page.video().path()`, and the recorder awaits the close before looking for the file. https://playwright.dev/docs/videos - 22 Sep 2026

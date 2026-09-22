# Verification

The fourteen checks the build plan defines as done, plus the two defects that
were found by running them. Every line points at a command you can run or a
file of real output. Nothing here says "verified" on its own authority.

Unless a row says otherwise, everything was run against the real project on
its own PostgreSQL 17.6, not against a local emulator.

Dates are 22 September 2026.

## How to re-run all of it

```bash
npm run sweep              # secrets, across the whole git history
npm run test:schema        # schema and 31 isolation tests, on the real project
npm run verify:uploads     # upload refusals, through the API, browser bypassed
npm run dev                # then, in another terminal:
npm run verify:auth        # sign in, seat takeover, sign out other devices
npm run verify:borrowers   # list, detail, CSV import, cross tenant, 390px
npm run verify:scenarios   # scenarios, uploads, premium gate, cross tenant
npm run verify:scale       # 5,000 row import, list timing, query plan
npm run guard              # names, paths, env files, build output
npm run guard:selftest     # proves the guard can still fail
```

## The fourteen

| # | Claim | How it is proved | Evidence |
| --- | --- | --- | --- |
| 1 | Cross tenant read returns nothing. As a seat in one organisation, ask for another's borrowers, documents, scenarios, results, submissions, ledger, audit, intake links, seats and organisations by id. | `npm run test:schema`, checks "every seat sees its own tenant in full" and "cross tenant read returns zero rows". Ten tables queried by foreign org_id, for each of the nine seats. | `docs/evidence/schema-tests-real.txt` |
| 2 | Cross tenant write is refused. Insert a borrower carrying another organisation's org_id. | `npm run test:schema`, check "cross tenant insert is rejected". Asserts SQLSTATE 42501 specifically, not merely an error. | `docs/evidence/schema-tests-real.txt` |
| 3 | A row cannot be moved between tenants. Update a borrower's org_id to another organisation. | `npm run test:schema`, check "changing org_id on a row is rejected", SQLSTATE 42501 from WITH CHECK. | `docs/evidence/schema-tests-real.txt` |
| 4 | Storage is bounded the same way. Write into, and read from, another organisation's folder. | `npm run verify:uploads`, checks 3 and 4, run as a signed in seat through the API with the browser bypassed entirely. Refusal text: "new row violates row-level security policy"; listing returns 0 entries. Also `npm run verify:borrowers` proves a signed link resolves HTTP 200 for the owning tenant. | `docs/evidence/upload-negative-tests.txt`, `docs/screenshots/borrowers-run.md` |
| 5 | Role boundaries hold, including against an administrator. A loan officer cannot delete; an org_admin cannot grant itself the premium tier or the demo admin flag. | `npm run test:schema`, checks "loan_officer delete is refused" (0 rows affected and the row survives, because USING does not raise), "org_admin cannot grant itself the premium tier" and "org_admin cannot make itself demo admin" (42501, outside the column grant). | `docs/evidence/schema-tests-real.txt` |
| 6 | One live session per named seat, and a fresh sign in takes the seat over rather than locking the person out. | `npm run test:schema` checks "one live session per named seat" and "a fresh sign in takes the seat over". Then in a browser, `npm run verify:auth`: two isolated contexts, the seat moves, and the displaced device cannot get a new token, "Invalid Refresh Token: Refresh Token Not Found". | `docs/evidence/schema-tests-real.txt`, `docs/screenshots/README.md`, screenshots 02 to 05 |
| 7 | The public intake writes only into the organisation whose token was used, and an unauthenticated caller has no table access at all. | `npm run test:schema`, checks "anon has no table access", "public intake writes only into the token tenant", "unknown intake token is refused". The function takes no organisation argument, so the tenant cannot be chosen by the caller. | `docs/evidence/schema-tests-real.txt` |
| 8 | A 5,000 row CSV imports in under 60 seconds, with a per row error report. | `npm run verify:scale` against a production build: parsed and previewed in 3.5s, committed in 11.2s, **14.6s end to end**, all 5,000 inserted. The per row error list and its download are proved separately by `npm run verify:borrowers` on the sample file: 6 ready, 1 already held, 1 repeated in file, 4 lines with errors. | `docs/evidence/scale-and-explain.txt`, screenshot 13 |
| 9 | Every action leaves an audit row, visible only to the acting organisation, and the application cannot write one. | `npm run test:schema`, check "audit_log rejects application writes" (no insert grant, 42501) and "audit_log has no write grant for users". The acting seat is recorded: `npm run verify:scenarios` asserts an upload writes `documents.insert` with a seat present. | `docs/evidence/schema-tests-real.txt`, `docs/screenshots/scenarios-run.md` |
| 10 | No secret reaches the browser, and none is in the history. | `npm run sweep` scans every commit on every ref for key shapes and for the literal values in `.env.local`: clean. The runtime reads exactly two variables, both public: `grep -rhoE "process\.env\.[A-Z_0-9]+" app lib components proxy.ts next.config.ts` returns `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and nothing else. Only those two are set on the deployment. | `docs/evidence/secret-sweep.txt` |
| 11 | A signed out request to any portal route lands on sign in, and `getClaims` runs before anything else. | `npm run verify:auth`, check "a signed out browser asking for a portal route lands on sign in". The call order is in `lib/supabase/proxy.ts`, with the guide's own warning kept as a comment. Every server action also calls `requireClaims()` rather than trusting the proxy, because a matcher change can silently remove proxy coverage. | `docs/screenshots/README.md`, screenshot 07 |
| 12 | The list stays fast at 5,000 rows, and the tenant filter uses an index. | `npm run verify:scale` against a production build: first page rendered in **0.68s**. `explain (analyze)` run as the `authenticated` role under the policies shows `Index Scan using borrowers_org_name_idx`, `Index Cond: (org_id = ((InitPlan 1).col1)::uuid)`, execution 0.120 ms. The `InitPlan` is the select wrapped claim being evaluated once per statement rather than per row. | `docs/evidence/scale-and-explain.txt` |
| 13 | Every screen is usable at 390 pixels. | `npm run verify:borrowers` and `npm run verify:scenarios` assert no horizontal overflow at 390 and capture the layouts. | Screenshots 19, 20, 21, 23, 37, 38, 39, 40 |
| 14 | The build passes with TypeScript strict, ESLint clean, and no legacy keys anywhere. | `npm run build`, `npx tsc --noEmit`, `npx eslint .` all clean. `npm run guard` refuses any tracked or staged environment file, any banned name in content or in a path, and scans the deployable build output. `npm run guard:selftest` proves the guard still fails when it should. The project uses publishable and secret keys only; the guard's key check would refuse a legacy `service_role` reference in code. | `docs/evidence/guard-selftest.txt`, `docs/evidence/name-sweep.txt` |

## The two defects the tests found

These are here because a verification document that only lists passes is not
evidence that the tests bite.

| # | Defect | How it surfaced | What changed | Evidence |
| --- | --- | --- | --- | --- |
| 15 | **The platform's default privileges made the column level grants useless.** `anon` and `authenticated` each held SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on every table in the public schema. A GRANT only ever adds, so the narrow grants sat on top of a wide one and restricted nothing: an org_admin could set the premium tier and, worse, the flag that reaches the cross tenant demo switch. Row level security still denied `anon` every row, so no data was reachable, but privileges and policies are two gates and one was open. | The isolation tests **failed on the real project while passing locally**. The local engine had no such default privileges to inherit. | The schema now revokes all privileges on the ten tables from `anon`, `authenticated` and `public` before granting. The test harness was taught the same default privileges, and with that line in place and the revokes absent it reproduced the real failure, so the local run catches this class of defect from now on. | `docs/evidence/privilege-defect-and-fix.txt` |
| 16 | **A `"use server"` module may export only async functions, and it fails quietly.** Exporting `BATCH_SIZE` from an actions file failed the build loudly. Exporting `ALLOWED_TYPES` compiled, turned into a server function stub in the browser, and broke the first document upload at run time with "ALLOWED_TYPES.includes is not a function". | The build for the first case. The browser, on the first upload, for the second. | Shared constants moved to `lib/borrowers.ts` and `lib/documents.ts`. | `RESEARCH.md`, sections "Three things the browser run taught" and "A second, quieter case of the same server module rule" |

## What is not proved here

Stated so that nothing above is read as more than it is.

- The matching service and the property intelligence panel are local stubs.
  They are deterministic and call nothing. No external lending or property API
  is contacted anywhere in this repository.
- The local engine used by `npm run test:schema -- --local` is PostgreSQL
  compiled to WebAssembly and reports a different version from the managed
  project. It is a fast first pass, not the evidence. Every result quoted
  above is from the real project, and each evidence file records which mode
  produced it.
- Load beyond 5,000 rows in one tenant has not been measured.

## Sources

Every version, flag, API shape and platform limit this build relies on is
recorded in [RESEARCH.md](RESEARCH.md) with the official URL and the date it
was read.

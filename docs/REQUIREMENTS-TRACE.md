# Requirements trace

Every requirement in the job posting, in the order the client wrote it, with
where it lives in this prototype, how it was checked, and what the check
produced. Nothing here is marked done on the strength of an intention.

Where one sentence carries several requirements, it is split into a row each
and the sentence is quoted again, so the client's order is preserved and no
requirement hides inside another.

The client's company name is replaced with `[the client]` in the quotes. The
rule for this repository is that no client, person or company name appears in
it, and that rule is not waived for a document about the client.

Status means one of three things, and only these:

- **Verified live**: checked against the deployed application.
- **Verified on production build**: checked against `next build` plus
  `next start`, the same artefact that is deployed, and against the real
  project's own PostgreSQL. The deployment sits behind Vercel Deployment
  Protection, which answers an anonymous request with the host's own login
  page, so the browser suites cannot reach it until that is switched off.
  `npm run verify:live` runs all of it against the deployed alias in one
  command and refuses to produce a transcript until the URL actually serves
  the portal.
- **Out of prototype scope**: not built, with a line on how it lands in the
  full build.

## The portal, as the client described it

| # | Requirement | Where it lives | How it was verified | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | "Dedicated multi-tenant LO portal: **organizations**" | `organizations` table, `supabase/schema.sql`; tenant applied at `app/(portal)/layout.tsx` | Three lender organisations seeded; each seat sees exactly one. `npm run test:schema` check "every seat sees its own tenant in full". | `docs/evidence/schema-tests-real.txt` | Verified on production build |
| 2 | "...**named seats with session enforcement**" | `seats` table, `public.custom_access_token_hook`, `public.claim_seat_session`; screen at `/sessions`, `app/(portal)/sessions/page.tsx` | Two isolated browser contexts: the seat moves on a fresh sign in and the displaced session cannot obtain a new token, "Invalid Refresh Token: Refresh Token Not Found". Plus two SQL checks on the hook. | `docs/screenshots/README.md` (02 to 05), `docs/evidence/schema-tests-real.txt` | Verified on production build |
| 3 | "...**role-based permissions**" | `role` on `seats`, policies per table in `supabase/schema.sql`; enforced everywhere, visible at `/submissions` and `/settings` | A loan officer's delete affects 0 rows and the row survives; the submissions controls are inert and the page says the database refuses the write; branding is read only below administrator. | `docs/evidence/schema-tests-real.txt`, `docs/screenshots/workflow-run.md`, screenshots 53 and 57 | Verified on production build |
| 4 | "...**strict tenant data isolation at the API/database level**" | Row level security and `FORCE ROW LEVEL SECURITY` on ten tables, revoke before grant, policies keyed to a token claim, `supabase/schema.sql` | 32 isolation tests on the real project, including ten tables queried by a foreign tenant id for each of nine seats, and cross tenant insert and row move rejected at SQLSTATE 42501. In the browser: a second tenant sees its own 14 borrowers and none of the first tenant's, and the first tenant's borrower and scenario URLs render nothing. | `docs/evidence/schema-tests-real.txt`, `docs/screenshots/borrowers-run.md`, screenshots 16, 17, 36 | Verified on production build |
| 5 | "Persistent client profiles..." | `borrowers` table; `/borrowers` and `/borrowers/[id]` | 15 and 14 borrowers per tenant, searchable, filterable, paginated at 25, with the detail showing profile, scenarios, documents and activity. | `docs/screenshots/borrowers-run.md`, screenshots 10 to 12, 24 | Verified on production build |
| 6 | "...**with CSV import**..." | `/borrowers/import`, `app/(portal)/borrowers/import/*`, `lib/borrowers.ts` | A sample file gives 6 ready, 1 already held, 1 repeated in file, 4 lines with errors and a downloadable numbered error list; a 5,000 row file imports in 14.6 seconds end to end. | `docs/screenshots/borrowers-run.md`, `docs/evidence/scale-and-explain.txt`, screenshots 13, 14 | Verified on production build |
| 7 | "...**branded borrower intake**..." | `/intake/[token]`, `public.intake_branding`, `public.submit_intake` | With no session at all: the page carries the lender's name and accent, a submission lands in that tenant and the other is untouched at 14, the row is marked `intake`, and an unknown token renders no tenant name. A second tenant's link shows that tenant's branding. | `docs/screenshots/workflow-run.md`, screenshots 50, 51, 61 | Verified on production build |
| 8 | "...**and document management**" | `documents` table, `borrower-docs` bucket, `/borrowers/[id]` | Upload accepted and recorded with the acting seat; a text file refused; the signed link resolves HTTP 200 and carries a token; oversized, wrong type and foreign folder writes all refused by storage, not by application code. | `docs/evidence/upload-negative-tests.txt`, `docs/screenshots/scenarios-run.md`, screenshots 32, 33 | Verified on production build |
| 9 | "Financing scenarios **calling our matching API**..." | `lib/matching/*` behind `MatchingService`, HTTP shape at `/api/mock/matching`; `/scenarios/new` and `/scenarios/[id]` | The builder works the loan and LTV out as the numbers are typed; the results screen ranks the panel and states its source is the mock; the same scenario twice produces identical quotes. The real API replaces one line in `lib/matching/index.ts`. | `docs/screenshots/scenarios-run.md`, screenshots 30, 31 | Verified on production build |
| 10 | "...with **protected (anonymized, range-based) lender results**" | `scenario_results` table, `lib/matching/types.ts` | Results carry an alias and ranges only; no lender identity exists in the schema. Nobody holds update or delete on a quote: the isolation test "scenario results cannot be edited after the fact" fails the write at SQLSTATE 42501. | `docs/evidence/schema-tests-real.txt`, screenshot 31 | Verified on production build |
| 11 | "**Submission workflow**..." | `submissions` table with a status machine in `lib/submissions.ts`; `/submissions` | A manager moves a submission and the database row reads `in_review` afterwards; the move writes an audit row naming the acting seat. | `docs/screenshots/workflow-run.md`, screenshot 52 | Verified on production build |
| 12 | "...**ticket assignment**..." | `assigned_seat` on `submissions`; the assignment control at `/submissions` | Assignment is a manager action; the control is inert for a loan officer and the update policy refuses the write. | `docs/screenshots/workflow-run.md`, screenshot 53 | Verified on production build |
| 13 | "...**fee ledger**..." | `ledger_entries` table; `/ledger` | 14 entries across the three tenants, origination, referral and adjustment kinds, each against a submission. | `docs/screenshots/workflow-run.md`, screenshot 54 | Verified on production build |
| 14 | "...**and reconciliation**" | Period totals and unmatched flags at `/ledger` | Totals by month, reconciled against gross, and unmatched entries flagged with the outstanding amount rather than buried. | `docs/screenshots/workflow-run.md`, screenshot 54 | Verified on production build |
| 15 | "**Premium-tier integration with our property intelligence engine**" | `premium` on `organizations`, `lib/property-intelligence.ts`; `/property-intelligence` | A premium tenant sees valuations; a non premium tenant is denied on the server and the HTML sent to it contains none of the panel's data. An administrator cannot grant itself the tier: `premium` is outside the column level update grant. | `docs/screenshots/scenarios-run.md`, `docs/evidence/schema-tests-real.txt`, screenshots 34, 35 | Verified on production build |

## What this job actually buys

| # | Requirement | Where it lives | How it was verified | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| 16 | "THIS JOB is the paid M0 Discovery phase (fixed price): **API integration plan and contract**..." | Not built. The prototype is the evidence that the team can do the work; the integration plan is the M0 deliverable itself. | Not applicable. | Proposal draft, file 05 | Out of prototype scope. M0 produces an endpoint by endpoint map against the client's own contract, with the auth model and tenant scoping per endpoint and a gap list. |
| 17 | "...**portal screen flows**..." | Seventeen routes exist and are screenshotted at desktop and 390 pixels, which is the flow made concrete rather than drawn. | `npm run verify:borrowers`, `verify:scenarios`, `verify:workflow`. | `docs/screenshots/README.md` | Verified on production build |
| 18 | "...**and a milestone schedule**" | Not built. A schedule is written for the client's own six milestones, not for this prototype. | Not applicable. | Proposal draft, file 05 | Out of prototype scope. M0 produces the six milestone schedule to the pilot date with acceptance criteria and a review point per milestone. |
| 19 | "The full project is a **six-milestone**, five-figure USD engagement targeting a **November 30, 2026 pilot**." | Not a build requirement. | Not applicable. | Proposal draft, file 05 | Out of prototype scope. The schedule is an M0 deliverable and the date is treated as fixed. |

## How the client says they work

| # | Requirement | Where it lives | How it was verified | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| 20 | "fixed price per milestone, funded in escrow, released on written approval after our US-based team reviews your **Pull Requests**" | The repository is public, commits are small and one concern each, and the branch `preview-check` shows a branch building its own preview deployment. | `git log --oneline`, and a preview deployment built Ready in 20 seconds from a pushed branch. | Repository history, report 7 | Verified live |
| 21 | "**English required** for PRs, documentation, and formal communication" | Every file in the repository is in English. | Read. | Repository | Verified on production build |
| 22 | "All code and infrastructure owned by **[the client]** from day one." | The whole build is one repository with no hidden parts: schema, policies, tests, provisioning, seeding and verification scripts are all in it, and the deployment is reproducible from `supabase/SETUP.md`. | `npm run provision -- --apply-schema` then `npm run seed:users` reproduces the project from nothing. | `docs/evidence/provision.txt`, `supabase/SETUP.md` | Verified on production build |
| 23 | "Full SOW provided under NDA to shortlisted teams." | Nothing in this repository depends on the client's documents, and no external system is contacted. | The matching service and property panel are local stubs, stated as such on screen and in the files. | `lib/matching/mock.ts`, `lib/property-intelligence.ts` | Out of prototype scope. The SOW and the API contract are inputs to M0. |

## The skills the client listed

| # | Requirement | Where it lives | How it was verified | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| 24 | "PostgreSQL" | `supabase/schema.sql`, `supabase/tests/isolation.sql`, PostgreSQL 17.6 | 32 isolation tests on the real project, and a query plan read back with `explain (analyze)`. | `docs/evidence/schema-tests-real.txt`, `docs/evidence/scale-and-explain.txt` | Verified on production build |
| 25 | "React" | React 19.3 throughout `app/` | `npm run build` compiles 17 routes. | `docs/evidence/final-run.txt` | Verified on production build |
| 26 | "SaaS Development", "Web Development", "Full-Stack Development" | The whole application. | The suites above. | `docs/screenshots/` | Verified on production build |
| 27 | "API Integration" | `lib/matching/*` and `/api/mock/matching`, written against an interface so the real API replaces one line. | Deterministic results, source printed on screen. | `docs/screenshots/scenarios-run.md` | Verified on production build |
| 28 | "Software Architecture and Design" | `README.md` architecture diagram, threat model, and the SQL Server plus EF Core mapping. | Read. | `README.md` | Verified on production build |
| 29 | "User Authentication" | Supabase Auth with a custom access token hook, `proxy.ts`, `lib/auth.ts` | Sign in, seat takeover, sign out of other devices, signed out redirect. | `docs/screenshots/README.md` | Verified on production build |
| 30 | "FinTech" | Borrower data, fee ledger, protected lender quotes, audit trail the application cannot write to. | The suites above. | `docs/screenshots/` | Verified on production build |

## The five screening questions

| # | Question | Where the answer comes from | How it was verified | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| 31 | "Describe a multi-tenant system your team built: how exactly did you enforce tenant data isolation at the database/API level (not just the UI)? Include a reference we can contact." | This prototype is the answer to the first half, and it is open to inspection. The reference is the owner's to give. | 32 isolation tests, upload refusals, cross tenant browser checks. | `VERIFICATION.md`, `docs/evidence/` | Verified on production build |
| 32 | "Who would staff this project? Name roles, seniority, and the lead's English level." | Not a build question. | Not applicable. | Proposal draft, file 05 | Out of prototype scope. Answered in the proposal, with the named lead and QA owner left for the owner to fill. |
| 33 | "Have you integrated with financial, lending, or marketplace APIs? Give one concrete example." | Not a build question. | Not applicable. | Proposal draft, file 05 | Out of prototype scope. Answered in the proposal from the owner's own history only. |
| 34 | "Can your team start discovery by early to October 2026 and staff through November? (including holiday coverage)?" | Not a build question. | Not applicable. | Proposal draft, file 05 | Out of prototype scope. Answered in the proposal with a written daily overlap window. |
| 35 | "Our terms: payment per approved milestone only, PR review by our team before approval, corrections included in milestone price. Confirm you accept this model." | Not a build question. | Not applicable. | Proposal draft, file 05 | Out of prototype scope. Accepted as written in the proposal. |

## Totals

| Status | Count |
| --- | --- |
| Verified live | 1 |
| Verified on production build | 26 |
| Out of prototype scope | 8 |
| **Total** | **35** |

Everything marked "Verified on production build" becomes "Verified live" by
running `npm run verify:live` once Vercel Deployment Protection is switched
off. That is the one command, and it refuses to write a transcript until the
deployed URL actually serves the portal.

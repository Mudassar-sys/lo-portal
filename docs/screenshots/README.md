# Screenshots

Every image here is produced by a script, not taken by hand, so they can be
regenerated at any time and none of them goes stale by accident:

```bash
npm run verify:auth        # 01 to 07
npm run verify:borrowers   # 10 to 24
npm run verify:scenarios   # 30 to 40
npm run verify:workflow    # 50 to 61
```

Backend for every one of them: the real project, its own PostgreSQL 17.6,
provisioned by `scripts/provision.mjs` and seeded by `supabase/schema.sql`.
Not the local emulator, and not mock data. The counts visible on screen are
the seeded counts for that tenant.

The application itself is the production build, `next build` plus
`next start`, which is the same artefact that is deployed. The deployed URL
sits behind Vercel Deployment Protection at the time of writing, so it answers
an anonymous request with the host's own login page. `npm run verify:live`
re-runs all of this against the deployed alias in one command, and refuses to
write a transcript until that URL actually serves the portal.

The list page shows **25 rows per page** (`PAGE_SIZE` in `lib/borrowers.ts`).
Every list screenshot is taken at the same clean seed state, 15 borrowers for
the first tenant, except the pagination one, which is taken after an import
deliberately pushes that tenant past one page.

## Auth and seats

| file | what it proves |
| --- | --- |
| 01-sign-in-overview-harborline.png | Sign in works end to end, and the tenant's own name, accent and totals are on screen at first paint. |
| 02-sessions-seat-held-by-this-device.png | The seat roster, the active session id per seat, and this device holding one of them. |
| 03-second-device-took-the-seat.png | A second, isolated browser context signed in to the same seat. |
| 04-first-device-sees-the-seat-taken.png | The first device now reads the seat as in use elsewhere. |
| 05-sign-out-other-devices.png | Sign out other devices, with the ten minute caveat stated on screen rather than hidden. |
| 06-second-tenant-branding.png | A different lender organisation on the same deployment, with its own name and accent. |
| 07-signed-out-redirected-to-login.png | A signed out browser asking for a portal route gets the sign in page. |

## Borrowers, import and cross tenant

| file | what it proves |
| --- | --- |
| 10-borrowers-list-desktop.png | The list at the seeded state, 15 borrowers, one page. |
| 11-borrowers-search-empty-result.png | A search term made only of PostgREST filter punctuation is treated as text: no rows, no error. |
| 12-borrower-detail-desktop.png | Profile, financing scenarios, documents with expiring links, and the audit trail. |
| 13-csv-import-preview-desktop.png | What would happen, before anything is written: ready, already held, repeated in file, and the numbered error list. |
| 14-csv-import-summary-desktop.png | Inserted, skipped and failed after the commit. |
| 15-borrowers-loading-desktop.png | The `loading.tsx` skeleton, captured on a throttled document load. |
| 16-cross-tenant-other-org-list-desktop.png | A second organisation seeing its own 14 borrowers and none of the first tenant's. |
| 17-cross-tenant-direct-url-desktop.png | The first tenant's borrower URL, opened by the second tenant: no profile. |
| 18-cross-tenant-import-no-duplicates-desktop.png | The same CSV offered to the second organisation: nothing is already held, so duplicate detection is tenant scoped. |
| 19-borrowers-list-390.png | The same seeded state at 390 pixels, as a card list rather than a table. |
| 20-borrower-detail-390.png | Borrower detail at 390 pixels. |
| 21-csv-import-preview-390.png | Import preview at 390 pixels. |
| 22-borrowers-empty-desktop.png | The empty state on an organisation that holds nothing. |
| 23-borrowers-empty-390.png | The same at 390 pixels. |
| 24-borrowers-pagination-desktop.png | The pager, after an import takes the tenant past 25 rows. |

## Scenarios, uploads and the premium gate

| file | what it proves |
| --- | --- |
| 30-scenario-builder-desktop.png | The builder, working out the loan and the loan to value as the numbers are typed. |
| 31-scenario-results-desktop.png | The results screen: ranked, rate bands, why each lender matched, and what would change the ones that did not. |
| 32-document-upload-accepted-desktop.png | A PDF uploaded to the tenant's own folder and recorded with the acting seat. |
| 33-document-upload-refused-desktop.png | A text file refused. |
| 34-premium-panel-allowed-desktop.png | The premium panel on an organisation that has the tier. |
| 35-premium-panel-denied-desktop.png | The server side denial on an organisation that does not. The page carries none of the panel's data. |
| 36-cross-tenant-scenario-url-desktop.png | A scenario URL from one tenant, opened by another: nothing. |
| 37-scenario-builder-390.png | Builder at 390 pixels. |
| 38-scenario-results-390.png | Results at 390 pixels. |
| 39-premium-panel-allowed-390.png | Premium panel allowed, at 390 pixels. |
| 40-premium-panel-denied-390.png | Premium panel denied, at 390 pixels. |

## Intake, submissions, ledger, audit and branding

| file | what it proves |
| --- | --- |
| 50-intake-branded-desktop.png | The public intake page, opened with no session at all, carrying the lender's own name and accent. |
| 51-intake-submitted-desktop.png | A borrower submitted through that link. The row lands in the link's tenant and the other tenant is untouched. |
| 52-submissions-queue-desktop.png | The submission queue, ordered by what needs attention, with assignment and the status machine. |
| 53-submissions-loan-officer-desktop.png | The same queue for a loan officer: the controls are inert, and the page says the database refuses the write rather than hiding the button. |
| 54-ledger-reconciliation-desktop.png | The fee ledger totalled by month, with unmatched entries and the outstanding amount flagged. |
| 55-audit-desktop.png | The audit trail, filtered by table, written by a trigger the application cannot write to. |
| 56-organisation-branding-desktop.png | An administrator rebranding the organisation, and the tenant's own public intake link. |
| 57-organisation-readonly-desktop.png | The same page for a manager: the branding fields are read only. |
| 58-submissions-390.png | Submissions at 390 pixels. |
| 59-ledger-390.png | Ledger at 390 pixels. |
| 60-audit-390.png | Audit at 390 pixels. |
| 61-intake-second-tenant-390.png | A second tenant's intake link at 390 pixels, carrying that tenant's branding. |

## Run transcripts

- `auth-run.md`
- `borrowers-run.md`
- `scenarios-run.md`
- `workflow-run.md`
- `live-run.md`, written by `npm run verify:live`

Raw output from the checks that produce no image, including the secret sweep,
the upload refusals, the privilege defect, the scale run and the whole
sequence in order, is in [../evidence](../evidence). The walkthrough video is
in [../demo](../demo).

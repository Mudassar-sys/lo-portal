# Screenshots

Every screenshot here was produced by `npm run verify:auth`, which drives
Chrome through playwright-core against the running portal.

Backend for every one of them: the real project, its own PostgreSQL 17.6,
provisioned by `scripts/provision.mjs` and seeded by `supabase/schema.sql`.
Not the local PGlite engine, and not mock data. The counts visible on the
overview are the seeded counts for that tenant.

| file | what it proves |
| --- | --- |
| 01-sign-in-overview-harborline.png | Sign in works end to end, and the tenant's own name, accent and totals are on screen at first paint. |
| 02-sessions-seat-held-by-this-device.png | The seat roster, the active session id per seat, and this device holding one of them. |
| 03-second-device-took-the-seat.png | A second, isolated browser context signed in to the same seat. |
| 04-first-device-sees-the-seat-taken.png | The first device now reads the seat as in use elsewhere. |
| 05-sign-out-other-devices.png | Sign out other devices, with the ten minute caveat stated on screen rather than hidden. |
| 06-second-tenant-branding.png | A different lender organisation on the same deployment, with its own name and accent. |
| 07-signed-out-redirected-to-login.png | A signed out browser asking for a portal route gets the sign in page. |


## Borrowers, scenarios, uploads and the premium gate

The list page shows **25 rows per page** (`PAGE_SIZE` in `lib/borrowers.ts`).
Every list screenshot below is taken against the same clean seed state, 15
borrowers for this tenant, except the pagination one, which is taken after an
import deliberately pushes the tenant past one page.

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
| 18-cross-tenant-import-no-duplicates-desktop.png | The same CSV offered to the second organisation: nothing is "already held", so duplicate detection is tenant scoped. |
| 19-borrowers-list-390.png | The same seeded state at 390 pixels, as a card list rather than a table. |
| 20-borrower-detail-390.png | Borrower detail at 390 pixels. |
| 21-csv-import-preview-390.png | Import preview at 390 pixels. |
| 22-borrowers-empty-desktop.png | The empty state on an organisation that holds nothing. |
| 23-borrowers-empty-390.png | The same at 390 pixels. |
| 24-borrowers-pagination-desktop.png | The pager, after an import takes the tenant past 25 rows. |
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

Run transcripts: `borrowers-run.md` and `scenarios-run.md`. Upload refusals,
with the message storage actually returned, are in
`../evidence/upload-negative-tests.txt`.

## Run transcript

```
1. sign in, and branding on first paint
  pass  the overview names the seat's own tenant: Harborline Mortgage Group
        tenant accent on first paint: rgb(79, 124, 255)
        docs/screenshots/01-sign-in-overview-harborline.png
  pass  the tiles show this tenant's own totals: 15, 10, 6, 8

2. the seat is held by this device
  pass  exactly one seat row reads 'this device'
        seat active_session_id 68de5321-5400-4651-81a3-89d1b68be299
        docs/screenshots/02-sessions-seat-held-by-this-device.png

3. a second device takes the seat over
  pass  the seat moved to the second device's session
        seat active_session_id 0febda3c-30c0-46d0-b7e5-543937cce638
        docs/screenshots/03-second-device-took-the-seat.png
  pass  the first device no longer reads 'this device'
  pass  the first device now sees the seat as 'in use elsewhere'
        docs/screenshots/04-first-device-sees-the-seat-taken.png

4. sign out other devices
  pass  the action reports back on screen
  pass  the seat returned to the device that pressed the button
        seat active_session_id 68de5321-5400-4651-81a3-89d1b68be299
        docs/screenshots/05-sign-out-other-devices.png

5. the other device is genuinely revoked
  pass  device B still holds its session cookie
  pass  device B's refresh token was recovered from its cookie jar
  pass  device B can no longer obtain a token: Invalid Refresh Token: Refresh Token Not Found

6. white labelling, a second tenant on the same deployment
  pass  a different tenant, branded differently: Bayou City Lending Co
  pass  and a different accent on first paint: rgb(22, 163, 74)
        docs/screenshots/06-second-tenant-branding.png

7. signed out means signed out
  pass  a signed out browser asking for a portal route lands on sign in
        docs/screenshots/07-signed-out-redirected-to-login.png

all checks passed
```

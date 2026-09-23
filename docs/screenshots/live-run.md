# Live run

Produced by `npm run verify:live` against **https://fieldstone-portal.vercel.app**, in a real Chrome
window: `channel: "chrome"`, `headless: false`. Every requirement below
opens its own browser context and its own tab, so no step can pass on
state another step left behind, and every one of them writes a screenshot
into `live/` beside this file.

Runs: **2**, consecutive, each starting from a freshly
restored seed.

| run | checks failed | screenshots |
| --- | --- | --- |
| 1 | 0 | 45 |
| 2 | 0 | 45 |

Requirement rows covered live: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 24, 25, 26, 27, 29, 30, 31.

**RESULT: both runs clean.**


## Run 1

```
# Live run 1 of 2

target        https://fieldstone-portal.vercel.app
started       2026-09-23T04:07:24.591Z
browser       Chrome, channel "chrome", headless false
isolation     one browser context and one tab per requirement

Restoring the seed, so this run starts from the same state as the last.
    seed  test:schema: 32 passed, 0 skipped, 0 failed  (mode: real)
    seed  seed:documents: 12 uploaded, 0 already present

seeded        Harborline 15, Bayou City 14, Red Oak 11

ROW 24, 31  isolation tests against the database the live site is using
    pass  isolation tests on the live project: 32 passed, 0 skipped, 0 failed  (mode: real)

ROW 1  organizations: a seat sees one tenant, branded as itself
    pass  the overview names the seat's own tenant: Harborline Mortgage Group
    pass  the tiles show this tenant's own totals: 15,10,6,8
    note  accent on first paint rgb(79, 124, 255)
    shot  docs/screenshots/live/01-overview-tenant-one.png

ROW 1  organizations: a second tenant on the same deployment
    pass  a different lender, branded differently: Bayou City Lending Co
    pass  and a different accent: rgb(22, 163, 74)
    shot  docs/screenshots/live/02-overview-tenant-two.png

ROW 2, 29  named seats: a second device takes the seat, and is revoked
    pass  exactly one seat row reads 'this device'
    shot  docs/screenshots/live/03-seat-held-by-this-device.png
    pass  the seat moved to the second device's session
    shot  docs/screenshots/live/04-seat-taken-by-second-device.png
    pass  the first device now reads the seat as in use elsewhere
    shot  docs/screenshots/live/05-seat-in-use-elsewhere.png
    pass  sign out other devices returned the seat to this device
    shot  docs/screenshots/live/06-sign-out-other-devices.png
    pass  the displaced device's refresh token was recovered from its cookie jar
    pass  the displaced device cannot obtain a new token: Invalid Refresh Token: Refresh Token Not Found

ROW 29  signed out means signed out
    pass  a browser with no session asking for a portal route lands on sign in: /login
    shot  docs/screenshots/live/07-signed-out-redirected-to-login.png

ROW 5  persistent client profiles: list, search, filter
    pass  the list shows this tenant's 15 borrowers, saw 15
    shot  docs/screenshots/live/08-borrowers-list.png
    pass  searching for one borrower returns one row
    shot  docs/screenshots/live/09-borrowers-search.png
    pass  a search term made of filter punctuation is treated as text, not as syntax
    shot  docs/screenshots/live/10-borrowers-search-punctuation.png
    pass  the status filter narrows the list to 15
    shot  docs/screenshots/live/11-borrowers-filtered.png

ROW 5  persistent client profiles: the detail screen
    pass  the documents panel lists 2 objects from the tenant's own storage folder
    pass  the activity panel renders 2 rows from the audit table
    shot  docs/screenshots/live/12-borrower-detail.png

ROW 8  document management: the signed link resolves
    pass  the signed document link resolves, HTTP 200
    pass  the link is a signed URL rather than a public object path
    shot  docs/screenshots/live/13-document-signed-link.png

ROW 8  document management: upload accepted, and refused
    pass  the document was added, 2 then 3
    pass  the upload wrote an audit row naming the acting seat: documents.insert
    shot  docs/screenshots/live/14-document-upload-accepted.png
    pass  a text file is refused, on the server's terms
    shot  docs/screenshots/live/15-document-upload-refused.png

ROW 9, 27  financing scenarios: the builder and the results
    pass  the builder works the loan out as the numbers are typed: $492,000
    shot  docs/screenshots/live/16-scenario-builder.png
    pass  the panel returned 3 lenders that can take the file
    pass  the cheapest quote is marked
    pass  the lenders that could not take it say what would change that
    pass  the screen states its source: Quotes are stored as ranges against an alias and cannot be edited afte
    shot  docs/screenshots/live/17-scenario-results.png

ROW 10  protected lender results: aliases and ranges, and deterministic
    pass  the same scenario renders the same quotes, so the panel is deterministic
    pass  every quote is headed by an alias, never a lender: Lender A, Lender B, Lender C
    pass  and each rate is a range rather than a single quoted price: 6.375% to 6.875%
    shot  docs/screenshots/live/18-protected-lender-results.png

ROW 15  premium tier: allowed on a tenant that has it
    pass  the premium panel renders for a premium tenant
    shot  docs/screenshots/live/19-premium-allowed.png

ROW 15  premium tier: denied on the server for a tenant that does not
    pass  a non premium tenant is denied
    pass  and none of the panel's data is in the HTML sent to it, so the denial is the server's
    shot  docs/screenshots/live/20-premium-denied.png

ROW 4  tenant isolation: another organisation sees none of it
    pass  the second organisation sees its own 14 borrowers, saw 14
    pass  none of the first tenant's borrowers appear, 0 leaked
    shot  docs/screenshots/live/21-cross-tenant-list.png
    pass  the first tenant's borrower URL renders no profile
    shot  docs/screenshots/live/22-cross-tenant-borrower-url.png
    pass  the first tenant's scenario URL renders no scenario
    shot  docs/screenshots/live/23-cross-tenant-scenario-url.png
    pass  duplicate detection is tenant scoped: this organisation holds none of them, saw 0
    shot  docs/screenshots/live/24-cross-tenant-import-duplicates.png

ROW 7  branded borrower intake, with no session at all
    pass  the public page carries the lender's own name: Harborline Mortgage Group
    shot  docs/screenshots/live/25-intake-branded.png
    shot  docs/screenshots/live/26-intake-submitted.png
    pass  the borrower landed in the link's tenant, 15 then 16
    pass  the other tenant is untouched at 14
    pass  the row is marked as coming from intake: intake
    pass  an unknown token renders no tenant name at all
    shot  docs/screenshots/live/27-intake-unknown-token.png

ROW 6  CSV import: preview, the error list, and the summary
    note  ready 6, already held 1, repeated 1, rows with errors 4
    pass  6 rows are importable, saw 6
    pass  1 row is already held by this organisation, saw 1
    pass  1 row is repeated inside the file, saw 1
    pass  4 lines carry errors, saw 4
    pass  the error list names the line numbers from the file
    shot  docs/screenshots/live/28-csv-import-preview.png
    pass  the summary reports 6 inserted, saw 6
    pass  the tenant holds six more borrowers, 16 then 22
    shot  docs/screenshots/live/29-csv-import-summary.png

ROW 5  pagination, once a tenant holds more than one page
    pass  the pager appears past 25 rows, and the page label reads "1 of 3"
    pass  one page holds 25 rows, saw 25
    shot  docs/screenshots/live/30-borrowers-pagination.png

ROW 5  the empty state, on a tenant that holds nothing
    pass  an organisation with no borrowers gets the empty state, not a blank table
    shot  docs/screenshots/live/31-borrowers-empty.png

ROW 11, 12  submission workflow and ticket assignment, as a manager
    pass  the queue shows this tenant's submissions, 6 of them
    pass  assignment is offered to a manager, 6 controls
    shot  docs/screenshots/live/32-submissions-queue.png
    pass  a manager moved the submission, the database row now reads in_review
    pass  the move left an audit row naming the acting seat: submissions.update
    shot  docs/screenshots/live/33-submission-moved.png

ROW 3, 12  role based permissions: the same queue as a loan officer
    pass  the controls are inert for a loan officer, 4 disabled
    pass  and the page says the database refuses the write, rather than hiding the button
    shot  docs/screenshots/live/34-submissions-loan-officer.png

ROW 13, 14  fee ledger and reconciliation
    pass  the ledger totals by period, 2 periods
    pass  unreconciled entries are flagged rather than buried
    shot  docs/screenshots/live/35-ledger-reconciliation.png

ROW 30  the audit trail the application cannot write to
    pass  the trail renders 85 entries
    pass  filtering by table works
    shot  docs/screenshots/live/36-audit-trail.png

ROW 3  role based permissions: branding, as an administrator
    pass  the organisation's own public intake link is shown
    pass  an administrator can rebrand, the row now reads #7c5cff
    pass  and the tier is untouched by that write, because it is outside the column grant
    shot  docs/screenshots/live/37-settings-branding-administrator.png

ROW 3  role based permissions: the same page as a manager
    pass  the branding fields are read only for a manager, 3 disabled
    shot  docs/screenshots/live/38-settings-read-only-manager.png

ROW 17  portal screen flows at 390 pixels
    pass  /borrowers does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/39-390-borrowers.png
    pass  /scenarios does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/40-390-scenarios.png
    pass  /submissions does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/41-390-submissions.png
    pass  /ledger does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/42-390-ledger.png
    pass  /audit does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/43-390-audit.png

ROW 7, 17  the second tenant's intake link at 390 pixels
    pass  a second tenant's intake link carries that tenant's branding
    pass  and it does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/44-390-intake-tenant-two.png

ROW 25, 26  React, and the routes that make up the product
    pass  the live page is the React application, hydrated from its own chunks
    pass  every portal route answers: / 200, /borrowers 200, /scenarios 200, /submissions 200, /ledger 200, /audit 200, /settings 200, /sessions 200
    shot  docs/screenshots/live/45-portal-routes.png

finished      2026-09-23T04:17:41.850Z
requirements covered: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 24, 25, 26, 27, 29, 30, 31
screenshots:  45
RESULT: all checks passed
```

## Run 2

```
# Live run 2 of 2

target        https://fieldstone-portal.vercel.app
started       2026-09-23T04:17:41.850Z
browser       Chrome, channel "chrome", headless false
isolation     one browser context and one tab per requirement

Restoring the seed, so this run starts from the same state as the last.
    seed  test:schema: 32 passed, 0 skipped, 0 failed  (mode: real)
    seed  seed:documents: 12 uploaded, 0 already present

seeded        Harborline 15, Bayou City 14, Red Oak 11

ROW 24, 31  isolation tests against the database the live site is using
    pass  isolation tests on the live project: 32 passed, 0 skipped, 0 failed  (mode: real)

ROW 1  organizations: a seat sees one tenant, branded as itself
    pass  the overview names the seat's own tenant: Harborline Mortgage Group
    pass  the tiles show this tenant's own totals: 15,10,6,8
    note  accent on first paint rgb(79, 124, 255)
    shot  docs/screenshots/live/01-overview-tenant-one.png

ROW 1  organizations: a second tenant on the same deployment
    pass  a different lender, branded differently: Bayou City Lending Co
    pass  and a different accent: rgb(22, 163, 74)
    shot  docs/screenshots/live/02-overview-tenant-two.png

ROW 2, 29  named seats: a second device takes the seat, and is revoked
    pass  exactly one seat row reads 'this device'
    shot  docs/screenshots/live/03-seat-held-by-this-device.png
    pass  the seat moved to the second device's session
    shot  docs/screenshots/live/04-seat-taken-by-second-device.png
    pass  the first device now reads the seat as in use elsewhere
    shot  docs/screenshots/live/05-seat-in-use-elsewhere.png
    pass  sign out other devices returned the seat to this device
    shot  docs/screenshots/live/06-sign-out-other-devices.png
    pass  the displaced device's refresh token was recovered from its cookie jar
    pass  the displaced device cannot obtain a new token: Invalid Refresh Token: Refresh Token Not Found

ROW 29  signed out means signed out
    pass  a browser with no session asking for a portal route lands on sign in: /login
    shot  docs/screenshots/live/07-signed-out-redirected-to-login.png

ROW 5  persistent client profiles: list, search, filter
    pass  the list shows this tenant's 15 borrowers, saw 15
    shot  docs/screenshots/live/08-borrowers-list.png
    pass  searching for one borrower returns one row
    shot  docs/screenshots/live/09-borrowers-search.png
    pass  a search term made of filter punctuation is treated as text, not as syntax
    shot  docs/screenshots/live/10-borrowers-search-punctuation.png
    pass  the status filter narrows the list to 15
    shot  docs/screenshots/live/11-borrowers-filtered.png

ROW 5  persistent client profiles: the detail screen
    pass  the documents panel lists 2 objects from the tenant's own storage folder
    pass  the activity panel renders 2 rows from the audit table
    shot  docs/screenshots/live/12-borrower-detail.png

ROW 8  document management: the signed link resolves
    pass  the signed document link resolves, HTTP 200
    pass  the link is a signed URL rather than a public object path
    shot  docs/screenshots/live/13-document-signed-link.png

ROW 8  document management: upload accepted, and refused
    pass  the document was added, 2 then 3
    pass  the upload wrote an audit row naming the acting seat: documents.insert
    shot  docs/screenshots/live/14-document-upload-accepted.png
    pass  a text file is refused, on the server's terms
    shot  docs/screenshots/live/15-document-upload-refused.png

ROW 9, 27  financing scenarios: the builder and the results
    pass  the builder works the loan out as the numbers are typed: $492,000
    shot  docs/screenshots/live/16-scenario-builder.png
    pass  the panel returned 3 lenders that can take the file
    pass  the cheapest quote is marked
    pass  the lenders that could not take it say what would change that
    pass  the screen states its source: Quotes are stored as ranges against an alias and cannot be edited afte
    shot  docs/screenshots/live/17-scenario-results.png

ROW 10  protected lender results: aliases and ranges, and deterministic
    pass  the same scenario renders the same quotes, so the panel is deterministic
    pass  every quote is headed by an alias, never a lender: Lender A, Lender B, Lender C
    pass  and each rate is a range rather than a single quoted price: 6.375% to 6.875%
    shot  docs/screenshots/live/18-protected-lender-results.png

ROW 15  premium tier: allowed on a tenant that has it
    pass  the premium panel renders for a premium tenant
    shot  docs/screenshots/live/19-premium-allowed.png

ROW 15  premium tier: denied on the server for a tenant that does not
    pass  a non premium tenant is denied
    pass  and none of the panel's data is in the HTML sent to it, so the denial is the server's
    shot  docs/screenshots/live/20-premium-denied.png

ROW 4  tenant isolation: another organisation sees none of it
    pass  the second organisation sees its own 14 borrowers, saw 14
    pass  none of the first tenant's borrowers appear, 0 leaked
    shot  docs/screenshots/live/21-cross-tenant-list.png
    pass  the first tenant's borrower URL renders no profile
    shot  docs/screenshots/live/22-cross-tenant-borrower-url.png
    pass  the first tenant's scenario URL renders no scenario
    shot  docs/screenshots/live/23-cross-tenant-scenario-url.png
    pass  duplicate detection is tenant scoped: this organisation holds none of them, saw 0
    shot  docs/screenshots/live/24-cross-tenant-import-duplicates.png

ROW 7  branded borrower intake, with no session at all
    pass  the public page carries the lender's own name: Harborline Mortgage Group
    shot  docs/screenshots/live/25-intake-branded.png
    shot  docs/screenshots/live/26-intake-submitted.png
    pass  the borrower landed in the link's tenant, 15 then 16
    pass  the other tenant is untouched at 14
    pass  the row is marked as coming from intake: intake
    pass  an unknown token renders no tenant name at all
    shot  docs/screenshots/live/27-intake-unknown-token.png

ROW 6  CSV import: preview, the error list, and the summary
    note  ready 6, already held 1, repeated 1, rows with errors 4
    pass  6 rows are importable, saw 6
    pass  1 row is already held by this organisation, saw 1
    pass  1 row is repeated inside the file, saw 1
    pass  4 lines carry errors, saw 4
    pass  the error list names the line numbers from the file
    shot  docs/screenshots/live/28-csv-import-preview.png
    pass  the summary reports 6 inserted, saw 6
    pass  the tenant holds six more borrowers, 16 then 22
    shot  docs/screenshots/live/29-csv-import-summary.png

ROW 5  pagination, once a tenant holds more than one page
    pass  the pager appears past 25 rows, and the page label reads "1 of 3"
    pass  one page holds 25 rows, saw 25
    shot  docs/screenshots/live/30-borrowers-pagination.png

ROW 5  the empty state, on a tenant that holds nothing
    pass  an organisation with no borrowers gets the empty state, not a blank table
    shot  docs/screenshots/live/31-borrowers-empty.png

ROW 11, 12  submission workflow and ticket assignment, as a manager
    pass  the queue shows this tenant's submissions, 6 of them
    pass  assignment is offered to a manager, 6 controls
    shot  docs/screenshots/live/32-submissions-queue.png
    pass  a manager moved the submission, the database row now reads in_review
    pass  the move left an audit row naming the acting seat: submissions.update
    shot  docs/screenshots/live/33-submission-moved.png

ROW 3, 12  role based permissions: the same queue as a loan officer
    pass  the controls are inert for a loan officer, 4 disabled
    pass  and the page says the database refuses the write, rather than hiding the button
    shot  docs/screenshots/live/34-submissions-loan-officer.png

ROW 13, 14  fee ledger and reconciliation
    pass  the ledger totals by period, 2 periods
    pass  unreconciled entries are flagged rather than buried
    shot  docs/screenshots/live/35-ledger-reconciliation.png

ROW 30  the audit trail the application cannot write to
    pass  the trail renders 85 entries
    pass  filtering by table works
    shot  docs/screenshots/live/36-audit-trail.png

ROW 3  role based permissions: branding, as an administrator
    pass  the organisation's own public intake link is shown
    pass  an administrator can rebrand, the row now reads #7c5cff
    pass  and the tier is untouched by that write, because it is outside the column grant
    shot  docs/screenshots/live/37-settings-branding-administrator.png

ROW 3  role based permissions: the same page as a manager
    pass  the branding fields are read only for a manager, 3 disabled
    shot  docs/screenshots/live/38-settings-read-only-manager.png

ROW 17  portal screen flows at 390 pixels
    pass  /borrowers does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/39-390-borrowers.png
    pass  /scenarios does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/40-390-scenarios.png
    pass  /submissions does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/41-390-submissions.png
    pass  /ledger does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/42-390-ledger.png
    pass  /audit does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/43-390-audit.png

ROW 7, 17  the second tenant's intake link at 390 pixels
    pass  a second tenant's intake link carries that tenant's branding
    pass  and it does not scroll sideways at 390 pixels
    shot  docs/screenshots/live/44-390-intake-tenant-two.png

ROW 25, 26  React, and the routes that make up the product
    pass  the live page is the React application, hydrated from its own chunks
    pass  every portal route answers: / 200, /borrowers 200, /scenarios 200, /submissions 200, /ledger 200, /audit 200, /settings 200, /sessions 200
    shot  docs/screenshots/live/45-portal-routes.png

finished      2026-09-23T04:29:29.343Z
requirements covered: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 24, 25, 26, 27, 29, 30, 31
screenshots:  45
RESULT: all checks passed
```

## After the runs

```

Restoring the clean seed after the last run.
  test:schema: 32 passed, 0 skipped, 0 failed  (mode: real)
  seed:documents: 12 uploaded, 0 already present
```

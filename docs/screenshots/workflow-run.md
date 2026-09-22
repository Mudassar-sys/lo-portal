# Intake, submissions, ledger, audit and branding

```
1. the branded public intake, with no session at all
  pass  the page carries the lender's own name: Harborline Mortgage Group
        accent from the tenant record: rgb(79, 124, 255)
        docs/screenshots/50-intake-branded-desktop.png
        docs/screenshots/51-intake-submitted-desktop.png
  pass  the borrower landed in the link's tenant, 15 then 16
  pass  the other tenant is untouched at 14
  pass  the row is marked as coming from intake: intake
  pass  an unknown token renders no tenant name at all

2. submissions, as a manager
  pass  the queue shows this tenant's submissions, 6 of them
        docs/screenshots/52-submissions-queue-desktop.png
  pass  a manager can move a submission, the row now reads in_review
  pass  the move left an audit row with an acting seat: submissions.update

3. the same queue, as a loan officer
  pass  the controls are inert for a loan officer, 4 disabled
  pass  and the page says the database refuses the write, rather than hiding the button
        docs/screenshots/53-submissions-loan-officer-desktop.png

4. the fee ledger and reconciliation
  pass  the ledger totals by period, 2 periods
  pass  unreconciled entries are flagged rather than buried
        docs/screenshots/54-ledger-reconciliation-desktop.png

5. the audit trail
  pass  the trail renders 18 entries
  pass  filtering by table works, 5 submission entries
        docs/screenshots/55-audit-desktop.png

6. organisation branding
  pass  the organisation's own public intake link is shown
  pass  an administrator can rebrand, the row now reads #7c5cff
  pass  and the tier is untouched by that write
        docs/screenshots/56-organisation-branding-desktop.png

7. the same page, as a manager
  pass  the branding fields are read only for a manager, 3 disabled
        docs/screenshots/57-organisation-readonly-desktop.png

8. 390 pixel layouts
  pass  /submissions does not scroll sideways at 390 pixels
        docs/screenshots/58-submissions-390.png
  pass  /ledger does not scroll sideways at 390 pixels
        docs/screenshots/59-ledger-390.png
  pass  /audit does not scroll sideways at 390 pixels
        docs/screenshots/60-audit-390.png
  pass  a second tenant's intake link carries that tenant's branding
        docs/screenshots/61-intake-second-tenant-390.png

all checks passed
```

# Borrowers verification run

```
1. borrowers list, populated
  pass  the list shows this tenant's 15 borrowers, saw 15
        docs/screenshots/10-borrowers-list-desktop.png
  pass  the 390 pixel list shows the same seed state, 15 entries
  pass  the list does not scroll sideways at 390 pixels
        docs/screenshots/19-borrowers-list-390.png

2. search and filter
  pass  searching for one borrower returns 1 row, saw 1
  pass  a search term made of filter punctuation is treated as text, 0 rows and no error
        docs/screenshots/11-borrowers-search-empty-result.png

3. borrower detail
  pass  the documents panel lists 2 objects from the tenant's storage folder
  pass  the activity panel renders 2 rows from the audit table
        docs/screenshots/12-borrower-detail-desktop.png
  pass  the signed document link resolves, HTTP 200
  pass  the link is a signed URL rather than a public object path

4. CSV import, preview and per row errors
        ready 6, already held 1, repeated 1, rows with errors 4
  pass  6 rows are importable, saw 6
  pass  1 row is already held by this organisation, saw 1
  pass  1 row is repeated inside the file, saw 1
  pass  4 lines carry errors, saw 4
        docs/screenshots/13-csv-import-preview-desktop.png
  pass  the error list is shown with the line numbers from the file

5. CSV import, commit and summary
  pass  the summary reports 6 inserted, saw 6
        docs/screenshots/14-csv-import-summary-desktop.png
  pass  the tenant now holds 21 borrowers, saw 21

6. loading state
  pass  the skeleton from loading.tsx is on screen, 5 placeholders
        docs/screenshots/15-borrowers-loading-desktop.png
7. cross tenant: a different organisation sees none of this
  pass  the second organisation sees its own 14 borrowers, saw 14
  pass  none of the first tenant's borrowers appear, 0 leaked
        docs/screenshots/16-cross-tenant-other-org-list-desktop.png
  pass  the first tenant's borrower URL renders no profile for the second tenant (404 markers: 0)
        docs/screenshots/17-cross-tenant-direct-url-desktop.png
  pass  duplicate detection is tenant scoped: the second organisation holds none of them, saw 0
        docs/screenshots/18-cross-tenant-import-no-duplicates-desktop.png

8. 390 pixel layouts
        docs/screenshots/20-borrower-detail-390.png
  pass  the import preview does not scroll sideways at 390 pixels
        docs/screenshots/21-csv-import-preview-390.png

8b. pagination, once a tenant holds more than one page
  pass  the pager appears past 25 rows, page label reads "1 of 3"
        docs/screenshots/24-borrowers-pagination-desktop.png

9. the empty state, on a tenant with nothing in it
  pass  an organisation with no borrowers gets the empty state, not a blank table
        docs/screenshots/22-borrowers-empty-desktop.png
        docs/screenshots/23-borrowers-empty-390.png

all checks passed

Data note: this run imports 6 borrowers into the first organisation and
empties the third. Re-running npm run test:schema reapplies the schema and
restores the seed, which is how the isolation counts go back to 15, 14, 11.
```

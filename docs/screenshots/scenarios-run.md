# Scenarios, uploads and premium verification run

```
1. scenario builder
  pass  the builder works out the loan as you type: $492,000
        docs/screenshots/30-scenario-builder-desktop.png

2. results
  pass  the panel returned 3 lenders that can take the file
  pass  the cheapest quote is marked
  pass  each quote says why it matched, 12 reasons in total
  pass  the lenders that could not take it are listed with what would change that
  pass  the screen states the source: Quotes are stored as ranges against an alias and cannot be edited after the fact
        docs/screenshots/31-scenario-results-desktop.png
  pass  running the same scenario twice produces the same quotes

3. document upload, accepted and refused
  pass  the document was added, 2 then 3
  pass  the upload wrote an audit row with an acting seat: documents.insert, seat present
        docs/screenshots/32-document-upload-accepted-desktop.png
  pass  a text file is refused: text/plain is not accepted. Use a PDF, a PNG or a JPEG.
        docs/screenshots/33-document-upload-refused-desktop.png

4. premium panel, on a tenant that has the tier
  pass  the premium panel renders for a premium tenant, 6 valuations
        docs/screenshots/34-premium-panel-allowed-desktop.png

5. premium panel, on a tenant that does not
  pass  a non premium tenant is denied
  pass  no premium data is present in the page sent to a non premium tenant
        docs/screenshots/35-premium-panel-denied-desktop.png

6. cross tenant on the scenario surface
  pass  another tenant's scenario URL renders no scenario
        docs/screenshots/36-cross-tenant-scenario-url-desktop.png

7. 390 pixel layouts
        docs/screenshots/37-scenario-builder-390.png
  pass  the results screen does not scroll sideways at 390 pixels
        docs/screenshots/38-scenario-results-390.png
        docs/screenshots/39-premium-panel-allowed-390.png
        docs/screenshots/40-premium-panel-denied-390.png

all checks passed
```

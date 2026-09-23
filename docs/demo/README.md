# Walkthrough

`walkthrough.webm` and `walkthrough.mp4` are one continuous browser session,
recorded by `npm run record`. No cuts, no edits, nothing sped up.

What it shows, in order: signing in as a loan officer at the first tenant, the
borrowers list, one borrower opened, a document uploaded to that tenant's own
folder in private storage, a financing scenario run and its ranked results,
then signing in as a manager at a second tenant to show that the first
tenant's borrower URL renders nothing and that the premium panel is refused
server side.

Recorded on 23 September 2026 against the deployed URL itself,
https://fieldstone-portal.vercel.app, not against a local server. It runs 40
seconds.

```bash
VERIFY_BASE_URL=https://fieldstone-portal.vercel.app npm run record
```

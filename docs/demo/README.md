# Walkthrough

`walkthrough.webm` and `walkthrough.mp4` are one continuous browser session,
recorded by `npm run record`. No cuts, no edits, nothing sped up.

What it shows, in order: signing in as a loan officer at the first tenant, the
borrowers list, one borrower opened, a document uploaded to that tenant's own
folder in private storage, a financing scenario run and its ranked results,
then signing in as a manager at a second tenant to show that the first
tenant's borrower URL renders nothing and that the premium panel is refused
server side.

Recorded against the production build of this application. At the time of
recording the deployed URL sits behind Vercel Deployment Protection, so the
session was driven against `next build` plus `next start`, which is the same
artefact that is deployed. Re-recording against the deployed URL is one
command once that protection is lifted:

```bash
VERIFY_BASE_URL=https://lo-portal-mudassar-sys-projects.vercel.app npm run record
```

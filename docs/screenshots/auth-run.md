# Auth and seat verification run

Produced by `npm run verify:auth`, which drives Chrome through
playwright-core against the running portal. The index of every screenshot
is in README.md beside this file.

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

## Run transcript

```
1. sign in, and branding on first paint
  pass  the overview names the seat's own tenant: Harborline Mortgage Group
        tenant accent on first paint: rgb(79, 124, 255)
        docs/screenshots/01-sign-in-overview-harborline.png
  pass  the tiles show this tenant's own totals: 15, 10, 6, 8

2. the seat is held by this device
  pass  exactly one seat row reads 'this device'
        seat active_session_id 70535dfc-6d41-4188-852b-e60237dfc8ba
        docs/screenshots/02-sessions-seat-held-by-this-device.png

3. a second device takes the seat over
  pass  the seat moved to the second device's session
        seat active_session_id 38b99182-88cb-47f8-95bd-b37814f9b807
        docs/screenshots/03-second-device-took-the-seat.png
  pass  the first device no longer reads 'this device'
  pass  the first device now sees the seat as 'in use elsewhere'
        docs/screenshots/04-first-device-sees-the-seat-taken.png

4. sign out other devices
  pass  the action reports back on screen
  pass  the seat returned to the device that pressed the button
        seat active_session_id 70535dfc-6d41-4188-852b-e60237dfc8ba
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

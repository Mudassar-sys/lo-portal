# Decisions

Choices made while building, each with the reason in one line. Recorded here
so the next person does not have to guess why something is the way it is.

| Date | Decision | Reason |
| --- | --- | --- |
| 22 Sep 2026 | TypeScript pinned 5.9.3, not the newest 7.0.2. | typescript-eslint supports `>=4.8.4 <6.1.0`, so linting is impossible on 7.x, and lint clean is a build rule. |
| 22 Sep 2026 | The portal role travels in an `org_role` claim, not `role`. | `role` is what selects the Postgres role for the request, so overwriting it would break every request. |
| 22 Sep 2026 | Two policies on `seats` are granted to `supabase_auth_admin`, not `authenticated`. | The access token hook runs as that role and must read and update the seat; this matches the platform's own RBAC example. |
| 22 Sep 2026 | The schema revokes all privileges before granting. | The platform grants the API roles everything on the public schema by default, so a grant-only schema restricts nothing. Found by running the tests against the real project. |
| 22 Sep 2026 | Shared constants live in `lib/`, never beside a `"use server"` module. | Such a module may export only async functions; a constant can compile and then fail in the browser at run time. |
| 22 Sep 2026 | Documents upload from the browser straight to storage, not through a server action. | A server action body is capped at 1 MB and the host caps a request at 4.5 MB, so a 10 MB document cannot travel that way. Storage policies and bucket limits do the enforcing, and the recording action re-reads size and type from storage. |
| 22 Sep 2026 | The matching service and the property panel are local stubs behind interfaces. | The client's real API arrives under NDA. The prototype shows the integration shape without touching, naming or contacting any external system. |
| 22 Sep 2026 | Only one non premium organisation in the seed. | One is enough to prove the server side denial; a second would add seed noise without adding evidence. |
| 22 Sep 2026 | `gitleaks` from npm was not installed for the secret sweep. | The package of that name is not the official tool. Installing an unvetted package to hunt for secrets is a worse risk than the one it looks for, so git's own history output is used. |
| 22 Sep 2026 | Vercel Deployment Protection was left enabled. | Turning it off makes the deployment publicly reachable, which is the owner's call on the owner's account. Everything else was completed against a local production build and the CLI's documented automation bypass. |
| 22 Sep 2026 | Alias `fieldstone-portal.vercel.app`, the first of the three candidates. | All three were free; the first was taken and the other two released so there is one canonical URL. |
| 22 Sep 2026 | Performance numbers are taken from `next build` plus `next start`, not the dev server. | The first reading of the list at 5,000 rows was 1.49s on the dev server and 0.68s on a production build. A performance target measured on a dev server is not a measurement. |
| 22 Sep 2026 | `loading.tsx` is verified with a throttled document load. | Holding or throttling a client navigation never shows it: the router waits for the response before committing, so the browser stays on the previous page. Three earlier versions of that check reported a pass and a fail for the same working code. |
| 22 Sep 2026 | The walkthrough is recorded after the verification suites, never before. | It signs in and runs a scenario, so it changes the data the suites assert on. Recording first made the auth suite read 11 scenarios where the seed has 10. |
| 22 Sep 2026 | The auth suite writes `auth-run.md`, not `screenshots/README.md`. | It was overwriting the curated index of every screenshot with its own transcript. |
| 22 Sep 2026 | The nav carries `min-w-0`. | A flex item defaults to `min-width: auto` and refuses to shrink below its content, so `overflow-x-auto` never engaged and the whole document scrolled sideways at 390 pixels once the nav reached nine items. |
| 22 Sep 2026 | The brand swatch carries a `data-brand-swatch` attribute. | The branding check located it structurally, and the header changed shape, so the check silently started reading a transparent element instead of the accent. A named hook cannot drift like that. |
| 22 Sep 2026 | The intake page reads its branding through one security definer function. | The visitor has no session and no table privileges at all. The function returns three branding fields for a live token and nothing else, so a guessed link cannot enumerate tenants. |
| 22 Sep 2026 | `npm run final` starts and stops its own production server. | It rebuilds `.next` as one of its steps, which pulled the ground out from under a server that was already serving from it and failed nine browser steps for a reason unrelated to the application. |
| 22 Sep 2026 | Quotes in the requirements trace replace the client's name with `[the client]`. | The repository carries no client name, and that rule is not waived for a document about the client. |


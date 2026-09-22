// End to end verification of the auth and seat model, in a real browser,
// against the real project.
//
// It drives Chrome through playwright-core and uses two isolated browser
// contexts, which is what makes the seat test meaningful: separate cookie
// jars, separate storage, two genuinely different devices.
//
// The password is read from DEMO_PASSWORD in .env.local and is typed into the
// page by the browser. It is never printed, and it never appears in a
// screenshot, because the field is a password input.
//
// Screenshots land in docs/screenshots and are listed, with what each one
// proves and which backend produced it, in docs/screenshots/README.md.
//
// Usage: npm run verify:auth       (the dev server must be running)

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD;
const SEAT_A = "harborline.lo@fieldstone.example";
const SEAT_OTHER_TENANT = "bayoucity.manager@fieldstone.example";
const SHOTS = "docs/screenshots";

if (!PASSWORD) {
  console.error("DEMO_PASSWORD is not set in .env.local");
  process.exit(1);
}

mkdirSync(SHOTS, { recursive: true });

const notes = [];
const record = (line) => {
  console.log(line);
  notes.push(line);
};

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const seatState = async (email) => {
  const { data, error } = await admin
    .from("seats")
    .select("label, role, active_session_id")
    .eq("login_email", email)
    .single();
  if (error) throw error;
  return data;
};

const signIn = async (page, email) => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
};

// The dev server paints its own indicator over the corner of the page. It is
// tooling, not the product, so it is hidden for the capture only. Nothing else
// about the page is touched.
const HIDE_DEV_BADGE = "nextjs-portal, [data-next-badge-root] { display: none !important; }";

const shot = async (page, name) => {
  await page.addStyleTag({ content: HIDE_DEV_BADGE }).catch(() => {});
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  return `${SHOTS}/${name}.png`;
};

const browser = await chromium.launch({ channel: "chrome" });

// Two isolated contexts. This is the second profile: nothing is shared.
const deviceA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const deviceB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pageA = await deviceA.newPage();
const pageB = await deviceB.newPage();

let failures = 0;
const check = (ok, statement) => {
  record(`  ${ok ? "pass" : "FAIL"}  ${statement}`);
  if (!ok) failures += 1;
};

try {
  record("1. sign in, and branding on first paint");
  await signIn(pageA, SEAT_A);
  const heading = await pageA.locator("h1").first().innerText();
  check(heading.includes("Harborline"), `the overview names the seat's own tenant: ${heading}`);
  const accentA = await pageA.evaluate(() =>
    getComputedStyle(document.querySelector("[data-brand-swatch]")).backgroundColor
  );
  record(`        tenant accent on first paint: ${accentA}`);
  record(`        ${await shot(pageA, "01-sign-in-overview-harborline")}`);

  const counts = await pageA.locator("p.font-mono").allInnerTexts();
  check(
    counts.slice(0, 4).join(",") === "15,10,6,8",
    `the tiles show this tenant's own totals: ${counts.slice(0, 4).join(", ")}`
  );

  record("");
  record("2. the seat is held by this device");
  await pageA.goto(`${BASE}/sessions`, { waitUntil: "networkidle" });
  const thisDevice = await pageA.locator("text=this device").count();
  check(thisDevice === 1, "exactly one seat row reads 'this device'");
  const seatBefore = await seatState(SEAT_A);
  record(`        seat active_session_id ${seatBefore.active_session_id}`);
  record(`        ${await shot(pageA, "02-sessions-seat-held-by-this-device")}`);

  record("");
  record("3. a second device takes the seat over");
  await signIn(pageB, SEAT_A);
  const seatAfter = await seatState(SEAT_A);
  check(
    seatAfter.active_session_id !== seatBefore.active_session_id,
    "the seat moved to the second device's session"
  );
  record(`        seat active_session_id ${seatAfter.active_session_id}`);
  record(`        ${await shot(pageB, "03-second-device-took-the-seat")}`);

  await pageA.reload({ waitUntil: "networkidle" });
  const stillThisDevice = await pageA.locator("text=this device").count();
  const elsewhere = await pageA.locator("text=in use elsewhere").count();
  check(stillThisDevice === 0, "the first device no longer reads 'this device'");
  check(elsewhere === 1, "the first device now sees the seat as 'in use elsewhere'");
  record(`        ${await shot(pageA, "04-first-device-sees-the-seat-taken")}`);

  record("");
  record("4. sign out other devices");
  await pageA.click('button:has-text("Sign out other devices")');
  await pageA.waitForSelector('[role="status"]', { timeout: 20000 });
  const message = await pageA.locator('[role="status"]').innerText();
  check(message.length > 0, "the action reports back on screen");
  const seatFinal = await seatState(SEAT_A);
  check(
    seatFinal.active_session_id !== seatAfter.active_session_id,
    "the seat returned to the device that pressed the button"
  );
  record(`        seat active_session_id ${seatFinal.active_session_id}`);
  record(`        ${await shot(pageA, "05-sign-out-other-devices")}`);

  record("");
  record("5. the other device is genuinely revoked");
  // The proof has to be the refresh token, not the page. An access token that
  // has already been issued stays valid until it expires, which is the ten
  // minute worst case the screen itself states, so device B keeps rendering
  // until then. What must be dead is its ability to get a new token.
  // @supabase/ssr keeps the session in cookies, not in localStorage, and it
  // chunks the value across .0, .1 and so on when it is long. Reassembling it
  // is the only way to get at the refresh token from outside the page, and
  // without it this step would be an assertion rather than a proof.
  const cookies = await deviceB.cookies();
  const authCookies = cookies
    .filter((c) => /auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  check(authCookies.length > 0, "device B still holds its session cookie");

  let refreshToken = null;
  if (authCookies.length) {
    let raw = authCookies.map((c) => c.value).join("");
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8");
    } else {
      raw = decodeURIComponent(raw);
    }
    try {
      refreshToken = JSON.parse(raw).refresh_token ?? null;
    } catch {
      refreshToken = null;
    }
  }

  check(Boolean(refreshToken), "device B's refresh token was recovered from its cookie jar");

  if (refreshToken) {
    const bClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await bClient.auth.refreshSession({ refresh_token: refreshToken });
    check(
      Boolean(error) || !data?.session,
      `device B can no longer obtain a token: ${error?.message ?? "it still could"}`
    );
  }

  record("");
  record("6. white labelling, a second tenant on the same deployment");
  const deviceC = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageC = await deviceC.newPage();
  await signIn(pageC, SEAT_OTHER_TENANT);
  const headingC = await pageC.locator("h1").first().innerText();
  const accentC = await pageC.evaluate(() =>
    getComputedStyle(document.querySelector("[data-brand-swatch]")).backgroundColor
  );
  check(headingC.includes("Bayou City"), `a different tenant, branded differently: ${headingC}`);
  check(accentC !== accentA, `and a different accent on first paint: ${accentC}`);
  record(`        ${await shot(pageC, "06-second-tenant-branding")}`);

  record("");
  record("7. signed out means signed out");
  await pageC.click('button:has-text("Sign out")');
  await pageC.waitForURL(/\/login/, { timeout: 20000 });
  await pageC.goto(`${BASE}/sessions`, { waitUntil: "networkidle" });
  check(
    pageC.url().includes("/login"),
    "a signed out browser asking for a portal route lands on sign in"
  );
  record(`        ${await shot(pageC, "07-signed-out-redirected-to-login")}`);
  await deviceC.close();
} finally {
  await browser.close();
}

record("");
record(`${failures === 0 ? "all checks passed" : `${failures} checks FAILED`}`);

writeFileSync(
  `${SHOTS}/auth-run.md`,
  [
    "# Auth and seat verification run",
    "",
    "Produced by `npm run verify:auth`, which drives Chrome through",
    "playwright-core against the running portal. The index of every screenshot",
    "is in README.md beside this file.",
    "",
    "Backend for every one of them: the real project, its own PostgreSQL 17.6,",
    "provisioned by `scripts/provision.mjs` and seeded by `supabase/schema.sql`.",
    "Not the local PGlite engine, and not mock data. The counts visible on the",
    "overview are the seeded counts for that tenant.",
    "",
    "| file | what it proves |",
    "| --- | --- |",
    "| 01-sign-in-overview-harborline.png | Sign in works end to end, and the tenant's own name, accent and totals are on screen at first paint. |",
    "| 02-sessions-seat-held-by-this-device.png | The seat roster, the active session id per seat, and this device holding one of them. |",
    "| 03-second-device-took-the-seat.png | A second, isolated browser context signed in to the same seat. |",
    "| 04-first-device-sees-the-seat-taken.png | The first device now reads the seat as in use elsewhere. |",
    "| 05-sign-out-other-devices.png | Sign out other devices, with the ten minute caveat stated on screen rather than hidden. |",
    "| 06-second-tenant-branding.png | A different lender organisation on the same deployment, with its own name and accent. |",
    "| 07-signed-out-redirected-to-login.png | A signed out browser asking for a portal route gets the sign in page. |",
    "",
    "## Run transcript",
    "",
    "```",
    ...notes,
    "```",
    "",
  ].join("\n"),
  "utf8"
);

process.exit(failures ? 1 : 0);

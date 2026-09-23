// The not found surfaces, on the deployed alias, in a real Chrome window.
//
//   npm run verify:live:notfound
//
// Four URLs that must all end in the same designed dead end rather than the
// framework's default page:
//
//   a borrower id that belongs to another lender
//   a scenario id that belongs to another lender
//   an intake token that does not exist
//   a route that does not exist at all
//
// It records the HTTP status of the document response, because a designed
// page that quietly answers 200 would be a regression a screenshot cannot
// show. It also asserts the page is the dark shell and that nothing on it
// says whether the record exists somewhere else.
//
// The screenshots overwrite the ones the full live run produces, by name, so
// docs/screenshots/live stays one consistent set.

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");

const ALIAS = process.env.LIVE_URL ?? "https://fieldstone-portal.vercel.app";
const PASSWORD = process.env.DEMO_PASSWORD;
// The screenshot directory is overridable so the same script can be pointed
// at a local build for a diagnostic without overwriting the live set.
const SHOTS = process.env.NOTFOUND_SHOTS ?? "docs/screenshots/live";
const SEAT_OTHER_TENANT = "bayoucity.manager@fieldstone.example";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const lines = [];
let failures = 0;
const say = (line = "") => {
  console.log(line);
  lines.push(line);
};
const check = (ok, statement) => {
  say(`    ${ok ? "pass" : "FAIL"}  ${statement}`);
  if (!ok) failures += 1;
};

const signIn = async (page, email) => {
  await page.goto(`${ALIAS}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
};

mkdirSync(SHOTS, { recursive: true });

const harborline = (await admin.from("organizations").select("id").eq("slug", "harborline-mortgage").single()).data.id;
const borrower = (await admin.from("borrowers").select("id").eq("org_id", harborline).limit(1).single()).data;
const scenario = (await admin.from("scenarios").select("id").eq("org_id", harborline).limit(1).single()).data;

const browser = await chromium.launch({ channel: "chrome", headless: false });

say("# Not found surfaces, on the deployed alias");
say("");
say(`target        ${ALIAS}`);
say(`started       ${new Date().toISOString()}`);
say('browser       Chrome, channel "chrome", headless false');
say("");

/**
 * One URL, one context, one tab.
 *
 * `signedIn` decides whether a seat is taken first: the two portal URLs are
 * opened by a seat at a different lender, which is the case that matters, and
 * the intake token is opened by someone with no session at all.
 */
const deadEnd = async ({ label, path, slug, signedIn, expectBackTo }) => {
  say(`${label}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    if (signedIn) await signIn(page, SEAT_OTHER_TENANT);

    const response = await page.goto(`${ALIAS}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    const status = response?.status();
    say(`    note  HTTP ${status} for ${path}`);
    check(status === 404, `the document response is 404, saw ${status}`);

    // The shell. A white page inside a dark portal is the defect this fixes,
    // so the background is read off the rendered document rather than trusted.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // The colour is parsed by the browser rather than by a regular expression.
    // The theme resolves to lab(), which a naive digit match reads as the
    // number 4 followed by 76673, and that reported a dark page as light.
    const isDark = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return r * 0.299 + g * 0.587 + b * 0.114 < 90;
    });
    check(isDark, `the page keeps the dark shell, body background ${background}`);

    const body = await page.locator("body").innerText();
    check(
      /Nothing here/i.test(body),
      `the heading is the designed one: ${body.split("\n").find((l) => /Nothing here/i.test(l)) ?? "not present"}`,
    );
    check(
      !/404|This page could not be found/i.test(body),
      "the framework's default 404 text is not on the page",
    );

    // Nothing may hint that the record is real somewhere else.
    check(
      !/another (organisation|lender|tenant)('s)? record|exists (elsewhere|for another)|belongs to (another|a different) (organisation|lender|tenant)/i.test(body),
      "nothing on the page says whether the record exists for anyone else",
    );

    if (expectBackTo) {
      const back = page.locator(`a[href="${expectBackTo}"]`).first();
      check(await back.isVisible(), `there is a way back, a link to ${expectBackTo}`);
    }

    await page.screenshot({ path: `${SHOTS}/${slug}.png`, fullPage: true });
    say(`    shot  ${SHOTS}/${slug}.png`);
  } catch (error) {
    failures += 1;
    say(`    FAIL  the step threw: ${String(error).split("\n")[0]}`);
  } finally {
    await context.close();
  }
  say("");
};

try {
  await deadEnd({
    label: "ROW 4  a borrower id that belongs to another lender",
    path: `/borrowers/${borrower.id}`,
    slug: "22-cross-tenant-borrower-url",
    signedIn: true,
    expectBackTo: "/borrowers",
  });

  await deadEnd({
    label: "ROW 4  a scenario id that belongs to another lender",
    path: `/scenarios/${scenario.id}`,
    slug: "23-cross-tenant-scenario-url",
    signedIn: true,
    expectBackTo: "/scenarios",
  });

  await deadEnd({
    label: "ROW 7  an intake token that does not exist, with no session at all",
    path: "/intake/not-a-real-token",
    slug: "27-intake-unknown-token",
    signedIn: false,
  });

  await deadEnd({
    label: "ROW 17  a route that does not exist at all",
    path: "/no-such-page",
    slug: "46-unknown-route",
    signedIn: true,
    expectBackTo: "/",
  });
} finally {
  await browser.close();
}

say(failures === 0 ? "RESULT: all checks passed" : `RESULT: ${failures} checks FAILED`);

writeFileSync("docs/evidence/not-found-run.txt", lines.join("\n") + "\n", "utf8");

process.exit(failures ? 1 : 0);

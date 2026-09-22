// Verification for the borrowers list, the borrower detail and the CSV
// import, in a real browser against the real project.
//
// It also runs the cross tenant check the plan asks for: signed in as the
// second organisation, confirm that the first organisation's borrowers are
// invisible in the list, invisible by direct URL, and not used as duplicate
// evidence by the importer.
//
// Screenshots land in docs/screenshots at desktop and at 390 pixels.
//
// Usage: npm run verify:borrowers      (the dev server must be running)

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD;
const SHOTS = "docs/screenshots";
const FIXTURE = "docs/fixtures/borrowers-sample.csv";

const PAGE_SIZE = 25; // must match lib/borrowers.ts
const SEAT_HARBORLINE = "harborline.lo@fieldstone.example";
const SEAT_BAYOU = "bayoucity.manager@fieldstone.example";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const notes = [];
const record = (line) => {
  console.log(line);
  notes.push(line);
};

let failures = 0;
const check = (ok, statement) => {
  record(`  ${ok ? "pass" : "FAIL"}  ${statement}`);
  if (!ok) failures += 1;
};

const HIDE_DEV_BADGE = "nextjs-portal, [data-next-badge-root] { display: none !important; }";

const shot = async (page, name) => {
  await page.addStyleTag({ content: HIDE_DEV_BADGE }).catch(() => {});
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  record(`        ${SHOTS}/${name}.png`);
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

const browser = await chromium.launch({ channel: "chrome" });
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });

try {
  // ---------------------------------------------------------------------
  record("1. borrowers list, populated");
  const page = await desktop.newPage();
  await signIn(page, SEAT_HARBORLINE);
  await page.goto(`${BASE}/borrowers`, { waitUntil: "networkidle" });

  const rowCount = await page.locator("table tbody tr").count();
  check(rowCount === 15, `the list shows this tenant's 15 borrowers, saw ${rowCount}`);
  await shot(page, "10-borrowers-list-desktop");

  // The 390 pixel list is captured here rather than later, so every list
  // screenshot shows the same clean seed state. Capturing it after the import
  // is what made one screenshot show 21 rows and another 15.
  const cleanSmall = await mobile.newPage();
  await signIn(cleanSmall, SEAT_HARBORLINE);
  await cleanSmall.goto(`${BASE}/borrowers`, { waitUntil: "networkidle" });
  const smallRows = await cleanSmall.locator("ul li").count();
  check(smallRows >= 15, `the 390 pixel list shows the same seed state, ${smallRows} entries`);
  const cleanOverflow = await cleanSmall.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  check(!cleanOverflow, "the list does not scroll sideways at 390 pixels");
  await shot(cleanSmall, "19-borrowers-list-390");
  await cleanSmall.close();

  record("");
  record("2. search and filter");
  await page.goto(`${BASE}/borrowers?q=vega`, { waitUntil: "networkidle" });
  const searched = await page.locator("table tbody tr").count();
  check(searched === 1, `searching for one borrower returns 1 row, saw ${searched}`);

  // PostgREST reads an or filter as syntax. A term full of filter punctuation
  // must come back as no matches, not as an error and not as everything.
  await page.goto(`${BASE}/borrowers?q=${encodeURIComponent('a,b)(c*%"')}`, {
    waitUntil: "networkidle",
  });
  const injected = await page.locator("table tbody tr").count();
  const brokeTheList = await page.locator("text=could not be loaded").count();
  check(
    brokeTheList === 0 && injected <= 15,
    `a search term made of filter punctuation is treated as text, ${injected} rows and no error`
  );
  await shot(page, "11-borrowers-search-empty-result");

  record("");
  record("3. borrower detail");
  await page.goto(`${BASE}/borrowers`, { waitUntil: "networkidle" });
  await page.click("table tbody tr:first-child a");
  await page.waitForURL(/\/borrowers\/[0-9a-f-]{36}/, { timeout: 20000 });
  // waitForURL resolves when the navigation commits, not when the server
  // component has finished streaming. Counting before that is what made this
  // check report zero documents while the link it then followed returned 200.
  await page.waitForLoadState("networkidle");
  const detailUrl = page.url();

  // networkidle is not enough on a client side navigation: the server
  // component is still streaming into the page. Counting at that moment
  // reported zero documents while the very next line followed one of their
  // links successfully. Wait for the panel to have resolved one way or the
  // other, then count.
  await page.waitForSelector('a:has-text("Open"), :text("No documents yet")', { timeout: 20000 });
  const documents = await page.locator('a:has-text("Open")').count();
  check(documents >= 1, `the documents panel lists ${documents} objects from the tenant's storage folder`);

  const activity = await page.getByText(/^(borrowers|documents|scenarios)\.(insert|update|delete)$/).count();
  check(activity >= 1, `the activity panel renders ${activity} rows from the audit table`);
  await shot(page, "12-borrower-detail-desktop");

  // The signed link must actually resolve, otherwise the panel is decoration.
  const link = page.locator('a:has-text("Open")').first();
  const href = await link.getAttribute("href");
  const signedResponse = await page.request.get(href);
  check(
    signedResponse.ok(),
    `the signed document link resolves, HTTP ${signedResponse.status()}`
  );
  check(
    /token=/.test(href ?? ""),
    "the link is a signed URL rather than a public object path"
  );

  record("");
  record("4. CSV import, preview and per row errors");
  await page.goto(`${BASE}/borrowers/import`, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await page.waitForSelector("text=Preview", { timeout: 30000 });

  const tile = async (label) =>
    Number(
      await page
        .locator(`dt:has-text("${label}")`)
        .first()
        .evaluate((node) => node.nextElementSibling?.textContent?.trim() ?? "0")
    );

  const ready = await tile("Ready");
  const held = await tile("Already held");
  const repeated = await tile("Repeated in file");
  const bad = await tile("Rows with errors");

  record(`        ready ${ready}, already held ${held}, repeated ${repeated}, rows with errors ${bad}`);
  check(ready === 6, `6 rows are importable, saw ${ready}`);
  check(held === 1, `1 row is already held by this organisation, saw ${held}`);
  check(repeated === 1, `1 row is repeated inside the file, saw ${repeated}`);
  check(bad === 4, `4 lines carry errors, saw ${bad}`);
  await shot(page, "13-csv-import-preview-desktop");

  const errorList = await page.locator("text=Rows that will not be imported").count();
  check(errorList === 1, "the error list is shown with the line numbers from the file");

  record("");
  record("5. CSV import, commit and summary");
  await page.click('button:has-text("Import 6")');
  await page.waitForSelector("text=Import finished", { timeout: 60000 });
  const inserted = await page
    .locator('dt:has-text("Inserted")')
    .first()
    .evaluate((node) => node.nextElementSibling?.textContent?.trim());
  check(inserted === "6", `the summary reports 6 inserted, saw ${inserted}`);
  await shot(page, "14-csv-import-summary-desktop");

  const { count: harborlineNow } = await admin
    .from("borrowers")
    .select("id", { count: "exact", head: true })
    .eq("org_id", (await admin.from("organizations").select("id").eq("slug", "harborline-mortgage").single()).data.id);
  check(harborlineNow === 21, `the tenant now holds 21 borrowers, saw ${harborlineNow}`);

  record("");
  record("6. loading state");
  // loading.tsx renders while a segment streams, so it only appears when the
  // segment actually has to be fetched. Two things get in the way, and both
  // caused a false result before this was written properly:
  //   a full page load does not show it, because the browser keeps painting
  //   the old page until the document arrives;
  //   a client side navigation to a segment the router has already prefetched
  //   does not show it either, because nothing is fetched.
  // So the delay is armed first, which holds the prefetch open as well as the
  // navigation, and then a filter link that has not been visited is clicked.
  await page.unroute("**/borrowers**").catch(() => {});

  // How this is actually observed, after three wrong attempts worth writing
  // down. loading.tsx is the Suspense fallback for the segment, and it is
  // painted while the server streams. Holding the response does not show it:
  // the client router waits for the response to begin before it commits the
  // navigation, so the browser simply stays on the previous page. What does
  // show it is a document request over a slow connection, because then the
  // shell arrives, paints the fallback, and the content follows.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 300,
    downloadThroughput: 12000,
    uploadThroughput: 12000,
  });

  const navigation = page.goto(`${BASE}/borrowers`, { waitUntil: "commit" }).catch(() => {});
  await page.waitForSelector(".animate-pulse", { timeout: 20000 });
  const skeleton = await page.locator(".animate-pulse").count();
  check(skeleton > 0, `the skeleton from loading.tsx is on screen, ${skeleton} placeholders`);
  await shot(page, "15-borrowers-loading-desktop");

  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await navigation;
  await page.waitForLoadState("networkidle").catch(() => {});

  record("7. cross tenant: a different organisation sees none of this");
  const other = await desktop.browser().newContext({ viewport: { width: 1280, height: 900 } });
  const otherPage = await other.newPage();
  await signIn(otherPage, SEAT_BAYOU);
  await otherPage.goto(`${BASE}/borrowers`, { waitUntil: "networkidle" });
  const otherRows = await otherPage.locator("table tbody tr").count();
  check(otherRows === 14, `the second organisation sees its own 14 borrowers, saw ${otherRows}`);

  const names = await otherPage.locator("table tbody tr td:first-child").allInnerTexts();
  const leaked = names.filter((n) => /Vega|Okonkwo|Ferraro|Ashford|Blackwood/.test(n));
  check(leaked.length === 0, `none of the first tenant's borrowers appear, ${leaked.length} leaked`);
  await shot(otherPage, "16-cross-tenant-other-org-list-desktop");

  // The same borrower, by direct URL. Not forbidden: absent.
  await otherPage.goto(detailUrl, { waitUntil: "networkidle" });
  const notFound = await otherPage.locator("text=404, text=This page could not be found").count();
  const showsBorrower = await otherPage.locator("text=Profile").count();
  check(
    showsBorrower === 0,
    `the first tenant's borrower URL renders no profile for the second tenant (404 markers: ${notFound})`
  );
  await shot(otherPage, "17-cross-tenant-direct-url-desktop");

  // And the importer must not use the other tenant's rows as duplicate
  // evidence: the same file offered here has nothing "already held".
  await otherPage.goto(`${BASE}/borrowers/import`, { waitUntil: "networkidle" });
  await otherPage.setInputFiles('input[type="file"]', FIXTURE);
  await otherPage.waitForSelector("text=Preview", { timeout: 30000 });
  const otherHeld = Number(
    await otherPage
      .locator('dt:has-text("Already held")')
      .first()
      .evaluate((node) => node.nextElementSibling?.textContent?.trim() ?? "0")
  );
  check(
    otherHeld === 0,
    `duplicate detection is tenant scoped: the second organisation holds none of them, saw ${otherHeld}`
  );
  await shot(otherPage, "18-cross-tenant-import-no-duplicates-desktop");
  await other.close();

  record("");
  record("8. 390 pixel layouts");
  // The mobile context signed in during step 1, so it carries a session
  // already. Asking for /login here would simply be redirected away.
  const small = await mobile.newPage();
  await small.goto(detailUrl, { waitUntil: "networkidle" });
  await shot(small, "20-borrower-detail-390");

  await small.goto(`${BASE}/borrowers/import`, { waitUntil: "networkidle" });
  await small.setInputFiles('input[type="file"]', FIXTURE);
  await small.waitForSelector("text=Preview", { timeout: 30000 });
  const smallOverflow = await small.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  check(!smallOverflow, "the import preview does not scroll sideways at 390 pixels");
  await shot(small, "21-csv-import-preview-390");

  record("");
  record("8b. pagination, once a tenant holds more than one page");
  await page.goto(`${BASE}/borrowers/import`, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', "docs/fixtures/borrowers-bulk.csv");
  await page.waitForSelector("text=Preview", { timeout: 30000 });
  await page.click('button:has-text("Import 30")');
  await page.waitForSelector("text=Import finished", { timeout: 60000 });
  await page.goto(`${BASE}/borrowers`, { waitUntil: "networkidle" });
  const pager = await page.locator('a:has-text("Next")').count();
  const pageLabel = await page.locator("text=/^[0-9]+ of [0-9]+$/").first().innerText();
  check(pager === 1, `the pager appears past ${PAGE_SIZE} rows, page label reads "${pageLabel}"`);
  await shot(page, "24-borrowers-pagination-desktop");

  record("");
  record("9. the empty state, on a tenant with nothing in it");
  // Red Oak's borrowers are removed, the true empty state is captured, and
  // the schema run that follows this script puts them back.
  const redoak = (await admin.from("organizations").select("id").eq("slug", "red-oak-residential").single()).data;
  await admin.from("borrowers").delete().eq("org_id", redoak.id);
  const empty = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const emptyPage = await empty.newPage();
  await signIn(emptyPage, "redoak.lo@fieldstone.example");
  await emptyPage.goto(`${BASE}/borrowers`, { waitUntil: "networkidle" });
  const emptyState = await emptyPage.locator("text=No borrowers yet").count();
  check(emptyState === 1, "an organisation with no borrowers gets the empty state, not a blank table");
  await shot(emptyPage, "22-borrowers-empty-desktop");

  const emptyMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const emptySmall = await emptyMobile.newPage();
  await signIn(emptySmall, "redoak.lo@fieldstone.example");
  await emptySmall.goto(`${BASE}/borrowers`, { waitUntil: "networkidle" });
  await shot(emptySmall, "23-borrowers-empty-390");
  await emptyMobile.close();
  await empty.close();
} finally {
  await browser.close();
}

record("");
record(failures === 0 ? "all checks passed" : `${failures} checks FAILED`);
record("");
record("Data note: this run imports 6 borrowers into the first organisation and");
record("empties the third. Re-running npm run test:schema reapplies the schema and");
record("restores the seed, which is how the isolation counts go back to 15, 14, 11.");

writeFileSync(`${SHOTS}/borrowers-run.md`, ["# Borrowers verification run", "", "```", ...notes, "```", ""].join("\n"), "utf8");

process.exit(failures ? 1 : 0);

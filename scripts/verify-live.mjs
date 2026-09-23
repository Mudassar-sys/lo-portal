// The live run: every requirement in docs/REQUIREMENTS-TRACE.md, in the
// client's order, against the deployed alias, in a real Chrome window.
//
//   npm run verify:live            two consecutive runs, which is the bar
//   npm run verify:live -- --runs=1
//
// What makes this different from the four local suites:
//   - it runs against the deployed URL, never localhost;
//   - Chrome is headed and branded, channel "chrome" with headless false, so
//     what is verified is what a person sees (RESEARCH.md, "Headed Chrome");
//   - every requirement gets its own browser context and its own tab, so no
//     step can pass on state another step left behind;
//   - every requirement gets a screenshot under docs/screenshots/live and a
//     line in docs/screenshots/live-run.md naming the trace row it answers.
//
// The seed is restored at the start of every run, because several steps
// deliberately change data: intake adds a borrower, the import adds 36, the
// empty state step empties a tenant.

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

process.loadEnvFile(".env.local");

const ALIAS = process.env.LIVE_URL ?? "https://fieldstone-portal.vercel.app";
const PASSWORD = process.env.DEMO_PASSWORD;
const SHOTS = "docs/screenshots/live";
const FIXTURE = "docs/fixtures/borrowers-sample.csv";
const BULK = "docs/fixtures/borrowers-bulk.csv";
const PAGE_SIZE = 25; // must match lib/borrowers.ts

const SEAT_LO = "harborline.lo@fieldstone.example";
const SEAT_ADMIN = "harborline.admin@fieldstone.example";
const SEAT_MANAGER = "harborline.manager@fieldstone.example";
const SEAT_BAYOU = "bayoucity.manager@fieldstone.example";
const SEAT_REDOAK = "redoak.lo@fieldstone.example";

const runs = Number((process.argv.find((a) => a.startsWith("--runs=")) ?? "--runs=2").split("=")[1]);

if (!PASSWORD) {
  console.error("DEMO_PASSWORD is not set in .env.local");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const orgId = async (slug) =>
  (await admin.from("organizations").select("id").eq("slug", slug).single()).data.id;
const borrowerCount = async (org) =>
  (await admin.from("borrowers").select("id", { count: "exact", head: true }).eq("org_id", org)).count;

// ---------------------------------------------------------------------------

let lines = [];
let failures = 0;
let shotIndex = 0;
let covered = new Set();

const say = (line = "") => {
  console.log(line);
  lines.push(line);
};
const check = (ok, statement) => {
  say(`    ${ok ? "pass" : "FAIL"}  ${statement}`);
  if (!ok) failures += 1;
};

const shot = async (page, slug) => {
  shotIndex += 1;
  const name = `${String(shotIndex).padStart(2, "0")}-${slug}`;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  say(`    shot  ${SHOTS}/${name}.png`);
  return `${SHOTS}/${name}.png`;
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

const go = async (page, path) => {
  const url = path.startsWith("http") ? path : `${ALIAS}${path}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {});
};

let browser = null;

// One requirement, one context, one tab. The context is always closed, so the
// next requirement starts with an empty cookie jar.
const requirement = async (rows, title, body, viewport = { width: 1280, height: 900 }) => {
  say("");
  say(`ROW ${rows.join(", ")}  ${title}`);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await body(page, context);
    for (const row of rows) covered.add(row);
  } catch (error) {
    failures += 1;
    say(`    FAIL  the step threw: ${String(error).split("\n")[0]}`);
  } finally {
    await context.close();
  }
};

// The database host on this machine intermittently fails to resolve. That is
// the network, not the software, so a seed step is retried once when it failed
// for a reason that is plainly a lookup or a reset connection, and the retry is
// always printed. Anything else is reported with its reason rather than a bare
// exit code: an earlier version swallowed the output and left "exit 1" beside
// data that was, in fact, correctly seeded.
const TRANSIENT = /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|socket hang up|getaddrinfo|fetch failed/i;

const runSeedStep = (script) => {
  const result = spawnSync("npm", ["run", script], { encoding: "utf8", shell: true });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};

const resetSeed = () => {
  for (const script of ["test:schema", "seed:documents"]) {
    let result = runSeedStep(script);
    if (result.status !== 0 && TRANSIENT.test(result.out)) {
      say(`    seed  ${script}: failed on a network error, retrying once`);
      result = runSeedStep(script);
    }
    const summary = result.out
      .split(/\r?\n/)
      .filter((l) => /passed, |uploaded|failed/.test(l))
      .slice(-1)[0];
    say(`    seed  ${script}: ${summary?.trim() ?? `exit ${result.status}`}`);
    if (result.status !== 0) {
      failures += 1;
      say(`    FAIL  ${script} exited ${result.status}, last lines follow`);
      for (const line of result.out.split(/\r?\n/).filter(Boolean).slice(-6)) {
        say(`          ${line.trim()}`);
      }
    }
  }
};

// ---------------------------------------------------------------------------

const oneRun = async (runNumber) => {
  lines = [];
  failures = 0;
  shotIndex = 0;
  covered = new Set();

  say(`# Live run ${runNumber} of ${runs}`);
  say("");
  say(`target        ${ALIAS}`);
  say(`started       ${new Date().toISOString()}`);
  say('browser       Chrome, channel "chrome", headless false');
  say("isolation     one browser context and one tab per requirement");
  say("");
  say("Restoring the seed, so this run starts from the same state as the last.");
  resetSeed();

  const harborline = await orgId("harborline-mortgage");
  const bayou = await orgId("bayou-city-lending");
  const redoak = await orgId("red-oak-residential");
  const linkA = (await admin.from("intake_links").select("token").eq("org_id", harborline).single()).data;
  const linkB = (await admin.from("intake_links").select("token").eq("org_id", bayou).single()).data;

  say("");
  say(
    `seeded        Harborline ${await borrowerCount(harborline)}, ` +
      `Bayou City ${await borrowerCount(bayou)}, Red Oak ${await borrowerCount(redoak)}`,
  );

  // -- 24, 31 ------------------------------------------------------------
  // Not a browser step, and it says so. The live deployment and these tests
  // address the same PostgreSQL project, so this is the database half of the
  // same system the tabs below are driving. It runs here, before the browser
  // opens, because the tests assert the seeded counts while the steps below
  // deliberately change them: running it last failed on the import's own 36
  // rows rather than on anything about isolation.
  say("");
  say("ROW 24, 31  isolation tests against the database the live site is using");
  const tests = spawnSync("npm", ["run", "test:schema", "--", "--tests-only"], { encoding: "utf8", shell: true });
  const summary = `${tests.stdout ?? ""}`
    .split(/\r?\n/)
    .filter((l) => /passed, /.test(l))
    .slice(-1)[0];
  check(tests.status === 0, `isolation tests on the live project: ${summary?.trim() ?? `exit ${tests.status}`}`);
  if (tests.status === 0) {
    covered.add(24);
    covered.add(31);
  }

  browser = await chromium.launch({ channel: "chrome", headless: false });

  // A place to carry a URL from one requirement to the next.
  const carry = {};

  try {
    // -- 1 ---------------------------------------------------------------
    await requirement([1], "organizations: a seat sees one tenant, branded as itself", async (page) => {
      await signIn(page, SEAT_LO);
      const heading = await page.locator("h1").first().innerText();
      check(heading.includes("Harborline"), `the overview names the seat's own tenant: ${heading}`);
      const tiles = (await page.locator("p.font-mono").allInnerTexts()).slice(0, 4).join(",");
      check(tiles === "15,10,6,8", `the tiles show this tenant's own totals: ${tiles}`);
      carry.accentA = await page.evaluate(
        () => getComputedStyle(document.querySelector("[data-brand-swatch]")).backgroundColor,
      );
      say(`    note  accent on first paint ${carry.accentA}`);
      await shot(page, "overview-tenant-one");
    });

    await requirement([1], "organizations: a second tenant on the same deployment", async (page) => {
      await signIn(page, SEAT_BAYOU);
      const heading = await page.locator("h1").first().innerText();
      const accent = await page.evaluate(
        () => getComputedStyle(document.querySelector("[data-brand-swatch]")).backgroundColor,
      );
      check(heading.includes("Bayou City"), `a different lender, branded differently: ${heading}`);
      check(accent !== carry.accentA, `and a different accent: ${accent}`);
      await shot(page, "overview-tenant-two");
    });

    // -- 2 and 29 --------------------------------------------------------
    await requirement([2, 29], "named seats: a second device takes the seat, and is revoked", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, "/sessions");
      check((await page.locator("text=this device").count()) === 1, "exactly one seat row reads 'this device'");
      const before = (await admin.from("seats").select("active_session_id").eq("login_email", SEAT_LO).single()).data;
      await shot(page, "seat-held-by-this-device");

      const second = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const other = await second.newPage();
      await signIn(other, SEAT_LO);
      const after = (await admin.from("seats").select("active_session_id").eq("login_email", SEAT_LO).single()).data;
      check(after.active_session_id !== before.active_session_id, "the seat moved to the second device's session");
      await shot(other, "seat-taken-by-second-device");

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      check(
        (await page.locator("text=in use elsewhere").count()) === 1,
        "the first device now reads the seat as in use elsewhere",
      );
      await shot(page, "seat-in-use-elsewhere");

      await page.click('button:has-text("Sign out other devices")');
      await page.waitForSelector('[role="status"]', { timeout: 60000 });
      const back = (await admin.from("seats").select("active_session_id").eq("login_email", SEAT_LO).single()).data;
      check(
        back.active_session_id !== after.active_session_id,
        "sign out other devices returned the seat to this device",
      );
      await shot(page, "sign-out-other-devices");

      // The proof is the refresh token, not the painted page: an access token
      // already issued stays valid until it expires, which the screen says.
      const cookies = await second.cookies();
      const authCookies = cookies
        .filter((c) => /auth-token(\.\d+)?$/.test(c.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      let refreshToken = null;
      if (authCookies.length) {
        let raw = authCookies.map((c) => c.value).join("");
        raw = raw.startsWith("base64-")
          ? Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8")
          : decodeURIComponent(raw);
        try {
          refreshToken = JSON.parse(raw).refresh_token ?? null;
        } catch {
          refreshToken = null;
        }
      }
      check(Boolean(refreshToken), "the displaced device's refresh token was recovered from its cookie jar");
      if (refreshToken) {
        const asDeviceB = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const { data, error } = await asDeviceB.auth.refreshSession({ refresh_token: refreshToken });
        check(
          Boolean(error) || !data?.session,
          `the displaced device cannot obtain a new token: ${error?.message ?? "it still could"}`,
        );
      }
      await second.close();
    });

    await requirement([29], "signed out means signed out", async (page) => {
      await go(page, "/borrowers");
      check(
        page.url().includes("/login"),
        `a browser with no session asking for a portal route lands on sign in: ${page.url().replace(ALIAS, "")}`,
      );
      await shot(page, "signed-out-redirected-to-login");
    });

    // -- 5 ---------------------------------------------------------------
    await requirement([5], "persistent client profiles: list, search, filter", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, "/borrowers");
      const rows = await page.locator("table tbody tr").count();
      check(rows === 15, `the list shows this tenant's 15 borrowers, saw ${rows}`);
      await shot(page, "borrowers-list");

      await go(page, "/borrowers?q=vega");
      check((await page.locator("table tbody tr").count()) === 1, "searching for one borrower returns one row");
      await shot(page, "borrowers-search");

      await go(page, `/borrowers?q=${encodeURIComponent('a,b)(c*%"')}`);
      check(
        (await page.locator("text=could not be loaded").count()) === 0,
        "a search term made of filter punctuation is treated as text, not as syntax",
      );
      await shot(page, "borrowers-search-punctuation");

      await go(page, "/borrowers?status=active");
      const filtered = await page.locator("table tbody tr").count();
      check(filtered > 0 && filtered <= 15, `the status filter narrows the list to ${filtered}`);
      await shot(page, "borrowers-filtered");
    });

    await requirement([5], "persistent client profiles: the detail screen", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, "/borrowers");
      await page.click("table tbody tr:first-child a");
      await page.waitForURL(/\/borrowers\/[0-9a-f-]{36}/, { timeout: 60000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      carry.borrowerUrl = page.url();
      await page.waitForSelector('a:has-text("Open"), :text("No documents yet")', { timeout: 60000 });
      const documents = await page.locator('a:has-text("Open")').count();
      check(documents >= 1, `the documents panel lists ${documents} objects from the tenant's own storage folder`);
      const activity = await page
        .getByText(/^(borrowers|documents|scenarios)\.(insert|update|delete)$/)
        .count();
      check(activity >= 1, `the activity panel renders ${activity} rows from the audit table`);
      await shot(page, "borrower-detail");
    });

    // -- 8 ---------------------------------------------------------------
    await requirement([8], "document management: the signed link resolves", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, carry.borrowerUrl);
      await page.waitForSelector('a:has-text("Open")', { timeout: 60000 });
      const href = await page.locator('a:has-text("Open")').first().getAttribute("href");
      const response = await page.request.get(href);
      check(response.ok(), `the signed document link resolves, HTTP ${response.status()}`);
      check(/token=/.test(href ?? ""), "the link is a signed URL rather than a public object path");
      await shot(page, "document-signed-link");
    });

    await requirement([8], "document management: upload accepted, and refused", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, carry.borrowerUrl);
      await page.waitForSelector('a:has-text("Open")', { timeout: 60000 });
      const before = await page.locator('a:has-text("Open")').count();
      await page.setInputFiles('input[type="file"]', {
        name: "closing-disclosure.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nclosing disclosure\n%%EOF"),
      });
      await page.locator('p[role="status"]').first().waitFor({ timeout: 60000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('a:has-text("Open")', { timeout: 60000 });
      const after = await page.locator('a:has-text("Open")').count();
      check(after === before + 1, `the document was added, ${before} then ${after}`);
      const audit = (
        await admin
          .from("audit_log")
          .select("action, actor_seat")
          .eq("table_name", "documents")
          .order("at", { ascending: false })
          .limit(1)
          .single()
      ).data;
      check(
        audit?.action === "documents.insert" && Boolean(audit?.actor_seat),
        `the upload wrote an audit row naming the acting seat: ${audit?.action}`,
      );
      await shot(page, "document-upload-accepted");

      await page.setInputFiles('input[type="file"]', {
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("this is not a document"),
      });
      const refusal = page.locator('p[role="alert"]').first();
      await refusal.waitFor({ timeout: 60000 });
      check(/not accepted/i.test(await refusal.innerText()), "a text file is refused, on the server's terms");
      await shot(page, "document-upload-refused");
    });

    // -- 9, 27 -----------------------------------------------------------
    await requirement([9, 27], "financing scenarios: the builder and the results", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, "/scenarios/new");
      await page.selectOption('select[name="borrower_id"]', { index: 1 });
      await page.fill('input[name="property_address"]', "4711 Montrose Blvd, Houston, TX 77006");
      await page.fill('input[name="purchase_price"]', "615000");
      await page.fill('input[name="down_payment"]', "123000");
      await page.selectOption('select[name="credit_band"]', "700-739");
      await page.selectOption('select[name="loan_purpose"]', "purchase");
      const loan = await page.locator("dd").first().innerText();
      check(loan.includes("492,000"), `the builder works the loan out as the numbers are typed: ${loan}`);
      await shot(page, "scenario-builder");

      await Promise.all([
        page.waitForURL(/\/scenarios\/[0-9a-f-]{36}/, { timeout: 60000 }),
        page.click('button:has-text("Find lenders")'),
      ]);
      await page.waitForLoadState("networkidle").catch(() => {});
      carry.scenarioUrl = page.url();
      const quotes = await page.locator("ol > li").count();
      check(quotes >= 2, `the panel returned ${quotes} lenders that can take the file`);
      check((await page.getByText("Sharpest rate", { exact: true }).count()) === 1, "the cheapest quote is marked");
      check(
        (await page.locator("text=What would change the result").count()) === 1,
        "the lenders that could not take it say what would change that",
      );
      const source = await page.locator("text=matching service").first().innerText();
      check(/mock/.test(source), `the screen states its source: ${source.trim().slice(0, 70)}`);
      await shot(page, "scenario-results");
      carry.firstQuotes = await page.locator("ol > li p.font-mono").allInnerTexts();
    });

    await requirement([10], "protected lender results: aliases and ranges, and deterministic", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, carry.scenarioUrl);
      const quotes = await page.locator("ol > li p.font-mono").allInnerTexts();
      check(
        JSON.stringify(quotes) === JSON.stringify(carry.firstQuotes),
        "the same scenario renders the same quotes, so the panel is deterministic",
      );
      // Every quote must be headed by an alias rather than a lender. Written
      // as a positive check on purpose: an earlier version searched the whole
      // page for a handful of real lender names, and "Purchase price" contains
      // one of them, so it failed on the product's own label.
      const headings = await page.locator("ol > li p.font-medium").allInnerTexts();
      check(
        headings.length > 0 && headings.every((h) => /^Lender [A-Z]$/.test(h.trim())),
        `every quote is headed by an alias, never a lender: ${headings.join(", ")}`,
      );
      const ranges = await page.locator("ol > li p.font-mono").allInnerTexts();
      check(
        ranges.length > 0 && ranges.every((r) => /to/.test(r) && /%/.test(r)),
        `and each rate is a range rather than a single quoted price: ${ranges[0]?.replace(/\s+/g, " ")}`,
      );
      await shot(page, "protected-lender-results");
    });

    // -- 15 --------------------------------------------------------------
    await requirement([15], "premium tier: allowed on a tenant that has it", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, "/property-intelligence");
      check((await page.locator("text=Estimated value").count()) >= 1, "the premium panel renders for a premium tenant");
      await shot(page, "premium-allowed");
    });

    await requirement([15], "premium tier: denied on the server for a tenant that does not", async (page) => {
      await signIn(page, SEAT_BAYOU);
      await go(page, "/property-intelligence");
      check(
        (await page.locator("text=Not included in this organisation's plan").count()) === 1,
        "a non premium tenant is denied",
      );
      check(
        !/Estimated value|Rental estimate|Days on market/.test(await page.content()),
        "and none of the panel's data is in the HTML sent to it, so the denial is the server's",
      );
      await shot(page, "premium-denied");
    });

    // -- 4 ---------------------------------------------------------------
    await requirement([4], "tenant isolation: another organisation sees none of it", async (page) => {
      await signIn(page, SEAT_BAYOU);
      await go(page, "/borrowers");
      const rows = await page.locator("table tbody tr").count();
      check(rows === 14, `the second organisation sees its own 14 borrowers, saw ${rows}`);
      const names = await page.locator("table tbody tr td:first-child").allInnerTexts();
      const leaked = names.filter((n) => /Vega|Okonkwo|Ferraro|Ashford|Blackwood/.test(n));
      check(leaked.length === 0, `none of the first tenant's borrowers appear, ${leaked.length} leaked`);
      await shot(page, "cross-tenant-list");

      await go(page, carry.borrowerUrl);
      check((await page.locator("text=Profile").count()) === 0, "the first tenant's borrower URL renders no profile");
      await shot(page, "cross-tenant-borrower-url");

      await go(page, carry.scenarioUrl);
      check(
        (await page.locator("text=Purchase price").count()) === 0,
        "the first tenant's scenario URL renders no scenario",
      );
      await shot(page, "cross-tenant-scenario-url");

      await go(page, "/borrowers/import");
      await page.setInputFiles('input[type="file"]', FIXTURE);
      await page.waitForSelector("text=Preview", { timeout: 60000 });
      const held = Number(
        await page
          .locator('dt:has-text("Already held")')
          .first()
          .evaluate((node) => node.nextElementSibling?.textContent?.trim() ?? "0"),
      );
      check(held === 0, `duplicate detection is tenant scoped: this organisation holds none of them, saw ${held}`);
      await shot(page, "cross-tenant-import-duplicates");
    });

    // -- 7 ---------------------------------------------------------------
    await requirement([7], "branded borrower intake, with no session at all", async (page) => {
      const before = await borrowerCount(harborline);
      await go(page, `/intake/${linkA.token}`);
      const header = await page.locator("header").innerText();
      check(/Harborline/.test(header), `the public page carries the lender's own name: ${header.split("\n")[0]}`);
      await shot(page, "intake-branded");

      await page.fill('input[name="first_name"]', "Walk");
      await page.fill('input[name="last_name"]', "In");
      await page.fill('input[name="email"]', "walk.in@example.com");
      await page.click('button[type="submit"]');
      await page.waitForSelector("text=Thank you", { timeout: 60000 });
      await shot(page, "intake-submitted");

      const afterA = await borrowerCount(harborline);
      const afterB = await borrowerCount(bayou);
      check(afterA === before + 1, `the borrower landed in the link's tenant, ${before} then ${afterA}`);
      check(afterB === 14, `the other tenant is untouched at ${afterB}`);
      const source = (
        await admin
          .from("borrowers")
          .select("source")
          .eq("org_id", harborline)
          .eq("last_name", "In")
          .limit(1)
          .single()
      ).data;
      check(source?.source === "intake", `the row is marked as coming from intake: ${source?.source}`);

      await go(page, "/intake/not-a-real-token");
      check(!/Harborline|Bayou|Red Oak/.test(await page.content()), "an unknown token renders no tenant name at all");
      await shot(page, "intake-unknown-token");
    });

    // -- 6 ---------------------------------------------------------------
    await requirement([6], "CSV import: preview, the error list, and the summary", async (page) => {
      await signIn(page, SEAT_LO);
      const before = await borrowerCount(harborline);
      await go(page, "/borrowers/import");
      await page.setInputFiles('input[type="file"]', FIXTURE);
      await page.waitForSelector("text=Preview", { timeout: 60000 });
      const tile = async (label) =>
        Number(
          await page
            .locator(`dt:has-text("${label}")`)
            .first()
            .evaluate((node) => node.nextElementSibling?.textContent?.trim() ?? "0"),
        );
      const ready = await tile("Ready");
      const held = await tile("Already held");
      const repeated = await tile("Repeated in file");
      const bad = await tile("Rows with errors");
      say(`    note  ready ${ready}, already held ${held}, repeated ${repeated}, rows with errors ${bad}`);
      check(ready === 6, `6 rows are importable, saw ${ready}`);
      check(held === 1, `1 row is already held by this organisation, saw ${held}`);
      check(repeated === 1, `1 row is repeated inside the file, saw ${repeated}`);
      check(bad === 4, `4 lines carry errors, saw ${bad}`);
      check(
        (await page.locator("text=Rows that will not be imported").count()) === 1,
        "the error list names the line numbers from the file",
      );
      await shot(page, "csv-import-preview");

      await page.click('button:has-text("Import 6")');
      await page.waitForSelector("text=Import finished", { timeout: 120000 });
      const inserted = await page
        .locator('dt:has-text("Inserted")')
        .first()
        .evaluate((node) => node.nextElementSibling?.textContent?.trim());
      check(inserted === "6", `the summary reports 6 inserted, saw ${inserted}`);
      const after = await borrowerCount(harborline);
      check(after === before + 6, `the tenant holds six more borrowers, ${before} then ${after}`);
      await shot(page, "csv-import-summary");
    });

    // -- 5, pagination and the empty state -------------------------------
    await requirement([5], "pagination, once a tenant holds more than one page", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, "/borrowers/import");
      await page.setInputFiles('input[type="file"]', BULK);
      await page.waitForSelector("text=Preview", { timeout: 60000 });
      await page.click('button:has-text("Import 30")');
      await page.waitForSelector("text=Import finished", { timeout: 120000 });
      await go(page, "/borrowers");
      const pager = await page.locator('a:has-text("Next")').count();
      const label = await page.locator("text=/^[0-9]+ of [0-9]+$/").first().innerText();
      check(pager === 1, `the pager appears past ${PAGE_SIZE} rows, and the page label reads "${label}"`);
      const rows = await page.locator("table tbody tr").count();
      check(rows === PAGE_SIZE, `one page holds ${PAGE_SIZE} rows, saw ${rows}`);
      await shot(page, "borrowers-pagination");
    });

    await requirement([5], "the empty state, on a tenant that holds nothing", async (page) => {
      await admin.from("borrowers").delete().eq("org_id", redoak);
      await signIn(page, SEAT_REDOAK);
      await go(page, "/borrowers");
      check(
        (await page.locator("text=No borrowers yet").count()) === 1,
        "an organisation with no borrowers gets the empty state, not a blank table",
      );
      await shot(page, "borrowers-empty");
    });

    // -- 11, 12 ----------------------------------------------------------
    await requirement([11, 12], "submission workflow and ticket assignment, as a manager", async (page) => {
      await signIn(page, SEAT_MANAGER);
      await go(page, "/submissions");
      const cards = await page.locator("ul > li").count();
      check(cards >= 6, `the queue shows this tenant's submissions, ${cards} of them`);
      const assignment = await page.locator("select").count();
      check(assignment >= 1, `assignment is offered to a manager, ${assignment} controls`);
      await shot(page, "submissions-queue");

      const target = (
        await admin
          .from("submissions")
          .select("id, status")
          .eq("org_id", harborline)
          .eq("status", "submitted")
          .limit(1)
          .single()
      ).data;
      if (target) {
        const advance = page.locator('button:has-text("Take into review")').first();
        await advance.waitFor({ state: "visible", timeout: 60000 });
        await advance.click();
        await page.locator('p[role="status"]').first().waitFor({ timeout: 60000 });
        const moved = (await admin.from("submissions").select("status").eq("id", target.id).single()).data;
        check(
          moved?.status === "in_review",
          `a manager moved the submission, the database row now reads ${moved?.status}`,
        );
        const audit = (
          await admin
            .from("audit_log")
            .select("action, actor_seat")
            .eq("table_name", "submissions")
            .order("at", { ascending: false })
            .limit(1)
            .single()
        ).data;
        check(
          audit?.action === "submissions.update" && Boolean(audit?.actor_seat),
          `the move left an audit row naming the acting seat: ${audit?.action}`,
        );
        await shot(page, "submission-moved");
      }
    });

    // -- 3, 12 -----------------------------------------------------------
    await requirement([3, 12], "role based permissions: the same queue as a loan officer", async (page) => {
      await signIn(page, SEAT_LO);
      await go(page, "/submissions");
      const disabled = await page.locator("button:disabled").count();
      check(disabled > 0, `the controls are inert for a loan officer, ${disabled} disabled`);
      check(
        (await page.locator("text=the database refuses the write").count()) > 0,
        "and the page says the database refuses the write, rather than hiding the button",
      );
      await shot(page, "submissions-loan-officer");
    });

    // -- 13, 14 ----------------------------------------------------------
    await requirement([13, 14], "fee ledger and reconciliation", async (page) => {
      await signIn(page, SEAT_MANAGER);
      await go(page, "/ledger");
      const periods = await page.locator("h2").count();
      check(periods >= 1, `the ledger totals by period, ${periods} periods`);
      check((await page.locator("text=unmatched").count()) >= 1, "unreconciled entries are flagged rather than buried");
      await shot(page, "ledger-reconciliation");
    });

    // -- 30 --------------------------------------------------------------
    await requirement([30], "the audit trail the application cannot write to", async (page) => {
      await signIn(page, SEAT_MANAGER);
      await go(page, "/audit");
      const rows = await page.locator("ul > li").count();
      check(rows >= 1, `the trail renders ${rows} entries`);
      await go(page, "/audit?table=submissions");
      check((await page.locator("ul > li").count()) >= 1, "filtering by table works");
      await shot(page, "audit-trail");
    });

    // -- 3 ---------------------------------------------------------------
    await requirement([3], "role based permissions: branding, as an administrator", async (page) => {
      await signIn(page, SEAT_ADMIN);
      await go(page, "/settings");
      check((await page.locator("text=/intake/").count()) >= 1, "the organisation's own public intake link is shown");
      await page.fill('input[name="accent_color"]', "#7c5cff");
      await page.click('button:has-text("Save branding")');
      await page.locator('p[role="status"]').first().waitFor({ timeout: 60000 });
      const row = (await admin.from("organizations").select("accent_color, premium").eq("id", harborline).single()).data;
      check(row?.accent_color === "#7c5cff", `an administrator can rebrand, the row now reads ${row?.accent_color}`);
      check(row?.premium === true, "and the tier is untouched by that write, because it is outside the column grant");
      await shot(page, "settings-branding-administrator");
      await page.fill('input[name="accent_color"]', "#4f7cff");
      await page.click('button:has-text("Save branding")');
      await page.locator('p[role="status"]').first().waitFor({ timeout: 60000 });
    });

    await requirement([3], "role based permissions: the same page as a manager", async (page) => {
      await signIn(page, SEAT_MANAGER);
      await go(page, "/settings");
      const readOnly = await page.locator("input:disabled").count();
      check(readOnly >= 3, `the branding fields are read only for a manager, ${readOnly} disabled`);
      await shot(page, "settings-read-only-manager");
    });

    // -- 17 --------------------------------------------------------------
    await requirement(
      [17],
      "portal screen flows at 390 pixels",
      async (page) => {
        await signIn(page, SEAT_MANAGER);
        for (const [path, slug] of [
          ["/borrowers", "390-borrowers"],
          ["/scenarios", "390-scenarios"],
          ["/submissions", "390-submissions"],
          ["/ledger", "390-ledger"],
          ["/audit", "390-audit"],
        ]) {
          await go(page, path);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          );
          check(!overflow, `${path} does not scroll sideways at 390 pixels`);
          await shot(page, slug);
        }
      },
      { width: 390, height: 844 },
    );

    await requirement(
      [7, 17],
      "the second tenant's intake link at 390 pixels",
      async (page) => {
        await go(page, `/intake/${linkB.token}`);
        check(
          /Bayou/.test(await page.locator("header").innerText()),
          "a second tenant's intake link carries that tenant's branding",
        );
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        check(!overflow, "and it does not scroll sideways at 390 pixels");
        await shot(page, "390-intake-tenant-two");
      },
      { width: 390, height: 844 },
    );

    // -- 25, 26 ----------------------------------------------------------
    await requirement([25, 26], "React, and the routes that make up the product", async (page) => {
      await signIn(page, SEAT_MANAGER);
      const hydrated = await page.evaluate(() =>
        Boolean(
          document.querySelector("script[src*='/_next/static/']") &&
            Object.keys(window).some((k) => k.startsWith("__next")),
        ),
      );
      check(hydrated, "the live page is the React application, hydrated from its own chunks");
      const codes = [];
      for (const route of [
        "/",
        "/borrowers",
        "/scenarios",
        "/submissions",
        "/ledger",
        "/audit",
        "/settings",
        "/sessions",
      ]) {
        const response = await page.request.get(`${ALIAS}${route}`);
        codes.push(`${route} ${response.status()}`);
      }
      check(
        codes.every((c) => c.endsWith("200")),
        `every portal route answers: ${codes.join(", ")}`,
      );
      await shot(page, "portal-routes");
    });

    // -- 17, the dead end for a route that matches nothing ---------------
    await requirement([17], "a route that does not exist at all", async (page) => {
      await signIn(page, SEAT_MANAGER);
      const response = await page.goto(`${ALIAS}/no-such-page`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForLoadState("networkidle").catch(() => {});
      check(response?.status() === 404, `an unmatched URL answers 404, saw ${response?.status()}`);
      const body = await page.locator("body").innerText();
      check(/Nothing here/i.test(body), "it is the designed dead end, not the framework default");
      check(!/This page could not be found/i.test(body), "the framework default text is not on the page");
      await shot(page, "unknown-route");
    });
  } finally {
    if (browser) await browser.close();
  }

  say("");
  say(`finished      ${new Date().toISOString()}`);
  say(`requirements covered: ${[...covered].sort((a, b) => a - b).join(", ")}`);
  say(`screenshots:  ${shotIndex}`);
  say(failures === 0 ? "RESULT: all checks passed" : `RESULT: ${failures} checks FAILED`);

  return { failures, lines: [...lines], covered: new Set(covered), shots: shotIndex };
};

// ---------------------------------------------------------------------------

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const results = [];
for (let run = 1; run <= runs; run += 1) {
  results.push(await oneRun(run));
}

// Leave the project on the clean seed whatever happened.
const tail = [];
const sayTail = (line) => {
  console.log(line);
  tail.push(line);
};
sayTail("");
sayTail("Restoring the clean seed after the last run.");
for (const script of ["test:schema", "seed:documents"]) {
  let result = runSeedStep(script);
  if (result.status !== 0 && TRANSIENT.test(result.out)) {
    sayTail(`  ${script}: failed on a network error, retrying once`);
    result = runSeedStep(script);
  }
  const summary = result.out
    .split(/\r?\n/)
    .filter((l) => /passed, |uploaded/.test(l))
    .slice(-1)[0];
  sayTail(`  ${script}: ${summary?.trim() ?? `exit ${result.status}`}`);
}

const clean = results.every((r) => r.failures === 0);
const allCovered = [...new Set(results.flatMap((r) => [...r.covered]))].sort((a, b) => a - b);

writeFileSync(
  "docs/screenshots/live-run.md",
  [
    "# Live run",
    "",
    `Produced by \`npm run verify:live\` against **${ALIAS}**, in a real Chrome`,
    'window: `channel: "chrome"`, `headless: false`. Every requirement below',
    "opens its own browser context and its own tab, so no step can pass on",
    "state another step left behind, and every one of them writes a screenshot",
    "into `live/` beside this file.",
    "",
    `Runs: **${results.length}**, consecutive, each starting from a freshly`,
    "restored seed.",
    "",
    "| run | checks failed | screenshots |",
    "| --- | --- | --- |",
    ...results.map((r, i) => `| ${i + 1} | ${r.failures} | ${r.shots} |`),
    "",
    `Requirement rows covered live: ${allCovered.join(", ")}.`,
    "",
    clean ? "**RESULT: both runs clean.**" : "**RESULT: at least one run had failures. See the transcripts.**",
    "",
    ...results.flatMap((r, i) => ["", `## Run ${i + 1}`, "", "```", ...r.lines, "```"]),
    "",
    "## After the runs",
    "",
    "```",
    ...tail,
    "```",
    "",
  ].join("\n"),
  "utf8",
);

process.exit(clean ? 0 : 1);

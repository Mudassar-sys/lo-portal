// Verification for the scenario builder, the results screen, document upload
// and the premium gate, in a real browser against the real project.
//
// Usage: npm run verify:scenarios      (the dev server must be running)

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD;
const SHOTS = "docs/screenshots";

const SEAT_PREMIUM = "harborline.lo@fieldstone.example";
const SEAT_NON_PREMIUM = "bayoucity.manager@fieldstone.example";

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
  const page = await desktop.newPage();
  await signIn(page, SEAT_PREMIUM);

  record("1. scenario builder");
  await page.goto(`${BASE}/scenarios/new`, { waitUntil: "networkidle" });
  await page.selectOption('select[name="borrower_id"]', { index: 1 });
  await page.fill('input[name="property_address"]', "4711 Montrose Blvd, Houston, TX 77006");
  await page.fill('input[name="purchase_price"]', "615000");
  await page.fill('input[name="down_payment"]', "123000");
  await page.selectOption('select[name="credit_band"]', "700-739");
  await page.selectOption('select[name="loan_purpose"]', "purchase");

  // The ask panel works the numbers out before anything is submitted.
  const loanShown = await page.locator("dd").first().innerText();
  check(loanShown.includes("492,000"), `the builder works out the loan as you type: ${loanShown}`);
  await shot(page, "30-scenario-builder-desktop");

  record("");
  record("2. results");
  await Promise.all([
    page.waitForURL(/\/scenarios\/[0-9a-f-]{36}/, { timeout: 30000 }),
    page.click('button:has-text("Find lenders")'),
  ]);
  await page.waitForLoadState("networkidle");
  const scenarioUrl = page.url();

  const quotes = await page.locator("ol > li").count();
  check(quotes >= 2, `the panel returned ${quotes} lenders that can take the file`);
  // Exact, because a substring match also finds the reason line that says
  // "the sharpest rate of the panel".
  const sharpest = await page.getByText("Sharpest rate", { exact: true }).count();
  check(sharpest === 1, "the cheapest quote is marked");
  const reasons = await page.locator("ol > li ul li").count();
  check(reasons >= quotes, `each quote says why it matched, ${reasons} reasons in total`);
  const misses = await page.locator("text=What would change the result").count();
  check(misses === 1, "the lenders that could not take it are listed with what would change that");
  const sourceLabel = await page.locator("text=matching service").first().innerText();
  check(/mock/.test(sourceLabel), `the screen states the source: ${sourceLabel.trim().slice(0, 80)}`);
  await shot(page, "31-scenario-results-desktop");

  // Deterministic: the same inputs produce the same quotes.
  const firstRun = await page.locator("ol > li p.font-mono").allInnerTexts();
  await page.goto(`${BASE}/scenarios/new`, { waitUntil: "networkidle" });
  await page.selectOption('select[name="borrower_id"]', { index: 1 });
  await page.fill('input[name="property_address"]', "4711 Montrose Blvd, Houston, TX 77006");
  await page.fill('input[name="purchase_price"]', "615000");
  await page.fill('input[name="down_payment"]', "123000");
  await page.selectOption('select[name="credit_band"]', "700-739");
  await page.selectOption('select[name="loan_purpose"]', "purchase");
  await Promise.all([
    page.waitForURL(/\/scenarios\/[0-9a-f-]{36}/, { timeout: 30000 }),
    page.click('button:has-text("Find lenders")'),
  ]);
  await page.waitForLoadState("networkidle");
  const secondRun = await page.locator("ol > li p.font-mono").allInnerTexts();
  check(
    JSON.stringify(firstRun) === JSON.stringify(secondRun),
    "running the same scenario twice produces the same quotes"
  );

  record("");
  record("3. document upload, accepted and refused");
  const { data: borrower } = await admin
    .from("borrowers")
    .select("id")
    .eq("org_id", (await admin.from("organizations").select("id").eq("slug", "harborline-mortgage").single()).data.id)
    .order("last_name")
    .limit(1)
    .single();

  await page.goto(`${BASE}/borrowers/${borrower.id}`, { waitUntil: "networkidle" });
  const before = await page.locator('a:has-text("Open")').count();

  await page.setInputFiles('input[type="file"]', {
    name: "closing-disclosure.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nclosing disclosure\n%%EOF"),
  });
  await page.locator('p[role="status"]').first().waitFor({ timeout: 30000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('a:has-text("Open")', { timeout: 20000 });
  const after = await page.locator('a:has-text("Open")').count();
  check(after === before + 1, `the document was added, ${before} then ${after}`);

  // The audit row has to name the seat that did it.
  const { data: audit } = await admin
    .from("audit_log")
    .select("action, actor_seat")
    .eq("table_name", "documents")
    .order("at", { ascending: false })
    .limit(1)
    .single();
  check(
    audit?.action === "documents.insert" && Boolean(audit?.actor_seat),
    `the upload wrote an audit row with an acting seat: ${audit?.action}, seat ${audit?.actor_seat ? "present" : "missing"}`
  );
  await shot(page, "32-document-upload-accepted-desktop");

  await page.setInputFiles('input[type="file"]', {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a document"),
  });
  // Scoped to the upload control's own message. Next.js renders a route
  // announcer with role="alert" as well, so a bare selector matches two.
  const refusalMessage = page.locator('p[role="alert"]').first();
  await refusalMessage.waitFor({ timeout: 20000 });
  const refusal = await refusalMessage.innerText();
  check(/not accepted/i.test(refusal), `a text file is refused: ${refusal.trim()}`);
  await shot(page, "33-document-upload-refused-desktop");

  record("");
  record("4. premium panel, on a tenant that has the tier");
  await page.goto(`${BASE}/property-intelligence`, { waitUntil: "networkidle" });
  const allowed = await page.locator("text=Estimated value").count();
  check(allowed >= 1, `the premium panel renders for a premium tenant, ${allowed} valuations`);
  await shot(page, "34-premium-panel-allowed-desktop");

  record("");
  record("5. premium panel, on a tenant that does not");
  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const otherPage = await other.newPage();
  await signIn(otherPage, SEAT_NON_PREMIUM);
  await otherPage.goto(`${BASE}/property-intelligence`, { waitUntil: "networkidle" });
  const denied = await otherPage.locator("text=Not included in this organisation's plan").count();
  check(denied === 1, "a non premium tenant is denied");

  // The denial has to be a server decision: none of the panel's data may be
  // in the response at all, not merely hidden.
  const html = await otherPage.content();
  check(
    !/Estimated value|Rental estimate|Days on market/.test(html),
    "no premium data is present in the page sent to a non premium tenant"
  );
  await shot(otherPage, "35-premium-panel-denied-desktop");

  record("");
  record("6. cross tenant on the scenario surface");
  await otherPage.goto(scenarioUrl, { waitUntil: "networkidle" });
  const foreignScenario = await otherPage.locator("text=Purchase price").count();
  check(foreignScenario === 0, "another tenant's scenario URL renders no scenario");
  await shot(otherPage, "36-cross-tenant-scenario-url-desktop");
  await other.close();

  record("");
  record("7. 390 pixel layouts");
  const small = await mobile.newPage();
  await signIn(small, SEAT_PREMIUM);
  await small.goto(`${BASE}/scenarios/new`, { waitUntil: "networkidle" });
  await small.fill('input[name="purchase_price"]', "615000");
  await small.fill('input[name="down_payment"]', "123000");
  await shot(small, "37-scenario-builder-390");

  await small.goto(scenarioUrl, { waitUntil: "networkidle" });
  const smallOverflow = await small.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  check(!smallOverflow, "the results screen does not scroll sideways at 390 pixels");
  await shot(small, "38-scenario-results-390");

  await small.goto(`${BASE}/property-intelligence`, { waitUntil: "networkidle" });
  await shot(small, "39-premium-panel-allowed-390");

  const smallOther = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const smallOtherPage = await smallOther.newPage();
  await signIn(smallOtherPage, SEAT_NON_PREMIUM);
  await smallOtherPage.goto(`${BASE}/property-intelligence`, { waitUntil: "networkidle" });
  await shot(smallOtherPage, "40-premium-panel-denied-390");
  await smallOther.close();
} finally {
  await browser.close();
}

record("");
record(failures === 0 ? "all checks passed" : `${failures} checks FAILED`);

writeFileSync(
  `${SHOTS}/scenarios-run.md`,
  ["# Scenarios, uploads and premium verification run", "", "```", ...notes, "```", ""].join("\n"),
  "utf8"
);

process.exit(failures ? 1 : 0);

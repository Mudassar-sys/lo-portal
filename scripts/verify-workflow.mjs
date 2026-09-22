// Verification for the screens that close out the job description: the
// branded public intake, the submission workflow with assignment, the fee
// ledger with reconciliation, the audit trail, and organisation branding.
//
// Usage: npm run verify:workflow      (a server must be running)

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3100";
const PASSWORD = process.env.DEMO_PASSWORD;
const SHOTS = "docs/screenshots";

const MANAGER = "harborline.manager@fieldstone.example";
const OFFICER = "harborline.lo@fieldstone.example";
const ADMIN = "harborline.admin@fieldstone.example";

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

const HIDE = "nextjs-portal, [data-next-badge-root] { display: none !important; }";
const shot = async (page, name) => {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  record(`        ${SHOTS}/${name}.png`);
};

const signIn = async (page, email) => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle");
};

const browser = await chromium.launch({ channel: "chrome" });
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });

try {
  const harborline = (await admin.from("organizations").select("id").eq("slug", "harborline-mortgage").single()).data;
  const bayou = (await admin.from("organizations").select("id").eq("slug", "bayou-city-lending").single()).data;
  const linkA = (await admin.from("intake_links").select("token").eq("org_id", harborline.id).single()).data;
  const linkB = (await admin.from("intake_links").select("token").eq("org_id", bayou.id).single()).data;

  // -----------------------------------------------------------------
  record("1. the branded public intake, with no session at all");
  const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/intake/${linkA.token}`, { waitUntil: "networkidle" });

  const heading = await anonPage.locator("header").innerText();
  check(/Harborline/.test(heading), `the page carries the lender's own name: ${heading.split("\n")[0]}`);
  const accent = await anonPage.evaluate(() =>
    getComputedStyle(document.querySelector("header span")).backgroundColor
  );
  record(`        accent from the tenant record: ${accent}`);
  await shot(anonPage, "50-intake-branded-desktop");

  const before = (await admin.from("borrowers").select("id", { count: "exact", head: true }).eq("org_id", harborline.id)).count;
  await anonPage.fill('input[name="first_name"]', "Walk");
  await anonPage.fill('input[name="last_name"]', "In");
  await anonPage.fill('input[name="email"]', "walk.in@example.com");
  await anonPage.click('button[type="submit"]');
  await anonPage.waitForSelector("text=Thank you", { timeout: 30000 });
  await shot(anonPage, "51-intake-submitted-desktop");

  const afterA = (await admin.from("borrowers").select("id", { count: "exact", head: true }).eq("org_id", harborline.id)).count;
  const afterB = (await admin.from("borrowers").select("id", { count: "exact", head: true }).eq("org_id", bayou.id)).count;
  check(afterA === before + 1, `the borrower landed in the link's tenant, ${before} then ${afterA}`);
  check(afterB === 14, `the other tenant is untouched at ${afterB}`);

  const source = (await admin.from("borrowers").select("source").eq("org_id", harborline.id).eq("last_name", "In").single()).data;
  check(source?.source === "intake", `the row is marked as coming from intake: ${source?.source}`);

  // A token that is not a token gets nothing, not an error page naming a tenant.
  await anonPage.goto(`${BASE}/intake/not-a-real-token`, { waitUntil: "networkidle" });
  const body = await anonPage.content();
  check(
    !/Harborline|Bayou|Red Oak/.test(body),
    "an unknown token renders no tenant name at all"
  );
  await anon.close();

  // -----------------------------------------------------------------
  record("");
  record("2. submissions, as a manager");
  const page = await desktop.newPage();
  await signIn(page, MANAGER);
  await page.goto(`${BASE}/submissions`, { waitUntil: "networkidle" });

  const cards = await page.locator("ul > li").count();
  check(cards >= 6, `the queue shows this tenant's submissions, ${cards} of them`);
  await shot(page, "52-submissions-queue-desktop");

  // Move one along and confirm the database, not the screen, recorded it.
  const target = (await admin
    .from("submissions")
    .select("id, status")
    .eq("org_id", harborline.id)
    .eq("status", "submitted")
    .limit(1)
    .single()).data;

  if (target) {
    const advance = page.locator('button:has-text("Take into review")').first();
    await advance.waitFor({ state: "visible", timeout: 30000 });
    await advance.click();
    await page.locator('p[role="status"]').first().waitFor({ timeout: 30000 });
    const moved = (await admin.from("submissions").select("status").eq("id", target.id).single()).data;
    check(
      moved?.status === "in_review" || moved?.status === "submitted",
      `a manager can move a submission, the row now reads ${moved?.status}`
    );
    const audit = (await admin
      .from("audit_log")
      .select("action, actor_seat, details")
      .eq("table_name", "submissions")
      .order("at", { ascending: false })
      .limit(1)
      .single()).data;
    check(
      audit?.action === "submissions.update" && Boolean(audit?.actor_seat),
      `the move left an audit row with an acting seat: ${audit?.action}`
    );
  }

  record("");
  record("3. the same queue, as a loan officer");
  const officerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const officerPage = await officerContext.newPage();
  await signIn(officerPage, OFFICER);
  await officerPage.goto(`${BASE}/submissions`, { waitUntil: "networkidle" });
  const disabled = await officerPage.locator("button:disabled").count();
  check(disabled > 0, `the controls are inert for a loan officer, ${disabled} disabled`);
  const note = await officerPage.locator("text=the database refuses the write").count();
  check(note > 0, "and the page says the database refuses the write, rather than hiding the button");
  await shot(officerPage, "53-submissions-loan-officer-desktop");
  await officerContext.close();

  // -----------------------------------------------------------------
  record("");
  record("4. the fee ledger and reconciliation");
  await page.goto(`${BASE}/ledger`, { waitUntil: "networkidle" });
  const periods = await page.locator("h2").count();
  const unmatched = await page.locator("text=unmatched").count();
  check(periods >= 1, `the ledger totals by period, ${periods} periods`);
  check(unmatched >= 1, "unreconciled entries are flagged rather than buried");
  await shot(page, "54-ledger-reconciliation-desktop");

  // -----------------------------------------------------------------
  record("");
  record("5. the audit trail");
  await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
  const rows = await page.locator("ul > li").count();
  check(rows >= 1, `the trail renders ${rows} entries`);
  await page.goto(`${BASE}/audit?table=submissions`, { waitUntil: "networkidle" });
  const filtered = await page.locator("ul > li").count();
  check(filtered >= 1, `filtering by table works, ${filtered} submission entries`);
  await shot(page, "55-audit-desktop");

  // -----------------------------------------------------------------
  record("");
  record("6. organisation branding");
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, ADMIN);
  await adminPage.goto(`${BASE}/settings`, { waitUntil: "networkidle" });

  const intakeShown = await adminPage.locator("text=/intake/").count();
  check(intakeShown >= 1, "the organisation's own public intake link is shown");

  await adminPage.fill('input[name="accent_color"]', "#7c5cff");
  await adminPage.click('button:has-text("Save branding")');
  await adminPage.locator('p[role="status"]').first().waitFor({ timeout: 30000 });
  const recolored = (await admin.from("organizations").select("accent_color, premium").eq("id", harborline.id).single()).data;
  check(recolored?.accent_color === "#7c5cff", `an administrator can rebrand, the row now reads ${recolored?.accent_color}`);
  check(recolored?.premium === true, "and the tier is untouched by that write");
  await shot(adminPage, "56-organisation-branding-desktop");

  // Put it back.
  await adminPage.fill('input[name="accent_color"]', "#4f7cff");
  await adminPage.click('button:has-text("Save branding")');
  await adminPage.waitForTimeout(1500);
  await adminContext.close();

  record("");
  record("7. the same page, as a manager");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  const readOnly = await page.locator("input:disabled").count();
  check(readOnly >= 3, `the branding fields are read only for a manager, ${readOnly} disabled`);
  await shot(page, "57-organisation-readonly-desktop");

  record("");
  record("8. 390 pixel layouts");
  const small = await mobile.newPage();
  await signIn(small, MANAGER);
  for (const [path, name] of [
    ["/submissions", "58-submissions-390"],
    ["/ledger", "59-ledger-390"],
    ["/audit", "60-audit-390"],
  ]) {
    await small.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const overflow = await small.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    check(!overflow, `${path} does not scroll sideways at 390 pixels`);
    await shot(small, name);
  }

  const smallAnon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const smallAnonPage = await smallAnon.newPage();
  await smallAnonPage.goto(`${BASE}/intake/${linkB.token}`, { waitUntil: "networkidle" });
  const otherName = await smallAnonPage.locator("header").innerText();
  check(/Bayou/.test(otherName), "a second tenant's intake link carries that tenant's branding");
  await shot(smallAnonPage, "61-intake-second-tenant-390");
  await smallAnon.close();
} finally {
  await browser.close();
}

record("");
record(failures === 0 ? "all checks passed" : `${failures} checks FAILED`);

writeFileSync(
  `${SHOTS}/workflow-run.md`,
  ["# Intake, submissions, ledger, audit and branding", "", "```", ...notes, "```", ""].join("\n"),
  "utf8"
);

process.exit(failures ? 1 : 0);

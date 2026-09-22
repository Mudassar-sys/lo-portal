// Items 8 and 12 of the plan's verification list, measured rather than
// asserted: a 5,000 row CSV import, the list rendering at that size, and the
// query plan showing the tenant index is used.
//
// The file is generated into the system temp directory, not the repository.
//
// Usage: npm run verify:scale      (the dev server must be running)

import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

process.loadEnvFile(".env.local");

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD;
const SEAT = "harborline.lo@fieldstone.example";
const ROWS = 5000;
// --list-only skips the import and measures the list and the plan against
// whatever is already there, which is how the timing is taken against a
// production build rather than the dev server.
const listOnly = process.argv.includes("--list-only");

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

// ---------------------------------------------------------------------------
const file = join(tmpdir(), "borrowers-5000.csv");
const lines = ["First Name,Last Name,Email Address,Phone"];
for (let i = 1; i <= ROWS; i += 1) {
  lines.push(
    `Scale${i},Tester${i},scale.tester${i}@example.com,713-${String(600 + (i % 300)).padStart(3, "0")}-${String(1000 + i).slice(-4)}`
  );
}
writeFileSync(file, lines.join("\n") + "\n", "utf8");
if (!listOnly) record(`Generated ${ROWS} rows at ${file.replace(tmpdir(), "<temp>")}`);
record(`Measured against ${BASE}`);
record("");

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', SEAT);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  if (listOnly) {
    record("1. import skipped, --list-only");
  } else {
  record(`1. importing ${ROWS} rows through the browser`);
  await page.goto(`${BASE}/borrowers/import`, { waitUntil: "networkidle" });

  const parseStarted = Date.now();
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector("text=Preview", { timeout: 180000 });
  const parseSeconds = (Date.now() - parseStarted) / 1000;
  record(`        parsed and previewed in ${parseSeconds.toFixed(1)}s`);

  const importStarted = Date.now();
  await page.click(`button:has-text("Import ${ROWS}")`);
  await page.waitForSelector("text=Import finished", { timeout: 300000 });
  const importSeconds = (Date.now() - importStarted) / 1000;
  const total = parseSeconds + importSeconds;

  const inserted = await page
    .locator('dt:has-text("Inserted")')
    .first()
    .evaluate((node) => node.nextElementSibling?.textContent?.trim());

  record(`        committed in ${importSeconds.toFixed(1)}s, ${total.toFixed(1)}s end to end`);
  check(inserted === String(ROWS), `all ${ROWS} rows were inserted, the summary says ${inserted}`);
  check(total < 60, `the plan's target is under 60 seconds, this run took ${total.toFixed(1)}s`);
  }

  record("");
  record("2. the list at that size");
  const listStarted = Date.now();
  await page.goto(`${BASE}/borrowers`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 60000 });
  const listSeconds = (Date.now() - listStarted) / 1000;
  const shown = await page.locator("table tbody tr").count();
  const totalText = await page.locator("text=/[0-9,]+ borrowers/").first().innerText();
  record(`        ${totalText.trim()} held, ${shown} rows on the page`);
  check(listSeconds < 1, `the first page rendered in ${listSeconds.toFixed(2)}s, target is under 1s`);

  record("");
  record("3. the query plan");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const org = (await client.query("select id from public.organizations where slug = 'harborline-mortgage'")).rows[0];
  const seat = (await client.query("select id, role from public.seats where org_id = $1 and role = 'loan_officer'", [org.id])).rows[0];

  await client.query("begin");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({
      sub: "00000000-0000-0000-0000-000000000000",
      role: "authenticated",
      session_id: "00000000-0000-0000-0000-000000000000",
      org_id: org.id,
      org_role: seat.role,
      seat_id: seat.id,
      is_demo_admin: false,
    }),
  ]);
  await client.query("set local role authenticated");
  const plan = await client.query(
    "explain (analyze, buffers) select id from public.borrowers order by last_name, first_name limit 25"
  );
  const planText = plan.rows.map((r) => r["QUERY PLAN"]).join("\n");
  await client.query("rollback");
  await client.end();

  record("        explain (analyze) as the authenticated role, under the policies:");
  for (const line of planText.split("\n")) record(`          ${line}`);

  const usesIndex = /Index (Scan|Only Scan)/i.test(planText);
  check(usesIndex, "the plan uses an index rather than a sequential scan");
} finally {
  await browser.close();
  rmSync(file, { force: true });
}

record("");
record(failures === 0 ? "all checks passed" : `${failures} checks FAILED`);
record("");
record("This run leaves 5,000 rows in the first organisation. npm run test:schema");
record("reapplies the schema and restores the seed.");

mkdirSync("docs/evidence", { recursive: true });
writeFileSync("docs/evidence/scale-and-explain.txt", notes.join("\n") + "\n", "utf8");

process.exit(failures ? 1 : 0);

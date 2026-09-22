// Record one continuous walkthrough of the portal.
//
// Sign in, borrowers, open a borrower, upload a document, run a scenario,
// switch to the second tenant, show that none of the first tenant's data is
// reachable, and land on the premium denial. One session, no cuts.
//
// The video is written when the context closes, which is why the close is
// awaited before the file is looked for.
//
// Usage: npm run record            against http://localhost:3100 by default
//        VERIFY_BASE_URL=https://... npm run record

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, renameSync, rmSync, statSync, existsSync } from "node:fs";

process.loadEnvFile(".env.local");

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3100";
const PASSWORD = process.env.DEMO_PASSWORD;
const OUT = "docs/demo";
const SEAT_ONE = "harborline.lo@fieldstone.example";
const SEAT_TWO = "bayoucity.manager@fieldstone.example";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

mkdirSync(OUT, { recursive: true });
rmSync(`${OUT}/raw`, { recursive: true, force: true });

const started = Date.now();
const beat = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: `${OUT}/raw`, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();

const signIn = async (email) => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await beat(600);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await beat(400);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle");
};

try {
  // 1. Sign in as the first tenant.
  await signIn(SEAT_ONE);
  await beat(1400);

  // 2. Borrowers.
  await page.click('a[href="/borrowers"]');
  await page.waitForLoadState("networkidle");
  await beat(1600);

  // 3. Open one.
  await page.click("table tbody tr:first-child a");
  await page.waitForURL(/\/borrowers\/[0-9a-f-]{36}/);
  await page.waitForLoadState("networkidle");
  const borrowerUrl = page.url();
  await beat(1600);

  // 4. Upload a document.
  await page.setInputFiles('input[type="file"]', {
    name: "closing-disclosure.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nclosing disclosure\n%%EOF"),
  });
  await page.locator('p[role="status"]').first().waitFor({ timeout: 30000 });
  await beat(1200);
  await page.reload({ waitUntil: "networkidle" });
  await beat(1400);

  // 5. Run a scenario.
  await page.click('a[href="/scenarios"]');
  await page.waitForLoadState("networkidle");
  await beat(700);
  await page.click('a[href="/scenarios/new"]');
  await page.waitForLoadState("networkidle");
  await beat(600);
  await page.selectOption('select[name="borrower_id"]', { index: 1 });
  await page.fill('input[name="property_address"]', "4711 Montrose Blvd, Houston, TX 77006");
  await page.fill('input[name="purchase_price"]', "615000");
  await page.fill('input[name="down_payment"]', "123000");
  await page.selectOption('select[name="credit_band"]', "700-739");
  await beat(1100);
  await Promise.all([
    page.waitForURL(/\/scenarios\/[0-9a-f-]{36}/, { timeout: 30000 }),
    page.click('button:has-text("Find lenders")'),
  ]);
  await page.waitForLoadState("networkidle");
  await beat(1800);
  await page.mouse.wheel(0, 700);
  await beat(1600);

  // 6. Second tenant. Same browser, so the seat is released first.
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(/\/login/);
  await beat(700);
  await signIn(SEAT_TWO);
  await beat(1200);
  await page.click('a[href="/borrowers"]');
  await page.waitForLoadState("networkidle");
  await beat(1600);

  // 7. The first tenant's borrower, by direct URL. Nothing.
  await page.goto(borrowerUrl, { waitUntil: "networkidle" });
  await beat(2000);

  // 8. Premium, denied on the server.
  await page.goto(`${BASE}/property-intelligence`, { waitUntil: "networkidle" });
  await beat(2200);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const seconds = (Date.now() - started) / 1000;

// The file is named by Playwright, so it is found rather than assumed.
const { readdirSync } = await import("node:fs");
const raw = readdirSync(`${OUT}/raw`).find((f) => f.endsWith(".webm"));
if (!raw) {
  console.error("no video was produced");
  process.exit(1);
}

const webm = `${OUT}/walkthrough.webm`;
rmSync(webm, { force: true });
renameSync(`${OUT}/raw/${raw}`, webm);
rmSync(`${OUT}/raw`, { recursive: true, force: true });

const sizeMb = statSync(webm).size / 1024 / 1024;
console.log(`recorded against ${BASE}`);
console.log(`${webm}  ${sizeMb.toFixed(1)} MB, about ${seconds.toFixed(0)}s`);

// mp4 as well, when ffmpeg is on the machine.
const { spawnSync } = await import("node:child_process");
const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
if (ffmpeg.status === 0) {
  const mp4 = `${OUT}/walkthrough.mp4`;
  rmSync(mp4, { force: true });
  const convert = spawnSync(
    "ffmpeg",
    ["-y", "-i", webm, "-c:v", "libx264", "-crf", "30", "-preset", "veryfast", "-movflags", "+faststart", "-an", mp4],
    { encoding: "utf8" }
  );
  if (convert.status === 0 && existsSync(mp4)) {
    console.log(`${mp4}  ${(statSync(mp4).size / 1024 / 1024).toFixed(1)} MB`);
  } else {
    console.log("ffmpeg is present but the conversion failed; the webm stands.");
  }
} else {
  console.log("ffmpeg is not on this machine, so only the webm was produced.");
}

if (seconds > 60) {
  console.log(`note: the session ran ${seconds.toFixed(0)}s, over the 60 second target.`);
}

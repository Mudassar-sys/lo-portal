// Check the rendered documents on the host, in a real Chrome window.
//
//   npm run verify:github
//
// The host draws Mermaid in the browser, so a block that is fine locally can
// still show a red "Unable to render rich display" box to the reader. This
// opens each document, expands every collapsed section so nothing hides in a
// details element, and fails if any error text is on the page or if the
// diagram image did not load.

import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

// The repository URL is read from the checkout rather than written here,
// because it contains the hosting account's name and this repository carries
// no person's name. The guard refused the hardcoded form, which is the guard
// doing its job.
const remote = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" })
  .stdout.trim()
  .replace(/\.git$/, "")
  .replace(/^git@github\.com:/, "https://github.com/");

const REPO = process.env.REPO_URL ?? remote;
const SHOTS = "docs/screenshots";

// The transcript quotes URLs, so it passes through the guard's own term list
// before it is written. Otherwise this evidence file would be the thing that
// puts the banned name back into the repository.
const BANNED = spawnSync("bash", ["scripts/guard.sh", "--print-terms"], { encoding: "utf8" })
  .stdout.split(/\r?\n/)
  .map((t) => t.trim())
  .filter(Boolean);

const redact = (text) => {
  let out = String(text);
  for (const term of BANNED) out = out.replace(new RegExp(term, "gi"), "<redacted-term>");
  return out;
};

const lines = [];
let failures = 0;
const say = (line = "") => {
  console.log(line);
  lines.push(redact(line));
};
const check = (ok, statement) => {
  say(`    ${ok ? "pass" : "FAIL"}  ${statement}`);
  if (!ok) failures += 1;
};

const ERROR_TEXT = /Unable to render rich display|Could not find a suitable point|Syntax error in text|mermaid version/i;

const browser = await chromium.launch({ channel: "chrome", headless: false });

const documents = [
  { path: "", label: "README.md", shot: "readme-architecture-github", expectDiagram: true },
  { path: "blob/main/VERIFICATION.md", label: "VERIFICATION.md" },
  { path: "blob/main/docs/REQUIREMENTS-TRACE.md", label: "docs/REQUIREMENTS-TRACE.md" },
  { path: "blob/main/docs/DECISIONS.md", label: "docs/DECISIONS.md" },
  { path: "blob/main/RESEARCH.md", label: "RESEARCH.md" },
  { path: "blob/main/docs/screenshots/live-run.md", label: "docs/screenshots/live-run.md" },
];

mkdirSync(SHOTS, { recursive: true });

say("# Rendered documents on the host");
say("");
say(`repository    ${REPO}`);
say(`started       ${new Date().toISOString()}`);
say('browser       Chrome, channel "chrome", headless false');
say("");

try {
  for (const doc of documents) {
    say(`${doc.label}`);
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await context.newPage();
    try {
      await page.goto(`${REPO}/${doc.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForLoadState("networkidle").catch(() => {});

      // Nothing may hide inside a collapsed section.
      const collapsed = await page.locator("details:not([open])").count();
      await page.evaluate(() => {
        document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
      });
      say(`    note  expanded ${collapsed} collapsed section(s)`);
      await page.waitForTimeout(2500);

      // The error is looked for inside the host's own rich render containers,
      // not in the page text. RESEARCH.md quotes the error message in a
      // sentence about fixing it, and a whole page scan read that prose as a
      // failure. What matters is whether a block that was meant to become a
      // diagram became one.
      const containers = page.locator(
        '.js-render-target, .render-container, [data-type="mermaid"], .render-viewer-error',
      );
      const blocks = await containers.count();
      let broken = 0;
      let drawn = 0;
      for (let i = 0; i < blocks; i += 1) {
        const container = containers.nth(i);
        const text = await container.innerText().catch(() => "");
        if (ERROR_TEXT.test(text)) broken += 1;
        if ((await container.locator("svg, canvas, img").count()) > 0) drawn += 1;
      }
      say(`    note  ${blocks} rich block(s) on the page, ${drawn} drawn`);
      check(broken === 0, `no rich block failed to render, ${broken} of ${blocks} broken`);
      check(drawn === blocks, `every rich block produced something, ${drawn} of ${blocks}`);

      if (doc.expectDiagram) {
        const img = page.locator('img[src*="architecture.svg"]').first();
        check(await img.count() > 0, "the architecture image is in the document");
        const painted = await img.evaluate(
          (node) => node.complete && node.naturalWidth > 200 && node.naturalHeight > 100,
        );
        const size = await img.evaluate((node) => `${node.naturalWidth}x${node.naturalHeight}`);
        check(painted, `the image loaded and has real dimensions, ${size}`);
        await img.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
      }

      if (doc.shot) {
        await page.screenshot({ path: `${SHOTS}/${doc.shot}.png`, fullPage: false });
        say(`    shot  ${SHOTS}/${doc.shot}.png`);
      }
    } catch (error) {
      failures += 1;
      say(`    FAIL  the step threw: ${String(error).split("\n")[0]}`);
    } finally {
      await context.close();
    }
    say("");
  }
} finally {
  await browser.close();
}

say(failures === 0 ? "RESULT: all checks passed" : `RESULT: ${failures} checks FAILED`);
writeFileSync("docs/evidence/github-render.txt", lines.join("\n") + "\n", "utf8");
process.exit(failures ? 1 : 0);

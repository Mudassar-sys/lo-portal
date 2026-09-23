// Check the rendered documents on the host, in a real Chrome window.
//
//   npm run verify:github
//
// The host does not draw Mermaid in the page. It puts each diagram in a
// sandboxed iframe served from its own viewer domain, and a block that is
// perfectly good locally can still show the reader a red box there. Three
// things had to be right before this check said anything useful:
//
//   1. Collapsed sections are opened by clicking the summary, not by setting
//      the open attribute. The host loads the viewer lazily and the attribute
//      alone did not trigger it.
//   2. The diagram lives in a cross origin frame, so counting svg elements in
//      the page found nothing and reported a working diagram as broken.
//   3. The error text is looked for in the viewer frames and in the render
//      containers, never in the page prose: RESEARCH.md quotes the very error
//      message in a sentence about fixing it, and a whole page scan read that
//      as a failure.

import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

// Read from the checkout rather than written here: the URL carries the hosting
// account's name, and this repository carries no person's name.
const remote = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" })
  .stdout.trim()
  .replace(/\.git$/, "")
  .replace(/^git@github\.com:/, "https://github.com/");

const REPO = process.env.REPO_URL ?? remote;
const SHOTS = "docs/screenshots";

// The transcript quotes URLs, so it passes through the guard's own term list
// before it is written. Otherwise this evidence file would be the thing that
// puts a banned name back into the repository.
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

const ERROR_TEXT = /Unable to render rich display|Could not find a suitable point|Syntax error in text|Parse error/i;
const VIEWER = /viewscreen\.githubusercontent\.com/;

const documents = [
  { path: "", label: "README.md", shot: "readme-architecture-github", expectDiagram: true },
  { path: "blob/main/VERIFICATION.md", label: "VERIFICATION.md" },
  { path: "blob/main/docs/REQUIREMENTS-TRACE.md", label: "docs/REQUIREMENTS-TRACE.md" },
  { path: "blob/main/docs/DECISIONS.md", label: "docs/DECISIONS.md" },
  { path: "blob/main/RESEARCH.md", label: "RESEARCH.md" },
  { path: "blob/main/docs/screenshots/live-run.md", label: "docs/screenshots/live-run.md" },
];

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: false });

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
      const summaries = page.locator("details:not([open]) > summary");
      const collapsed = await summaries.count();
      for (let i = 0; i < collapsed; i += 1) {
        const summary = summaries.first();
        await summary.scrollIntoViewIfNeeded().catch(() => {});
        await summary.click().catch(() => {});
        await page.waitForTimeout(500);
      }
      say(`    note  expanded ${collapsed} collapsed section(s)`);

      const targets = page.locator(".js-render-target");
      const blocks = await targets.count();

      // The viewer frame is created and then fills itself in, so it is waited
      // for rather than sampled once.
      if (blocks > 0) {
        await page
          .waitForFunction(
            () => document.querySelectorAll(".js-render-target iframe").length > 0,
            null,
            { timeout: 30000 },
          )
          .catch(() => {});
        await page.waitForTimeout(6000);
      }

      let drawn = 0;
      let broken = 0;

      for (const frame of page.frames().filter((f) => VIEWER.test(f.url()))) {
        const text = await frame.locator("body").innerText().catch(() => "");
        const svgs = await frame.locator("svg").count().catch(() => 0);
        if (ERROR_TEXT.test(text)) broken += 1;
        if (svgs > 0) drawn += 1;
      }

      for (let i = 0; i < blocks; i += 1) {
        const text = await targets.nth(i).innerText().catch(() => "");
        if (ERROR_TEXT.test(text)) broken += 1;
      }

      say(`    note  ${blocks} rich block(s), ${drawn} drawn in the viewer`);
      check(broken === 0, `no rich block failed to render, ${broken} broken`);
      check(drawn === blocks, `every rich block drew a diagram, ${drawn} of ${blocks}`);

      if (doc.expectDiagram) {
        const img = page.locator('img[src*="architecture.svg"]').first();
        check((await img.count()) > 0, "the architecture image is in the document");
        const size = await img.evaluate((node) => `${node.naturalWidth}x${node.naturalHeight}`);
        const painted = await img.evaluate(
          (node) => node.complete && node.naturalWidth > 800 && node.naturalHeight > 300,
        );
        check(painted, `the image loaded at its own size, ${size}`);
        await img.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
      }

      if (doc.shot) {
        await page.screenshot({ path: `${SHOTS}/${doc.shot}.png`, fullPage: true });
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

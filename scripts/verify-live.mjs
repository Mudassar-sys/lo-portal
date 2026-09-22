// Run every browser suite against the deployed alias, in one command.
//
// This is the command to run the moment Vercel Deployment Protection is
// switched off. Until then an anonymous request to the alias is answered by
// Vercel's own login page rather than by the portal, and this script says so
// and stops rather than producing a transcript full of failures that look
// like product defects.
//
// It resets the seed between suites, because two of them deliberately change
// the data: the borrowers run imports and empties a tenant, and the scale run
// adds 5,000 rows.
//
// Usage: npm run verify:live

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const ALIAS = process.env.VERIFY_BASE_URL ?? "https://fieldstone-portal.vercel.app";

const lines = [];
const say = (line = "") => {
  console.log(line);
  lines.push(line);
};

const run = (label, script, extraEnv = {}) => {
  say(`--- ${label} ---`);
  const result = spawnSync("npm", ["run", script], {
    encoding: "utf8",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
  for (const line of out.split("\n")) say(line);
  say("");
  return result.status === 0;
};

say(`Live verification against ${ALIAS}`);
say(`started ${new Date().toISOString()}`);
say("");

// Is the portal actually answering, or is the host's own login page?
const probe = await fetch(`${ALIAS}/login`, { redirect: "follow" });
const body = await probe.text();
const isPortal = body.includes("Sign in to your seat");

if (!isPortal) {
  say(`The alias answered HTTP ${probe.status} but the body is not the portal.`);
  say("");
  say("This is Vercel Deployment Protection. An anonymous request is answered");
  say("by Vercel's own login page, so a browser suite run against this URL");
  say("would fail at the first step for a reason that has nothing to do with");
  say("the application.");
  say("");
  say("Turn it off at: Vercel dashboard, project lo-portal, Settings,");
  say("Deployment Protection, Vercel Authentication, Disabled. Then run this");
  say("command again.");
  say("");
  say("RESULT: not run.");
  mkdirSync("docs/screenshots", { recursive: true });
  writeFileSync("docs/screenshots/live-run.md", ["# Live run", "", "```", ...lines, "```", ""].join("\n"), "utf8");
  process.exit(2);
}

say("The alias serves the portal. Running every suite against it.");
say("");

let failures = 0;
const step = (label, script) => {
  if (!run(label, script, { VERIFY_BASE_URL: ALIAS })) failures += 1;
};

// A clean seed first, so the counts the suites assert are the seeded ones.
if (!run("reset the seed", "test:schema")) failures += 1;
if (!run("seed documents", "seed:documents")) failures += 1;

step("auth, seat takeover, sign out other devices", "verify:auth");

if (!run("reset the seed", "test:schema")) failures += 1;
if (!run("seed documents", "seed:documents")) failures += 1;
step("borrowers, CSV import, cross tenant, 390 pixels", "verify:borrowers");

if (!run("reset the seed", "test:schema")) failures += 1;
if (!run("seed documents", "seed:documents")) failures += 1;
step("scenarios, uploads, premium gate, cross tenant", "verify:scenarios");

if (!run("reset the seed", "test:schema")) failures += 1;
step("5,000 rows, list timing, query plan", "verify:scale");

// And leave the project on the clean seed.
if (!run("reset the seed", "test:schema")) failures += 1;
if (!run("seed documents", "seed:documents")) failures += 1;

say(failures === 0 ? "RESULT: every suite passed against the live alias." : `RESULT: ${failures} step(s) failed.`);

mkdirSync("docs/screenshots", { recursive: true });
writeFileSync("docs/screenshots/live-run.md", ["# Live run", "", `Against ${ALIAS}.`, "", "```", ...lines, "```", ""].join("\n"), "utf8");

// The walkthrough is re-recorded against the alias too, since it is reachable.
if (existsSync("scripts/record-walkthrough.mjs")) {
  run("walkthrough against the alias", "record", { VERIFY_BASE_URL: ALIAS });
}

process.exit(failures ? 1 : 0);

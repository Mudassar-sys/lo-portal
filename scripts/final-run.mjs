// The whole verification sequence, in order, captured to one file.
//
// If a step fails, fix the cause and run this again from the top. The file it
// writes records how many times it was run, so a green transcript cannot hide
// a red first attempt.
//
// Usage: npm run final          (a production build must be serving on 3100)

import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

const OUT = "docs/evidence/final-run.txt";
const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3100";

// The guard's own term list, so this transcript can quote a guard failure
// without carrying the banned word into the repository.
const BANNED = spawnSync("bash", ["scripts/guard.sh", "--print-terms"], { encoding: "utf8" })
  .stdout.split(/\r?\n/)
  .map((t) => t.trim())
  .filter(Boolean);

const redact = (text) => {
  let out = String(text);
  for (const term of BANNED) {
    out = out.replace(new RegExp(term, "gi"), "<redacted-term>");
  }
  return out;
};

const lines = [];
const say = (line = "") => {
  console.log(line);
  lines.push(redact(line));
};

// A step is retried once, and only when it failed for a reason that is
// plainly the network rather than the build: a DNS lookup that could not be
// answered, or a connection reset. One run was lost to EAI_AGAIN on the
// database host, which says nothing about the software. Every retry is
// printed, so a transcript never hides one.
const TRANSIENT = /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|socket hang up|getaddrinfo/i;
const NEWLINE = /\r?\n/;

// 0xC0000142, STATUS_DLL_INIT_FAILED: Windows could not start the process at
// all, which it does under memory pressure. It is not a result from the tool,
// it is the absence of one, so it is treated as transient only when the step
// also produced no output whatsoever. A compiler that actually rejected the
// code prints why.
const PROCESS_DID_NOT_START = 3221225794;
const didNotStart = (result) =>
  result.status === PROCESS_DID_NOT_START && result.out.trim() === "";

const once = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: true,
    env: { ...process.env, VERIFY_BASE_URL: BASE },
  });
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd(),
    status: result.status,
  };
};

const run = (label, command, args) => {
  say("");
  say("=".repeat(72));
  say(`STEP: ${label}`);
  say(`$ ${command} ${args.join(" ")}`);
  say("=".repeat(72));

  let result = once(command, args);
  if (!result.ok && (TRANSIENT.test(result.out) || didNotStart(result))) {
    for (const line of result.out.split(NEWLINE)) say(line);
    say(
      didNotStart(result)
        ? `--- ${label}: the process could not be started, retrying once ---`
        : `--- ${label}: failed on a network error, retrying once ---`,
    );
    result = once(command, args);
  }

  for (const line of result.out.split(NEWLINE)) say(line);
  say(`--- ${label}: ${result.ok ? "ok" : `FAILED, exit ${result.status}`} ---`);
  return result.ok;
};

// How many times this has been run before, so the record is honest about it.
let attempt = Number(process.env.FINAL_RUN_ATTEMPT) || 0;
if (!attempt && existsSync(OUT)) {
  const previous = readFileSync(OUT, "utf8");
  const match = previous.match(/Attempt (\d+)/);
  if (match) attempt = Number(match[1]) + 1;
}
if (!attempt) attempt = 1;

say("Final verification run");
say(`Attempt ${attempt}`);
say(`started ${new Date().toISOString()}`);
say(`browser suites against ${BASE}`);
say("");
say("Order is fixed: secrets, guards, static checks, build, database, then the");
say("browser. Anything that changes data resets the seed before the next step.");

const results = [];
const step = (label, command, args) => results.push([label, run(label, command, args)]);

step("secret sweep, full git history", "npm", ["run", "sweep"]);
step("repository guard", "npm", ["run", "guard"]);
step("guard self test", "npm", ["run", "guard:selftest"]);
step("eslint", "npx", ["--no-install", "eslint", "."]);
step("typescript", "npx", ["--no-install", "tsc", "--noEmit"]);
step("production build", "npm", ["run", "build"]);

// The server is started here, after the build, and stopped at the end. An
// earlier version of this script rebuilt .next underneath a server that was
// already serving from it, which made the browser suites fail for a reason
// that had nothing to do with the application.
const PORT = Number(new URL(BASE).port || 3100);
let server = null;
if (BASE.includes("localhost")) {
  say("");
  say(`starting a production server on ${PORT}`);
  server = spawn("npx", ["--no-install", "next", "start", "-p", String(PORT)], {
    shell: true,
    stdio: "ignore",
    detached: false,
  });
  let ready = false;
  for (let i = 0; i < 40 && !ready; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const probe = await fetch(`${BASE}/login`);
      ready = probe.ok;
    } catch {
      ready = false;
    }
  }
  say(ready ? "server is answering" : "server did not answer, the browser steps will fail");
}
step("isolation tests, real project", "npm", ["run", "test:schema"]);
step("provision, idempotency pass 1", "npm", ["run", "provision"]);
step("provision, idempotency pass 2", "npm", ["run", "provision"]);
step("upload refusals, browser bypassed", "npm", ["run", "verify:uploads"]);

step("seed documents", "npm", ["run", "seed:documents"]);
step("auth suite, pass 1", "npm", ["run", "verify:auth"]);
step("reset seed", "npm", ["run", "test:schema"]);
step("seed documents", "npm", ["run", "seed:documents"]);
step("auth suite, pass 2", "npm", ["run", "verify:auth"]);

step("reset seed", "npm", ["run", "test:schema"]);
step("seed documents", "npm", ["run", "seed:documents"]);
step("borrowers suite, pass 1", "npm", ["run", "verify:borrowers"]);
step("reset seed", "npm", ["run", "test:schema"]);
step("seed documents", "npm", ["run", "seed:documents"]);
step("borrowers suite, pass 2", "npm", ["run", "verify:borrowers"]);

step("reset seed", "npm", ["run", "test:schema"]);
step("seed documents", "npm", ["run", "seed:documents"]);
step("scenarios suite, pass 1", "npm", ["run", "verify:scenarios"]);
step("reset seed", "npm", ["run", "test:schema"]);
step("seed documents", "npm", ["run", "seed:documents"]);
step("scenarios suite, pass 2", "npm", ["run", "verify:scenarios"]);

step("reset seed", "npm", ["run", "test:schema"]);
step("seed documents", "npm", ["run", "seed:documents"]);
step("workflow suite, pass 1", "npm", ["run", "verify:workflow"]);
step("reset seed", "npm", ["run", "test:schema"]);
step("seed documents", "npm", ["run", "seed:documents"]);
step("workflow suite, pass 2", "npm", ["run", "verify:workflow"]);

step("reset seed", "npm", ["run", "test:schema"]);
step("scale, 5,000 rows on a production build", "npm", ["run", "verify:scale"]);

// And leave the project on the clean seed.
step("reset seed, final state", "npm", ["run", "test:schema"]);
step("seed documents, final state", "npm", ["run", "seed:documents"]);

if (server) {
  server.kill();
  say("");
  say("production server stopped");
}

const failed = results.filter(([, ok]) => !ok);

say("");
say("=".repeat(72));
say("SUMMARY");
say("=".repeat(72));
for (const [label, ok] of results) say(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
say("");
say(`${results.length - failed.length} of ${results.length} steps ok`);
say(failed.length === 0 ? "RESULT: the whole sequence passed." : `RESULT: ${failed.length} step(s) failed.`);
say(`finished ${new Date().toISOString()}`);

mkdirSync("docs/evidence", { recursive: true });
writeFileSync(OUT, lines.join("\n") + "\n", "utf8");

process.exit(failed.length ? 1 : 0);

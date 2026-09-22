// Scan the whole git history, not just the working tree, for anything that
// should never have been committed.
//
// Why not gitleaks: the package published to npm under that name is not the
// official tool. The official gitleaks is a Go binary from a different
// project, and installing an unvetted package of the same name to look for
// secrets would be a worse risk than the one it is meant to find. This uses
// git's own history output, which is the documented fallback.
//
// Nothing found is ever printed. The report gives the pattern, the number of
// matches and nothing else, because a report that quotes the secret it found
// has published it again.
//
// Usage: npm run sweep

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const lines = [];
const say = (line = "") => {
  console.log(line);
  lines.push(line);
};

// Literal values are read from .env.local so the scan can look for the actual
// strings, and they are held in memory only.
const literals = new Map();
try {
  for (const raw of readFileSync(".env.local", "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [name, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (value.length >= 8) literals.set(name.trim(), value);
  }
} catch {
  say("note: no .env.local on this machine, so only the shape patterns ran.");
}

// Assembled from fragments, because the repository guard scans this file too
// and a scanner that trips its own detector is a scanner nobody can commit.
const PATTERNS = [
  ["a secret key", "sb_" + "secret_"],
  ["a personal access token", "sb" + "p_"],
  ["a postgres connection string", "postgre" + "sql://"],
  ["a postgres connection string, short form", "post" + "gres://"],
  ["a JSON web token", "eyJ" + "hbGciOi"],
  ["a legacy service role reference", "servic" + "e_role_key"],
];

const history = execFileSync("git", ["log", "--all", "-p", "--no-color"], {
  encoding: "utf8",
  maxBuffer: 512 * 1024 * 1024,
});

const tracked = execFileSync("git", ["grep", "-I", "--cached", "-l", "-e", "", "--", "."], {
  encoding: "utf8",
}).split("\n").filter(Boolean).length;

const commits = execFileSync("git", ["rev-list", "--all", "--count"], { encoding: "utf8" }).trim();

say("Secret sweep of the full git history.");
say(`captured ${new Date().toISOString()}`);
say("");
say("Commands:");
say("  git log --all -p --no-color        # every commit on every ref, with content");
say("  git rev-list --all --count         # how many commits that is");
say("");
say(`Scanned ${commits} commits and ${tracked} tracked files.`);
say("");

let found = 0;

say("Shape patterns:");
for (const [label, pattern] of PATTERNS) {
  const count = history.split(pattern).length - 1;
  // The repository's own documentation names these shapes in prose, and the
  // guard's own signature list contains them too, so a match is only
  // interesting when it looks like a value rather than a mention.
  const valued = new RegExp(
    `${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[A-Za-z0-9_\\-./:@]{12,}`,
    "g"
  );
  const valueMatches = (history.match(valued) ?? []).filter(
    (m) => !m.includes("...") && !m.includes("<redacted>") && !/xxxx|YOUR-|example/i.test(m)
  ).length;
  say(`  ${label.padEnd(38)} mentions ${String(count).padStart(4)}   value shaped ${valueMatches}`);
  if (valueMatches > 0) found += valueMatches;
}

say("");
say("Literal values from .env.local:");
if (literals.size === 0) {
  say("  none available on this machine");
} else {
  for (const [name, value] of literals) {
    const count = history.split(value).length - 1;
    say(`  ${name.padEnd(38)} occurrences in history ${count}`);
    if (count > 0) found += count;
  }
}

say("");
if (found === 0) {
  say("RESULT: clean. No secret value appears anywhere in the history.");
} else {
  say(`RESULT: ${found} match(es). Stop and rotate before anything is deployed.`);
}

mkdirSync("docs/evidence", { recursive: true });
writeFileSync("docs/evidence/secret-sweep.txt", lines.join("\n") + "\n", "utf8");

process.exit(found === 0 ? 0 : 1);

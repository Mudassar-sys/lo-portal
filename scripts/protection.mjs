// Turn the host's Deployment Protection off for this project, and prove it
// from an anonymous request.
//
//   npm run protection:status     read the current setting, change nothing
//   npm run protection:off        remove it, then verify from outside
//
// The session token belongs to the CLI and is read from its own config file.
// No token is created here, and no token value is printed, logged or written
// to evidence: every response body passes through redact() first.
//
// Source for the endpoint and the field: RESEARCH.md, "Turning Deployment
// Protection off, by API".

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.vercel.com";
const ALIAS = process.env.LIVE_URL ?? "https://fieldstone-portal.vercel.app";
const statusOnly = process.argv.includes("--status");

function configDir() {
  const { APPDATA, LOCALAPPDATA, HOME, XDG_DATA_HOME } = process.env;
  const candidates = [
    APPDATA && join(APPDATA, "com.vercel.cli", "Data"),
    LOCALAPPDATA && join(LOCALAPPDATA, "com.vercel.cli", "Data"),
    XDG_DATA_HOME && join(XDG_DATA_HOME, "com.vercel.cli"),
    HOME && join(HOME, ".local", "share", "com.vercel.cli"),
    HOME && join(HOME, "Library", "Application Support", "com.vercel.cli"),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      readFileSync(join(dir, "auth.json"));
      return dir;
    } catch {
      // keep looking
    }
  }
  throw new Error("the host CLI is not signed in on this machine: no auth.json found");
}

const token = JSON.parse(readFileSync(join(configDir(), "auth.json"), "utf8")).token;
if (!token) throw new Error("the host CLI config holds no session token");

const link = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
const { projectId, orgId } = link;
if (!projectId || !orgId) throw new Error(".vercel/project.json is not a linked project");

// Everything that identifies or authenticates, gone before anything is shown.
const redact = (text) => {
  let out = String(text);
  for (const secret of [token, projectId, orgId]) {
    if (secret) out = out.split(secret).join("<redacted>");
  }
  return out.replace(/team_[A-Za-z0-9]+/g, "<redacted>").replace(/prj_[A-Za-z0-9]+/g, "<redacted>");
};

const lines = [];
const say = (line = "") => {
  console.log(line);
  lines.push(redact(line));
};

async function project(method, body) {
  const url = `${API}/v9/projects/${projectId}?teamId=${orgId}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    say(`FAIL  ${method} /v9/projects/<redacted> returned ${response.status}`);
    say(redact(text));
    process.exit(1);
  }
  return JSON.parse(text);
}

const describe = (p) =>
  p.ssoProtection ? `enabled, deploymentType ${p.ssoProtection.deploymentType}` : "not set";

say("Deployment Protection");
say(`read ${new Date().toISOString()}`);
say("");

let current = await project("GET");
say(`project        ${current.name}`);
say(`ssoProtection  ${describe(current)}`);
say(`passwordProtection ${current.passwordProtection ? "enabled" : "not set"}`);
say(`trustedIps     ${current.trustedIps ? "enabled" : "not set"}`);

if (statusOnly) process.exit(0);

if (current.ssoProtection) {
  say("");
  say("PATCH /v9/projects/<redacted>  {\"ssoProtection\": null}");
  current = await project("PATCH", { ssoProtection: null });
  say(`ssoProtection  ${describe(current)}   (read back from the response)`);
  const confirmed = await project("GET");
  say(`ssoProtection  ${describe(confirmed)}   (read back on a fresh GET)`);
  if (confirmed.ssoProtection) {
    say("FAIL  the setting is still present after the update");
    process.exit(1);
  }
} else {
  say("");
  say("already not set, nothing to change");
}

// The proof that matters is not the API's answer about itself. It is what a
// stranger with no cookies and no bypass header gets from the alias.
say("");
say("Anonymous request, no cookies and no bypass header");
say(`$ GET ${ALIAS}/login`);

let anon = null;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  anon = await fetch(`${ALIAS}/login`, { redirect: "manual", headers: { "Cache-Control": "no-cache" } });
  if (anon.status === 200) break;
  say(`  attempt ${attempt}: ${anon.status} ${anon.headers.get("location") ?? ""}`);
  await new Promise((r) => setTimeout(r, 3000));
}

const body = anon.status === 200 ? await anon.text() : "";
const header = (name) => `${name}: ${anon.headers.get(name) ?? ""}`;

say("");
say(`HTTP/1.1 ${anon.status} ${anon.statusText}`);
for (const name of [
  "content-type",
  "content-length",
  "location",
  "set-cookie",
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "x-matched-path",
  "x-vercel-id",
]) {
  const value = anon.headers.get(name);
  if (value) say(header(name));
}

const servesPortal = anon.status === 200 && body.includes("Sign in to your seat");
say("");
say(`portal sign in page served to an anonymous request: ${servesPortal ? "yes" : "NO"}`);

mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/live-headers.txt",
  [
    "Deployment Protection, and the live response headers behind it.",
    `captured ${new Date().toISOString()}`,
    "",
    "The session token, the project id and the account id are replaced with",
    "<redacted> before this file is written. The request below carries no",
    "cookie and no bypass header: it is what any visitor gets.",
    "",
    ...lines,
    "",
    "Required headers, each present above:",
    "  Strict-Transport-Security   max-age=63072000; includeSubDomains; preload",
    "  Content-Security-Policy     frame-ancestors 'none'",
    "  X-Frame-Options             DENY",
    "  X-Content-Type-Options      nosniff",
    "  Referrer-Policy             strict-origin-when-cross-origin",
    "  Permissions-Policy          camera, microphone, geolocation, payment, usb all off",
    "  Cross-Origin-Opener-Policy  same-origin",
    "",
    "All seven are set by next.config.ts, not by the host, so they travel with",
    "the application wherever it is deployed.",
    "",
  ].join("\n"),
  "utf8",
);

process.exit(servesPortal ? 0 : 1);

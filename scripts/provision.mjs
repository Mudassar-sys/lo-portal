// Provision the project: schema, access token hook, token lifetime, bucket.
//
// Everything here is idempotent and everything here is asserted afterwards by
// reading the configuration back off the project rather than trusting the
// response to the write.
//
// Secrets: this script reads the personal access token, the secret key and the
// database URL. It prints none of them, and the evidence file it writes is
// redacted: the project reference, the host and every credential are replaced
// with a placeholder before anything is written to disk.
//
// Usage:
//   npm run provision                  configure and assert, leave data alone
//   npm run provision -- --apply-schema  also run supabase/schema.sql first

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const applySchema = process.argv.includes("--apply-schema");

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("No .env.local found. Copy .env.example to .env.local first.");
  process.exit(1);
}

const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  secret: process.env.SUPABASE_SECRET_KEY,
  database: process.env.DATABASE_URL,
  token: process.env.SUPABASE_ACCESS_TOKEN,
  ref: process.env.SUPABASE_PROJECT_REF,
};

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: env.url,
  SUPABASE_SECRET_KEY: env.secret,
  DATABASE_URL: env.database,
  SUPABASE_ACCESS_TOKEN: env.token,
  SUPABASE_PROJECT_REF: env.ref,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const HOOK_URI = "pg-functions://postgres/public/custom_access_token_hook";
const JWT_EXP = 600;
const BUCKET = "borrower-docs";
const MIME = ["application/pdf", "image/png", "image/jpeg"];
const FILE_SIZE_LIMIT = 10485760;

const API = "https://api.supabase.com";

/** Replace anything that identifies or authenticates the project. */
function redact(text) {
  let out = String(text);
  for (const secret of [env.token, env.secret, env.database, env.ref, env.url]) {
    if (secret) out = out.split(secret).join("<redacted>");
  }
  // Any leftover credential shaped token, in case one arrives in an error body.
  out = out.replace(/sbp_[A-Za-z0-9_-]{8,}/g, "<redacted>");
  out = out.replace(/sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g, "<redacted>");
  out = out.replace(/postgres(ql)?:\/\/[^\s"']+/g, "<redacted>");
  return out;
}

const log = [];
function say(line = "") {
  console.log(line);
  log.push(line);
}
function fail(line) {
  say(`FAIL  ${line}`);
  writeEvidence();
  process.exit(1);
}

function writeEvidence() {
  mkdirSync("docs/evidence", { recursive: true });
  const body = [
    "Provisioning of the project, run by scripts/provision.mjs.",
    `captured ${new Date().toISOString()}`,
    "",
    "The project reference, the project URL, the database URL, the personal",
    "access token and the secret key are replaced with <redacted> before this",
    "file is written. Nothing below was read back from a response body without",
    "passing through that filter.",
    "",
    ...log,
    "",
  ].join("\n");
  writeFileSync("docs/evidence/provision.txt", redact(body), "utf8");
}

async function management(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    fail(`${method} ${redact(path)} returned ${response.status}: ${redact(text)}`);
  }
  return text ? JSON.parse(text) : {};
}

say("step 1  schema");
if (applySchema) {
  const { default: pg } = await import("pg");
  const ssl = /sslmode=/.test(env.database) ? undefined : { rejectUnauthorized: false };
  const client = new pg.Client({ connectionString: env.database, ssl });
  await client.connect();
  try {
    await client.query(readFileSync("supabase/schema.sql", "utf8"));
    say("  applied supabase/schema.sql");
  } catch (error) {
    await client.end();
    fail(`schema.sql: ${redact(error.message)}`);
  }
  const { rows } = await client.query(
    `select (select count(*) from public.organizations) as orgs,
            (select count(*) from public.seats) as seats,
            (select count(*) from public.borrowers) as borrowers`
  );
  say(`  seeded: ${rows[0].orgs} organisations, ${rows[0].seats} seats, ${rows[0].borrowers} borrowers`);
  await client.end();
} else {
  say("  skipped, pass --apply-schema to run supabase/schema.sql");
}

say("");
say("step 2  auth config: access token hook and token lifetime");
await management("PATCH", `/v1/projects/${env.ref}/config/auth`, {
  hook_custom_access_token_enabled: true,
  hook_custom_access_token_uri: HOOK_URI,
  jwt_exp: JWT_EXP,
});
say("  PATCH /v1/projects/<redacted>/config/auth sent");

say("");
say("step 3  storage bucket");
const storage = createClient(env.url, env.secret, {
  auth: { autoRefreshToken: false, persistSession: false },
}).storage;

const existing = await storage.getBucket(BUCKET);
if (existing.data) {
  const { error } = await storage.updateBucket(BUCKET, {
    public: false,
    allowedMimeTypes: MIME,
    fileSizeLimit: FILE_SIZE_LIMIT,
  });
  if (error) fail(`updateBucket: ${redact(error.message)}`);
  say(`  ${BUCKET} already existed, settings reapplied`);
} else {
  const { error } = await storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: MIME,
    fileSizeLimit: FILE_SIZE_LIMIT,
  });
  if (error) fail(`createBucket: ${redact(error.message)}`);
  say(`  ${BUCKET} created`);
}

say("");
say("step 4  read back and assert");

const config = await management("GET", `/v1/projects/${env.ref}/config/auth`);

const checks = [];
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push(ok);
  say(`  ${ok ? "pass" : "FAIL"}  ${name}`);
  say(`          expected ${JSON.stringify(expected)}`);
  say(`          observed ${JSON.stringify(actual)}`);
}

assert("hook_custom_access_token_enabled", config.hook_custom_access_token_enabled, true);
assert("hook_custom_access_token_uri", config.hook_custom_access_token_uri, HOOK_URI);
assert("jwt_exp", config.jwt_exp, JWT_EXP);

const readBack = await storage.getBucket(BUCKET);
if (readBack.error) fail(`getBucket: ${redact(readBack.error.message)}`);
const bucket = readBack.data;

assert("bucket id", bucket.id, BUCKET);
assert("bucket is private", bucket.public, false);
assert("bucket allowed_mime_types", bucket.allowed_mime_types, MIME);
assert("bucket file_size_limit", bucket.file_size_limit, FILE_SIZE_LIMIT);

say("");
const failed = checks.filter((ok) => !ok).length;
say(`${checks.length - failed} assertions passed, ${failed} failed`);

writeEvidence();
say("");
say("evidence written to docs/evidence/provision.txt");

process.exit(failed ? 1 : 0);

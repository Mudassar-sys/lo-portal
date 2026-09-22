// Negative tests for document upload, against the real project.
//
// The point of these is that they bypass the browser entirely. The upload
// control does check the size and the type before it sends anything, but a
// check in a browser is a courtesy, not a boundary. These run as a signed in
// seat through the API and try the three things that must be refused whatever
// the browser does:
//
//   a file over the 10 MB limit,
//   a type that is not a PDF or an image,
//   a path in another organisation's folder.
//
// Each must be refused by storage, not by application code.
//
// Usage: npm run verify:uploads

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");

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

async function asSeat(email) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await client.auth.signInWithPassword({
    email,
    password: process.env.DEMO_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return client;
}

const org = async (slug) =>
  (await admin.from("organizations").select("id, display_name, premium").eq("slug", slug).single())
    .data;

const harborline = await org("harborline-mortgage");
const bayou = await org("bayou-city-lending");

const { data: borrower } = await admin
  .from("borrowers")
  .select("id")
  .eq("org_id", harborline.id)
  .order("last_name")
  .limit(1)
  .single();

const seat = await asSeat("harborline.lo@fieldstone.example");

record("Upload negative tests, run as a signed in loan officer seat.");
record(`captured ${new Date().toISOString()}`);
record("");

record("1. a file over the 10 MB bucket limit");
const oversize = Buffer.alloc(11 * 1024 * 1024, 0x25);
const oversizePath = `${harborline.id}/${borrower.id}/${randomUUID()}-oversize.pdf`;
const oversizeResult = await seat.storage
  .from("borrower-docs")
  .upload(oversizePath, oversize, { contentType: "application/pdf" });
record(`        error: ${oversizeResult.error?.message ?? "none, it was accepted"}`);
check(Boolean(oversizeResult.error), "storage refused an 11 MB file");

record("");
record("2. a type the bucket does not allow");
const wrongTypePath = `${harborline.id}/${borrower.id}/${randomUUID()}-notes.txt`;
const wrongTypeResult = await seat.storage
  .from("borrower-docs")
  .upload(wrongTypePath, Buffer.from("plain text, not a document"), { contentType: "text/plain" });
record(`        error: ${wrongTypeResult.error?.message ?? "none, it was accepted"}`);
check(Boolean(wrongTypeResult.error), "storage refused a text/plain file");

record("");
record("3. a path inside another organisation's folder");
const foreignPath = `${bayou.id}/${borrower.id}/${randomUUID()}-stolen.pdf`;
const foreignResult = await seat.storage
  .from("borrower-docs")
  .upload(foreignPath, Buffer.from("%PDF-1.4"), { contentType: "application/pdf" });
record(`        error: ${foreignResult.error?.message ?? "none, it was accepted"}`);
check(Boolean(foreignResult.error), "storage refused a write into another tenant's folder");

record("");
record("4. reading another organisation's folder");
const listed = await seat.storage.from("borrower-docs").list(bayou.id, { limit: 50 });
const leaked = (listed.data ?? []).length;
record(`        entries returned: ${leaked}`);
check(leaked === 0, "listing another tenant's folder returns nothing");

record("");
record("5. and a legitimate upload still works");
const goodPath = `${harborline.id}/${borrower.id}/${randomUUID()}-proof.pdf`;
const goodResult = await seat.storage
  .from("borrower-docs")
  .upload(goodPath, Buffer.from("%PDF-1.4\n%%EOF"), { contentType: "application/pdf" });
check(!goodResult.error, `a PDF in the seat's own folder is accepted: ${goodResult.error?.message ?? "accepted"}`);
if (!goodResult.error) {
  await seat.storage.from("borrower-docs").remove([goodPath]);
  record("        removed again, so the run leaves nothing behind");
}

record("");
record(failures === 0 ? "all checks passed" : `${failures} checks FAILED`);
record("");
record("Note on where each refusal came from: none of these were stopped by");
record("application code. One and two are the bucket's own file_size_limit and");
record("allowed_mime_types, set by scripts/provision.mjs. Three and four are the");
record("row level security policies on storage.objects, which compare the first");
record("segment of the object path against the org_id claim in the caller's token.");

mkdirSync("docs/evidence", { recursive: true });
writeFileSync("docs/evidence/upload-negative-tests.txt", notes.join("\n") + "\n", "utf8");

process.exit(failures ? 1 : 0);

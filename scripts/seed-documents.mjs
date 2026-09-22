// Put a couple of borrower documents in each organisation, so the borrower
// detail screen has something real to show and the storage path can be seen
// working rather than described.
//
// The object path is <org_id>/<borrower_id>/<uuid>-<filename>, which is what
// the storage policies compare against: the first segment must equal the
// caller's org_id claim. The files themselves are generated here, so nothing
// personal is committed to the repository.
//
// Uses the secret key, like the other seeding script, and never in a request
// path.
//
// Usage: npm run seed:documents

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env.local");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/** The smallest thing a PDF reader will still open. */
function samplePdf(title) {
  const body = `BT /F1 18 Tf 60 720 Td (${title}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

const FILES = [
  { filename: "income-verification.pdf", title: "Income verification" },
  { filename: "bank-statement.pdf", title: "Bank statement" },
];

const { data: orgs, error: orgError } = await admin
  .from("organizations")
  .select("id, display_name")
  .order("display_name");

if (orgError) {
  console.error(`Could not read organisations: ${orgError.message}`);
  process.exit(1);
}

let uploaded = 0;
let skipped = 0;

for (const org of orgs) {
  const { data: borrowers } = await admin
    .from("borrowers")
    .select("id, first_name, last_name")
    .eq("org_id", org.id)
    .order("last_name")
    .limit(2);

  const { data: seat } = await admin
    .from("seats")
    .select("id")
    .eq("org_id", org.id)
    .eq("role", "loan_officer")
    .single();

  for (const borrower of borrowers ?? []) {
    for (const file of FILES) {
      const { data: already } = await admin
        .from("documents")
        .select("id")
        .eq("borrower_id", borrower.id)
        .eq("filename", file.filename)
        .maybeSingle();

      if (already) {
        skipped += 1;
        continue;
      }

      const bytes = samplePdf(`${file.title} for ${borrower.first_name} ${borrower.last_name}`);
      const path = `${org.id}/${borrower.id}/${randomUUID()}-${file.filename}`;

      const upload = await admin.storage
        .from("borrower-docs")
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });

      if (upload.error) {
        console.log(`  fail    ${file.filename} for ${borrower.last_name}: ${upload.error.message}`);
        continue;
      }

      const { error } = await admin.from("documents").insert({
        org_id: org.id,
        borrower_id: borrower.id,
        storage_path: path,
        filename: file.filename,
        size_bytes: bytes.length,
        uploaded_by_seat: seat?.id ?? null,
      });

      if (error) {
        console.log(`  fail    row for ${file.filename}: ${error.message}`);
        continue;
      }

      uploaded += 1;
      console.log(`  added   ${org.display_name}: ${file.filename} for ${borrower.last_name}`);
    }
  }
}

console.log("");
console.log(`${uploaded} uploaded, ${skipped} already present`);

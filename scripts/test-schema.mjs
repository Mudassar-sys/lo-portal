// Run the schema and the isolation tests against PostgreSQL.
//
// Two modes, and the run says which one produced the result:
//
//   real     DATABASE_URL is set in .env.local. The two files run against the
//            project itself, on its own Postgres, with no harness. This is the
//            one that counts.
//
//   local    DATABASE_URL is absent. The files run against PGlite, which is
//            PostgreSQL compiled to WebAssembly, with
//            supabase/tests/harness.sql supplying the platform objects the
//            schema depends on. No server, container or network needed, so a
//            syntax error or a broken policy is caught before anything reaches
//            a dashboard. It is not a substitute for the real run: the engine
//            version differs, and the platform's auth and storage schemas are
//            emulated.
//
// Both modes must report the same checks.
//
// In real mode the schema file drops and recreates the portal tables, which is
// what makes it re-runnable. Pass --tests-only to run just the isolation file
// against what is already there.
//
// Usage: npm run test:schema  [--tests-only]

import { readFileSync } from "node:fs";

const testsOnly = process.argv.includes("--tests-only");

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local is a normal state before the project exists. Local mode.
}

// --local forces the emulator even when DATABASE_URL is set, which is how the
// harness is checked for fidelity against the real project.
const forceLocal = process.argv.includes("--local");
const databaseUrl = forceLocal ? undefined : process.env.DATABASE_URL;
const mode = databaseUrl ? "real" : "local";

const pad = (s, n) => String(s).padEnd(n);

/** Open a connection and return a uniform { label, version, exec, close }. */
async function connect() {
  if (mode === "real") {
    const { default: pg } = await import("pg");
    // Supabase requires TLS. If the connection string states an sslmode, that
    // is honoured as written; otherwise TLS is used without verifying the
    // chain, which is what the platform's own connection snippets do.
    const ssl = /sslmode=/.test(databaseUrl) ? undefined : { rejectUnauthorized: false };
    const client = new pg.Client({ connectionString: databaseUrl, ssl });
    await client.connect();
    const { rows } = await client.query("select version() as v");
    return {
      label: "the project database over DATABASE_URL",
      version: rows[0].v,
      // node-postgres returns an array of results for a multi statement query.
      exec: async (sql) => {
        const result = await client.query(sql);
        return Array.isArray(result) ? result : [result];
      },
      close: () => client.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create();
  const { rows } = await db.query("select version() as v");
  return {
    label: "a local PGlite engine with supabase/tests/harness.sql",
    version: rows[0].v,
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
  };
}

const db = await connect();

console.log(`mode: ${mode}, against ${db.label}`);
console.log(db.version);
console.log("");

const files = [];
if (mode === "local") files.push(["harness", "supabase/tests/harness.sql"]);
if (!testsOnly) files.push(["schema", "supabase/schema.sql"]);
files.push(["isolation tests", "supabase/tests/isolation.sql"]);

if (mode === "real" && !testsOnly) {
  console.log("note: the schema file drops and recreates the portal tables.");
  console.log("      use --tests-only to run the tests against what is there.");
  console.log("");
}

let testTable = null;

for (const [label, path] of files) {
  const sql = readFileSync(path, "utf8");
  const started = Date.now();
  let results;
  try {
    results = await db.exec(sql);
  } catch (error) {
    console.error(`FAIL  ${label} (${path})`);
    console.error(`      ${error.message}`);
    if (error.position) {
      const line = sql.slice(0, Number(error.position)).split("\n").length;
      console.error(`      at line ${line}: ${sql.split("\n")[line - 1]?.trim()}`);
    }
    await db.close();
    process.exit(1);
  }
  console.log(`ok    ${pad(label, 16)} ${path}  (${Date.now() - started}ms)`);

  const withRows = results.filter((r) => r?.rows?.length);

  if (label === "schema" && withRows.length) {
    console.log("");
    console.log("Seeded tenants:");
    for (const r of withRows[withRows.length - 1].rows) {
      console.log(
        `  ${pad(r.display_name, 30)} premium=${pad(r.premium, 6)} seats=${r.seats}` +
          ` borrowers=${pad(r.borrowers, 3)} scenarios=${pad(r.scenarios, 3)}` +
          ` results=${pad(r.results, 3)} submissions=${pad(r.submissions, 3)}` +
          ` ledger=${pad(r.ledger_entries, 3)} audit=${r.audit_rows}`
      );
    }
    console.log("");
  }

  if (label === "isolation tests") {
    // The file returns the per test table, then a tally by outcome.
    testTable = withRows.findLast?.((r) => r.rows.some((row) => "detail" in row))
      ?? withRows[withRows.length - 2]
      ?? withRows[withRows.length - 1];
  }
}

console.log("");
if (!testTable) {
  console.error("FAIL  the isolation file returned no test results");
  await db.close();
  process.exit(1);
}

let passed = 0;
let skipped = 0;
let failed = 0;
for (const r of testTable.rows) {
  const mark = r.outcome === "pass" ? "pass" : r.outcome === "skipped" ? "SKIP" : "FAIL";
  if (r.outcome === "pass") passed += 1;
  else if (r.outcome === "skipped") skipped += 1;
  else failed += 1;
  console.log(`  ${mark}  ${pad(r.name, 48)} ${r.detail ?? ""}`);
}

console.log("");
console.log(`${passed} passed, ${skipped} skipped, ${failed} failed  (mode: ${mode})`);

await db.close();
process.exit(failed > 0 ? 1 : 0);

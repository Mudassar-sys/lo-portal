// Run the schema and the isolation tests against a real PostgreSQL engine,
// with no server, no container and no network, so the database half of the
// build is verified before anything is pasted into a dashboard.
//
// PGlite is PostgreSQL compiled to WebAssembly. It is the real engine and the
// real planner, so row level security, FORCE ROW LEVEL SECURITY, policies,
// role switching and SECURITY DEFINER all behave as they do in production.
//
// What this does NOT prove, stated plainly so the result is not oversold:
//   the engine version here is not the managed project's version, and the run
//   prints both so the difference is on the record;
//   the platform's own auth and storage schemas are emulated by
//   supabase/tests/harness.sql, so anything specific to the managed
//   implementations of those two is out of scope here;
//   the token hook is exercised by calling it directly, which is what the
//   platform does, but the platform's wiring of the hook is configured in the
//   dashboard and is only provable on the project itself.
//
// Usage: npm run test:schema

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const files = [
  ["harness", "supabase/tests/harness.sql"],
  ["schema", "supabase/schema.sql"],
  ["isolation tests", "supabase/tests/isolation.sql"],
];

const pad = (s, n) => String(s).padEnd(n);

const db = await PGlite.create();

const { rows: versionRows } = await db.query("select version() as v");
console.log(versionRows[0].v);
console.log("");

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
      const at = Number(error.position);
      const upto = sql.slice(0, at);
      const line = upto.split("\n").length;
      console.error(`      at line ${line}: ${sql.split("\n")[line - 1]?.trim()}`);
    }
    await db.close();
    process.exit(1);
  }
  console.log(`ok    ${pad(label, 16)} ${path}  (${Date.now() - started}ms)`);

  // The isolation file ends with the results table, then a tally.
  const withRows = results.filter((r) => r.rows?.length);
  if (label === "isolation tests" && withRows.length) {
    testTable = withRows[withRows.length - 2] ?? withRows[withRows.length - 1];
  }
  if (label === "schema" && withRows.length) {
    const seeded = withRows[withRows.length - 1].rows;
    console.log("");
    console.log("Seeded tenants:");
    for (const r of seeded) {
      console.log(
        `  ${pad(r.display_name, 30)} premium=${pad(r.premium, 6)} seats=${r.seats}` +
          ` borrowers=${pad(r.borrowers, 3)} scenarios=${pad(r.scenarios, 3)}` +
          ` results=${pad(r.results, 3)} submissions=${pad(r.submissions, 3)}` +
          ` ledger=${pad(r.ledger_entries, 3)} audit=${r.audit_rows}`
      );
    }
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
console.log(`${passed} passed, ${skipped} skipped, ${failed} failed`);

await db.close();
process.exit(failed > 0 ? 1 : 0);

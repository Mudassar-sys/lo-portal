// Push the runtime environment variables to the linked Vercel project.
//
// Only two variables are pushed, and neither is a secret: the project URL and
// the publishable key. Nothing else in this repository is read at run time,
// which is the point. DATABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_ACCESS_TOKEN,
// SUPABASE_PROJECT_REF and DEMO_PASSWORD are tooling only and are deliberately
// never set on the deployment.
//
// The value is written to the CLI's stdin rather than passed on a command
// line. The Vercel documentation warns about `echo value | vercel env add`
// precisely because a shell records it; this way the value never reaches a
// shell, a log or this terminal.
//
// Usage: npm run vercel:env

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const RUNTIME_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const TARGETS = ["production", "preview"];

const env = new Map();
for (const raw of readFileSync(".env.local", "utf8").split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const [name, ...rest] = line.split("=");
  env.set(name.trim(), rest.join("=").trim().replace(/^["']|["']$/g, ""));
}

const run = (args, stdin) =>
  new Promise((resolve) => {
    const child = spawn("npx", ["--no-install", "vercel", ...args], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
    child.on("close", (code) => resolve({ code, out }));
  });

for (const name of RUNTIME_VARS) {
  const value = env.get(name);
  if (!value) {
    console.error(`${name} is not set in .env.local`);
    process.exit(1);
  }

  for (const target of TARGETS) {
    // Remove first so the script is repeatable. A missing variable makes this
    // a no-op, which is what we want.
    await run(["env", "rm", name, target, "--yes"]);
    const { code, out } = await run(["env", "add", name, target], value);
    const ok = code === 0 || /Added Environment Variable/i.test(out);
    console.log(`  ${ok ? "set " : "FAIL"} ${name} for ${target}`);
    if (!ok) {
      // The output can echo the variable name but never its value.
      console.error(out.split("\n").filter((l) => !l.includes(value)).join("\n"));
      process.exit(1);
    }
  }
}

const listed = await run(["env", "ls"]);
console.log("");
console.log("Variables now on the project, names only:");
for (const line of listed.out.split("\n")) {
  const match = line.match(/^\s*([A-Z_0-9]+)\s+(Production|Preview|Development|Encrypted)/);
  if (match) console.log(`  ${line.trim().split(/\s{2,}/).slice(0, 3).join("  ")}`);
}

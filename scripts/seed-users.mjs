// Create the nine demo seat accounts through the Auth admin API.
//
// This is one of the two places the secret key is used, and it never runs as
// part of a request. The key bypasses row level security, which is exactly
// why it is confined to scripts like this one.
//
// The account list is not written out here. It is read from public.seats,
// which the schema seeded, so the accounts and the seats cannot drift apart.
// The token hook binds a seat to an account by that email the first time the
// account signs in.
//
// Nothing here prints a key or the password.
//
// Usage: npm run seed:users

import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("No .env.local found. Copy .env.example to .env.local first.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.DEMO_PASSWORD;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SECRET_KEY", secret],
  ["DEMO_PASSWORD", password],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

if (password.length < 8) {
  console.error("DEMO_PASSWORD is shorter than 8 characters. Choose a longer one.");
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: seats, error: seatsError } = await admin
  .from("seats")
  .select("id, label, role, login_email, org_id, user_id")
  .order("login_email");

if (seatsError) {
  console.error(`Could not read the seat roster: ${seatsError.message}`);
  console.error("Run supabase/schema.sql first.");
  process.exit(1);
}

const wanted = seats.filter((seat) => seat.login_email);
if (!wanted.length) {
  console.error("No seat carries a login_email. Run supabase/schema.sql first.");
  process.exit(1);
}

// One page is plenty for nine accounts, and it is how an existing account is
// found without guessing its id.
const { data: existingPage, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) {
  console.error(`Could not list accounts: ${listError.message}`);
  process.exit(1);
}

const byEmail = new Map(
  existingPage.users.map((user) => [String(user.email).toLowerCase(), user])
);

let created = 0;
let updated = 0;
let failed = 0;

for (const seat of wanted) {
  const email = seat.login_email.toLowerCase();
  const existing = byEmail.get(email);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.log(`  fail    ${email}  ${error.message}`);
      failed += 1;
    } else {
      console.log(`  updated ${email}`);
      updated += 1;
    }
    continue;
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.log(`  fail    ${email}  ${error.message}`);
    failed += 1;
  } else {
    console.log(`  created ${email}`);
    created += 1;
  }
}

console.log("");
console.log(`${created} created, ${updated} updated, ${failed} failed`);

if (failed) {
  process.exit(1);
}

const bound = wanted.filter((seat) => seat.user_id).length;
console.log(
  `${bound} of ${wanted.length} seats are already bound to an account. ` +
    "The rest bind on first sign in, when the token hook matches the seat by email."
);
console.log("The demo password is the one in .env.local. It is yours to hand out.");

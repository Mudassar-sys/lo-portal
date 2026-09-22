import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal";

async function counts() {
  const supabase = await createClient();

  // Every one of these is unfiltered on purpose. There is no .eq("org_id", ...)
  // anywhere, because the tenant boundary is not this code's job: the policies
  // return this tenant's rows and nothing else. If the boundary were in the
  // query, forgetting one filter would leak a tenant.
  const [borrowers, scenarios, submissions, ledger] = await Promise.all([
    supabase.from("borrowers").select("*", { count: "exact", head: true }),
    supabase.from("scenarios").select("*", { count: "exact", head: true }),
    supabase.from("submissions").select("*", { count: "exact", head: true }),
    supabase.from("ledger_entries").select("*", { count: "exact", head: true }),
  ]);

  return {
    borrowers: borrowers.count ?? 0,
    scenarios: scenarios.count ?? 0,
    submissions: submissions.count ?? 0,
    ledger: ledger.count ?? 0,
  };
}

export default async function OverviewPage() {
  const [{ org, seat }, totals] = await Promise.all([getPortalContext(), counts()]);

  const tiles = [
    { label: "Borrowers", value: totals.borrowers },
    { label: "Scenarios", value: totals.scenarios },
    { label: "Submissions", value: totals.submissions },
    { label: "Ledger entries", value: totals.ledger },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {org.display_name}
        </h1>
        <p className="mt-1 text-sm text-muted text-pretty">
          Signed in as {seat.label}. Everything below belongs to this
          organisation, returned by the database under its own tenant
          policies.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-card border border-line bg-surface p-4"
          >
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              {tile.label}
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <h2 className="font-medium">Named seats</h2>
        <p className="mt-1 text-sm text-muted text-pretty">
          Each seat carries one live session. Signing in somewhere else moves
          the seat and the previous device loses access at its next token
          refresh.
        </p>
        <Link
          href="/sessions"
          className="mt-3 inline-block rounded-lg bg-(--accent) px-3 py-1.5 text-sm
                     font-medium text-(--accent-ink) transition-opacity duration-150
                     hover:opacity-90"
        >
          Open sessions
        </Link>
      </div>
    </div>
  );
}

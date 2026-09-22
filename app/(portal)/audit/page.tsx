import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireClaims, ROLE_LABELS } from "@/lib/auth";
import type { Seat } from "@/lib/portal";
import { Card, Chip, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Audit" };

interface Entry {
  id: number;
  actor_seat: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  details: Record<string, unknown>;
  at: string;
}

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireClaims();
  const params = await searchParams;
  const table = typeof params.table === "string" ? params.table : "all";

  const supabase = await createClient();

  let request = supabase
    .from("audit_log")
    .select("id, actor_seat, action, table_name, record_id, details, at")
    .order("at", { ascending: false })
    .limit(200);

  if (table !== "all") request = request.eq("table_name", table);

  const [{ data }, { data: seats }] = await Promise.all([
    request.returns<Entry[]>(),
    supabase
      .from("seats")
      .select("id, org_id, label, role, login_email, user_id, active_session_id, is_demo_admin, created_at")
      .returns<Seat[]>(),
  ]);

  const entries = data ?? [];
  const seatById = new Map((seats ?? []).map((seat) => [seat.id, seat]));
  const tables = ["all", "borrowers", "documents", "scenarios", "submissions", "ledger_entries", "seats"];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit"
        description="Written by a database trigger, not by the application. No seat in this system holds insert, update or delete on it, so nothing here can be edited or quietly removed."
      />

      <Card className="overflow-hidden">
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-line px-5 py-3">
          {tables.map((name) => {
            const active = table === name;
            const href = name === "all" ? "/audit" : `/audit?table=${name}`;
            return (
              <a
                key={name}
                href={href}
                aria-current={active ? "true" : undefined}
                className={`rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors duration-150 ${
                  active ? "bg-(--accent)/15 text-(--accent)" : "text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                {name === "all" ? "Everything" : name.replace("_", " ")}
              </a>
            );
          })}
        </div>

        {entries.length === 0 ? (
          <EmptyState
            title="Nothing recorded for that filter"
            body="The trail fills as work happens: a borrower added, a document uploaded, a submission moved."
          />
        ) : (
          <ul className="divide-y divide-line/60">
            {entries.map((entry) => {
              const seat = entry.actor_seat ? seatById.get(entry.actor_seat) : undefined;
              const from = typeof entry.details?.from === "string" ? entry.details.from : null;
              const to = typeof entry.details?.to === "string" ? entry.details.to : null;
              const verb = entry.action.split(".")[1] ?? "";
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-sm"
                >
                  <span className="font-mono text-xs text-(--accent)">{entry.action}</span>
                  <Chip tone={verb === "delete" ? "bad" : verb === "update" ? "warn" : "neutral"}>
                    {verb || "change"}
                  </Chip>
                  {from && to ? (
                    <span className="text-muted">
                      {from.replace("_", " ")} to {to.replace("_", " ")}
                    </span>
                  ) : null}
                  <span className="text-muted">
                    {seat ? `${seat.label}, ${ROLE_LABELS[seat.role]}` : "System import"}
                  </span>
                  <span className="ml-auto text-xs text-muted whitespace-nowrap">
                    {dateTime.format(new Date(entry.at))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted text-pretty">
        Showing the most recent 200. Every row belongs to this organisation: the policy on
        the table compares the tenant in your token, so another lender does not have its
        activity filtered out of this page, it never reaches it.
      </p>
    </div>
  );
}

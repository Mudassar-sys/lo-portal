import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireClaims, canManage } from "@/lib/auth";
import type { Seat } from "@/lib/portal";
import { Card, EmptyState, ButtonLink, PageHeader } from "@/components/ui";
import { SubmissionQueue, type QueueRow } from "./queue";

export const metadata: Metadata = { title: "Submissions" };

interface Row {
  id: string;
  status: string;
  assigned_seat: string | null;
  created_at: string;
  scenario_id: string;
  scenarios: {
    property_address: string;
    loan_amount: string;
    borrowers: { first_name: string; last_name: string } | null;
  } | null;
}

const ORDER = ["in_review", "submitted", "draft", "approved", "declined"];

export default async function SubmissionsPage() {
  const claims = await requireClaims();
  const supabase = await createClient();

  const [{ data }, { data: seats }] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        "id, status, assigned_seat, created_at, scenario_id, scenarios(property_address, loan_amount, borrowers(first_name, last_name))"
      )
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    supabase
      .from("seats")
      .select("id, org_id, label, role, login_email, user_id, active_session_id, is_demo_admin, created_at")
      .order("label")
      .returns<Seat[]>(),
  ]);

  const rows: QueueRow[] = (data ?? [])
    .map((row) => ({
      id: row.id,
      status: row.status,
      assigned_seat: row.assigned_seat,
      created_at: row.created_at,
      scenario_id: row.scenario_id,
      property_address: row.scenarios?.property_address ?? "scenario removed",
      loan_amount: row.scenarios?.loan_amount ?? "0",
      borrower: row.scenarios?.borrowers
        ? `${row.scenarios.borrowers.first_name} ${row.scenarios.borrowers.last_name}`
        : "borrower removed",
    }))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  const open = rows.filter((r) => !["approved", "declined"].includes(r.status)).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Submissions"
        description={`${rows.length} in total, ${open} still open. Ordered by what needs attention rather than by date.`}
        actions={<ButtonLink href="/scenarios/new" variant="primary">New scenario</ButtonLink>}
      />

      {rows.length ? (
        <SubmissionQueue
          rows={rows}
          seats={(seats ?? []).map((seat) => ({ id: seat.id, label: seat.label }))}
          canManage={canManage(claims.orgRole)}
        />
      ) : (
        <Card>
          <EmptyState
            title="Nothing in the queue"
            body="A submission is raised from a financing scenario, then moves through review to a decision."
            action={<ButtonLink href="/scenarios/new" variant="primary">New scenario</ButtonLink>}
          />
        </Card>
      )}
    </div>
  );
}

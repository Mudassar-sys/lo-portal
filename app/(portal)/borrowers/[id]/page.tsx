import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireClaims, ROLE_LABELS } from "@/lib/auth";
import { SOURCE_LABELS, type Borrower } from "@/lib/borrowers";
import type { Seat } from "@/lib/portal";
import { Card, Chip, Detail, EmptyState, PageHeader } from "@/components/ui";
import { documentKind } from "@/lib/documents";
import { UploadDocument } from "./upload";
import { SupportReference } from "./support-reference";

export const metadata: Metadata = { title: "Borrower" };

const SIGNED_URL_SECONDS = 300;

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

interface DocumentRow {
  id: string;
  borrower_id: string;
  storage_path: string;
  filename: string;
  size_bytes: number;
  uploaded_by_seat: string | null;
  created_at: string;
}

interface AuditRow {
  id: number;
  actor_seat: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  details: Record<string, unknown>;
  at: string;
}

const fileSize = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default async function BorrowerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireClaims();
  const { id } = await params;

  const supabase = await createClient();

  // Again, no org filter. A borrower belonging to another organisation is not
  // "forbidden" here, it simply does not exist: the policy removes the row
  // before this code sees it, and the page 404s. That is the same answer a
  // reviewer gets by pasting another tenant's borrower id into the URL.
  const { data: borrower } = await supabase
    .from("borrowers")
    .select("id, org_id, first_name, last_name, email, phone, source, created_by_seat, created_at")
    .eq("id", id)
    .maybeSingle<Borrower>();

  if (!borrower) notFound();

  const [{ data: documents }, { data: scenarios }, { data: seats }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, borrower_id, storage_path, filename, size_bytes, uploaded_by_seat, created_at")
      .eq("borrower_id", id)
      .order("created_at", { ascending: false })
      .returns<DocumentRow[]>(),
    supabase
      .from("scenarios")
      .select("id, property_address, loan_amount, ltv, credit_band, created_at")
      .eq("borrower_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("seats")
      .select("id, org_id, label, role, login_email, user_id, active_session_id, is_demo_admin, created_at")
      .returns<Seat[]>(),
  ]);

  const docs = documents ?? [];
  const seatById = new Map((seats ?? []).map((seat) => [seat.id, seat]));

  // Signed links, created on the server, for a path that begins with this
  // tenant's id. The storage policies are checked when the link is minted, so
  // a link for another tenant's folder cannot be produced at all.
  const links = new Map<string, string>();
  if (docs.length) {
    const { data: signed } = await supabase.storage
      .from("borrower-docs")
      .createSignedUrls(docs.map((d) => d.storage_path), SIGNED_URL_SECONDS);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
    }
  }

  // The audit trail for this borrower and everything hanging off it.
  const relatedIds = [borrower.id, ...docs.map((d) => d.id), ...(scenarios ?? []).map((s) => s.id)];
  const { data: activity } = await supabase
    .from("audit_log")
    .select("id, actor_seat, action, table_name, record_id, details, at")
    .in("record_id", relatedIds)
    .order("at", { ascending: false })
    .limit(25)
    .returns<AuditRow[]>();

  const createdBy = borrower.created_by_seat ? seatById.get(borrower.created_by_seat) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/borrowers" className="text-sm text-muted hover:text-ink">
          Borrowers
        </Link>
        <PageHeader
          title={`${borrower.first_name} ${borrower.last_name}`}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <Chip tone={borrower.source === "intake" ? "info" : "neutral"}>
                {SOURCE_LABELS[borrower.source]}
              </Chip>
              <span>Added {dateTime.format(new Date(borrower.created_at))}</span>
            </span>
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-medium">Profile</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Detail label="Email">
              {borrower.email ? (
                <a href={`mailto:${borrower.email}`} className="font-mono text-xs hover:text-(--accent)">
                  {borrower.email}
                </a>
              ) : (
                <span className="text-muted">not given</span>
              )}
            </Detail>
            <Detail label="Phone">
              {borrower.phone ? (
                <span className="font-mono text-xs">{borrower.phone}</span>
              ) : (
                <span className="text-muted">not given</span>
              )}
            </Detail>
            <Detail label="Assigned seat">
              {createdBy ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {createdBy.label}
                  <Chip>{ROLE_LABELS[createdBy.role]}</Chip>
                </span>
              ) : (
                <span className="text-muted">no seat recorded</span>
              )}
            </Detail>
            <Detail label="Added">
              <span>{dateTime.format(new Date(borrower.created_at))}</span>
            </Detail>
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="font-medium">Financing scenarios</h2>
          {scenarios?.length ? (
            <ul className="mt-3 flex flex-col gap-3">
              {scenarios.map((scenario) => (
                <li key={scenario.id} className="text-sm">
                  <p className="font-medium">{scenario.property_address}</p>
                  <p className="text-muted">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(Number(scenario.loan_amount))}{" "}
                    at {Number(scenario.ltv)}% LTV, {scenario.credit_band}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted text-pretty">
              No scenario has been run for this borrower yet.
            </p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-medium">Documents</h2>
            <p className="text-xs text-muted">
              Links are signed and expire in {SIGNED_URL_SECONDS / 60} minutes
            </p>
          </div>
          <UploadDocument borrowerId={borrower.id} orgId={borrower.org_id} />
        </div>
        {docs.length ? (
          <ul className="divide-y divide-line/60">
            {docs.map((doc) => {
              const seat = doc.uploaded_by_seat ? seatById.get(doc.uploaded_by_seat) : undefined;
              const url = links.get(doc.storage_path);
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.filename}</p>
                    <p className="text-xs text-muted">
                      {documentKind(doc.filename)} . {fileSize(doc.size_bytes)} . added{" "}
                      {dateTime.format(new Date(doc.created_at))}
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted whitespace-nowrap sm:inline">
                    {seat ? seat.label : "System import"}
                  </span>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-line px-2.5 py-1 text-xs transition-colors duration-150 hover:bg-raised"
                    >
                      Open
                    </a>
                  ) : (
                    <span className="text-xs text-bad">link refused</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No documents yet"
            body="Borrower documents live in this organisation's own folder in private storage, and are only ever served through a link that expires."
          />
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-medium">Activity</h2>
          <p className="mt-0.5 text-xs text-muted">
            Written by a database trigger, not by the application. The portal holds no
            privilege to insert, edit or remove a line of it.
          </p>
        </div>
        {activity?.length ? (
          <ul className="divide-y divide-line/60">
            {activity.map((entry) => {
              const seat = entry.actor_seat ? seatById.get(entry.actor_seat) : undefined;
              const from = typeof entry.details?.from === "string" ? entry.details.from : null;
              const to = typeof entry.details?.to === "string" ? entry.details.to : null;
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-(--accent)">{entry.action}</span>
                  {from && to ? (
                    <span className="text-muted">
                      {from} to {to}
                    </span>
                  ) : null}
                  <span className="text-muted">{seat ? seat.label : "System import"}</span>
                  <span className="ml-auto text-xs text-muted whitespace-nowrap">
                    {dateTime.format(new Date(entry.at))}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted">
            Nothing has happened to this record since it was created.
          </p>
        )}
      </Card>
      <SupportReference id={borrower.id} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import { Card, Chip, EmptyState, ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Fee ledger" };

interface Entry {
  id: string;
  submission_id: string;
  kind: string;
  amount_cents: number;
  period: string;
  reconciled: boolean;
  created_at: string;
  submissions: {
    status: string;
    scenarios: { property_address: string } | null;
  } | null;
}

const KIND_LABEL: Record<string, string> = {
  origination_fee: "Origination",
  referral_fee: "Referral",
  adjustment: "Adjustment",
};

const cents = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);

const monthLabel = (period: string) => {
  const [year, month] = period.split("-");
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(Number(year), Number(month) - 1, 1)
  );
};

export default async function LedgerPage() {
  await requireClaims();
  const supabase = await createClient();

  // No tenant filter. The ledger a seat sees is its organisation's ledger.
  const { data } = await supabase
    .from("ledger_entries")
    .select(
      "id, submission_id, kind, amount_cents, period, reconciled, created_at, submissions(status, scenarios(property_address))"
    )
    .order("period", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<Entry[]>();

  const entries = data ?? [];

  const periods = [...new Set(entries.map((e) => e.period))].sort().reverse();
  const totals = periods.map((period) => {
    const rows = entries.filter((e) => e.period === period);
    const gross = rows.reduce((sum, e) => sum + e.amount_cents, 0);
    const reconciled = rows.filter((e) => e.reconciled).reduce((s, e) => s + e.amount_cents, 0);
    return {
      period,
      rows,
      gross,
      reconciled,
      outstanding: gross - reconciled,
      unmatched: rows.filter((e) => !e.reconciled).length,
    };
  });

  const outstandingTotal = totals.reduce((sum, t) => sum + t.outstanding, 0);
  const unmatchedTotal = totals.reduce((sum, t) => sum + t.unmatched, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fee ledger"
        description="Fees earned per submission, totalled by month, with anything still unmatched flagged rather than buried."
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            title="No fees recorded yet"
            body="A fee is recorded against a submission once it is approved. The ledger totals by month and flags whatever has not been reconciled."
            action={<ButtonLink href="/submissions">Open submissions</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Entries</p>
              <p className="mt-1 font-mono text-2xl tabular-nums">{entries.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Periods</p>
              <p className="mt-1 font-mono text-2xl tabular-nums">{periods.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Unreconciled</p>
              <p
                className={`mt-1 font-mono text-2xl tabular-nums ${unmatchedTotal ? "text-warn" : "text-ok"}`}
              >
                {unmatchedTotal}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Outstanding</p>
              <p className="mt-1 font-mono text-2xl tabular-nums">{cents(outstandingTotal)}</p>
            </Card>
          </div>

          {totals.map((total) => (
            <Card key={total.period} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                  <h2 className="font-medium">{monthLabel(total.period)}</h2>
                  <p className="text-xs text-muted">
                    {total.rows.length} {total.rows.length === 1 ? "entry" : "entries"},{" "}
                    {cents(total.reconciled)} reconciled of {cents(total.gross)}
                  </p>
                </div>
                {total.unmatched ? (
                  <Chip tone="warn">
                    {total.unmatched} unmatched, {cents(total.outstanding)}
                  </Chip>
                ) : (
                  <Chip tone="ok">Fully reconciled</Chip>
                )}
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="px-4 py-2.5 font-medium">Kind</th>
                    <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Against</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">State</th>
                  </tr>
                </thead>
                <tbody>
                  {total.rows.map((entry) => (
                    <tr key={entry.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {KIND_LABEL[entry.kind] ?? entry.kind}
                      </td>
                      <td className="hidden max-w-xs truncate px-4 py-2.5 text-muted sm:table-cell">
                        {entry.submissions?.scenarios?.property_address ?? "submission removed"}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                          entry.amount_cents < 0 ? "text-bad" : ""
                        }`}
                      >
                        {cents(entry.amount_cents)}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.reconciled ? (
                          <span className="text-ok">reconciled</span>
                        ) : (
                          <span className="text-warn">unmatched</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}

          <p className="text-xs text-muted text-pretty">
            Every figure here belongs to this organisation. A seat at another lender running
            the same page gets its own ledger, because the rows are filtered by the
            database rather than by this screen. See{" "}
            <Link href="/audit" className="text-(--accent) hover:underline">
              the audit trail
            </Link>{" "}
            for who changed what.
          </p>
        </>
      )}
    </div>
  );
}

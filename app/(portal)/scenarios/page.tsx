import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import { PURPOSE_LABELS, money, percent, type Scenario } from "@/lib/scenarios";
import { Card, Chip, EmptyState, ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Scenarios" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function ScenariosPage() {
  await requireClaims();
  const supabase = await createClient();

  // No tenant filter anywhere in this file.
  const { data } = await supabase
    .from("scenarios")
    .select(
      "id, org_id, borrower_id, property_address, purchase_price, down_payment, loan_purpose, loan_amount, ltv, credit_band, requested_by_seat, created_at, borrowers(first_name, last_name), scenario_results(count)"
    )
    .order("created_at", { ascending: false })
    .returns<
      Array<
        Scenario & {
          borrowers: { first_name: string; last_name: string } | null;
          scenario_results: Array<{ count: number }>;
        }
      >
    >();

  const scenarios = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Scenarios"
        description="Every financing scenario this organisation has run, with the number of lenders that could take it."
        actions={
          <ButtonLink href="/scenarios/new" variant="primary">
            New scenario
          </ButtonLink>
        }
      />

      <Card className="overflow-hidden">
        {scenarios.length === 0 ? (
          <EmptyState
            title="No scenarios yet"
            body="Run one against a borrower on your book and the panel comes back ranked, with the reason each lender did or did not take it."
            action={
              <ButtonLink href="/scenarios/new" variant="primary">
                New scenario
              </ButtonLink>
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line/60 sm:hidden">
              {scenarios.map((scenario) => (
                <li key={scenario.id}>
                  <Link
                    href={`/scenarios/${scenario.id}`}
                    className="flex flex-col gap-1 px-4 py-3 hover:bg-raised/60"
                  >
                    <span className="font-medium">{scenario.property_address}</span>
                    <span className="text-sm text-muted">
                      {money(scenario.loan_amount)} at {percent(scenario.ltv)}
                    </span>
                    <span className="text-xs text-muted">
                      {scenario.borrowers
                        ? `${scenario.borrowers.last_name}, ${scenario.borrowers.first_name}`
                        : "borrower removed"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="px-4 py-2.5 font-medium">Property</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Borrower</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Loan</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">LTV</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Purpose</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Lenders</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Run</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => (
                  <tr
                    key={scenario.id}
                    className="border-b border-line/60 last:border-0 hover:bg-raised/50"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/scenarios/${scenario.id}`} className="hover:text-(--accent)">
                        {scenario.property_address}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {scenario.borrowers
                        ? `${scenario.borrowers.last_name}, ${scenario.borrowers.first_name}`
                        : "borrower removed"}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                      {money(scenario.loan_amount)}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">{percent(scenario.ltv)}</td>
                    <td className="px-4 py-3">
                      <Chip>{PURPOSE_LABELS[scenario.loan_purpose]}</Chip>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {scenario.scenario_results?.[0]?.count ?? 0}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {dateFormat.format(new Date(scenario.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}

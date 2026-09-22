import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import { getMatchingService } from "@/lib/matching";
import {
  PURPOSE_LABELS,
  money,
  percent,
  rate,
  type Scenario,
  type ScenarioResultRow,
} from "@/lib/scenarios";
import { Card, Chip, Detail, EmptyState, ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Scenario results" };

/** The rate band drawn across the panel's whole spread, so the cards compare. */
function RateBand({ low, high, min, max }: { low: number; high: number; min: number; max: number }) {
  const span = Math.max(0.001, max - min);
  const left = ((low - min) / span) * 100;
  const width = Math.max(4, ((high - low) / span) * 100);
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-raised" aria-hidden>
      <div
        className="h-full rounded-full bg-(--accent)"
        style={{ marginLeft: `${left}%`, width: `${width}%` }}
      />
    </div>
  );
}

export default async function ScenarioResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireClaims();
  const { id } = await params;
  const supabase = await createClient();

  // No tenant filter. Another organisation's scenario is not refused, it is
  // absent, and the page 404s.
  const { data: scenario } = await supabase
    .from("scenarios")
    .select(
      "id, org_id, borrower_id, property_address, purchase_price, down_payment, loan_purpose, loan_amount, ltv, credit_band, requested_by_seat, created_at"
    )
    .eq("id", id)
    .maybeSingle<Scenario>();

  if (!scenario) notFound();

  const [{ data: results }, { data: borrower }] = await Promise.all([
    supabase
      .from("scenario_results")
      .select(
        "id, org_id, scenario_id, lender_alias, rate_low, rate_high, ltv_max, term_months, fee_range_low, fee_range_high, created_at"
      )
      .eq("scenario_id", scenario.id)
      .order("rate_low")
      .returns<ScenarioResultRow[]>(),
    supabase
      .from("borrowers")
      .select("id, first_name, last_name")
      .eq("id", scenario.borrower_id)
      .maybeSingle<{ id: string; first_name: string; last_name: string }>(),
  ]);

  const quotes = results ?? [];

  // The quotes on screen are the stored ones: they were written when the
  // scenario was run and nobody holds the privilege to change them since.
  // The service is asked again only for the explanation, which is not stored
  // because it is derived. The service is deterministic, so the two agree.
  const service = getMatchingService();
  const explained = await service.match({
    propertyAddress: scenario.property_address,
    purchasePrice: Number(scenario.purchase_price),
    downPayment: Number(scenario.down_payment),
    creditBand: scenario.credit_band,
    loanPurpose: scenario.loan_purpose,
  });
  const reasonsByAlias = new Map(explained.results.map((r) => [r.lenderAlias, r.reasons]));

  const lows = quotes.map((q) => Number(q.rate_low));
  const highs = quotes.map((q) => Number(q.rate_high));
  const min = lows.length ? Math.min(...lows) : 0;
  const max = highs.length ? Math.max(...highs) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/scenarios" className="text-sm text-muted hover:text-ink">
          Scenarios
        </Link>
        <PageHeader
          title={scenario.property_address}
          description={
            <span className="flex flex-wrap items-center gap-2">
              {borrower ? (
                <Link
                  href={`/borrowers/${borrower.id}`}
                  className="hover:text-(--accent)"
                >
                  {borrower.first_name} {borrower.last_name}
                </Link>
              ) : null}
              <Chip>{PURPOSE_LABELS[scenario.loan_purpose]}</Chip>
              <Chip>{scenario.credit_band}</Chip>
            </span>
          }
          actions={<ButtonLink href="/scenarios/new" variant="secondary">New scenario</ButtonLink>}
        />
      </div>

      <Card className="p-5">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Detail label="Purchase price">
            <span className="font-mono text-lg tabular-nums">{money(scenario.purchase_price)}</span>
          </Detail>
          <Detail label="Deposit">
            <span className="font-mono text-lg tabular-nums">{money(scenario.down_payment)}</span>
          </Detail>
          <Detail label="Loan amount">
            <span className="font-mono text-lg tabular-nums">{money(scenario.loan_amount)}</span>
          </Detail>
          <Detail label="Loan to value">
            <span className="font-mono text-lg tabular-nums">{percent(scenario.ltv)}</span>
          </Detail>
        </dl>
      </Card>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            {quotes.length === 1 ? "1 lender can take this" : `${quotes.length} lenders can take this`}
          </h2>
          <p className="text-xs text-muted">
            Ranked by rate. Lender identities are not disclosed, and the portal never
            receives them.
          </p>
        </div>

        {quotes.length ? (
          <ol className="mt-3 flex flex-col gap-3">
            {quotes.map((quote, index) => (
              <li key={quote.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised font-mono text-sm tabular-nums"
                      >
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{quote.lender_alias}</p>
                        <p className="text-xs text-muted">
                          {quote.term_months / 12} year term, lends to {percent(quote.ltv_max)} of
                          value
                        </p>
                      </div>
                      {index === 0 ? <Chip tone="ok">Sharpest rate</Chip> : null}
                    </div>

                    <div className="min-w-48 flex-1 text-right">
                      <p className="font-mono text-xl tabular-nums">
                        {rate(quote.rate_low)}
                        <span className="text-muted"> to {rate(quote.rate_high)}</span>
                      </p>
                      <RateBand
                        low={Number(quote.rate_low)}
                        high={Number(quote.rate_high)}
                        min={min}
                        max={max}
                      />
                      <p className="mt-1.5 text-xs text-muted">
                        Fees {money(quote.fee_range_low)} to {money(quote.fee_range_high)}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3">
                    {(reasonsByAlias.get(quote.lender_alias) ?? []).map((reason) => (
                      <li key={reason} className="flex gap-2 text-sm text-muted">
                        <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-ok" />
                        <span className="text-pretty">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ol>
        ) : (
          <Card className="mt-3">
            <EmptyState
              title="No lender on the panel can take this one"
              body="Every lender is listed below with the reason, and with the one change that would bring it in."
              action={<ButtonLink href="/scenarios/new" variant="primary">Try different numbers</ButtonLink>}
            />
          </Card>
        )}
      </div>

      {explained.misses.length ? (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">What would change the result</h2>
          <p className="mt-0.5 text-xs text-muted">
            The lenders that could not take this file, and the single change that would
            bring each one in.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {explained.misses.map((miss) => (
              <li key={miss.lenderAlias}>
                <Card className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
                  <span className="font-medium">{miss.lenderAlias}</span>
                  <span className="text-sm text-muted">{miss.reason}</span>
                  <span className="w-full text-sm text-pretty text-(--accent)">
                    {miss.wouldChangeIt}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted text-pretty">
        Quotes are stored as ranges against an alias and cannot be edited after the fact:
        no role in this system holds update or delete on them. Source of this run:{" "}
        <span className="font-mono">{service.kind}</span> matching service, which runs
        inside this application and calls nothing.
      </p>
    </div>
  );
}

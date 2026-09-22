import type { Metadata } from "next";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { money, percent, type Scenario } from "@/lib/scenarios";
import { propertyIntelligence } from "@/lib/property-intelligence";
import { Card, Chip, Detail, EmptyState, ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Property intelligence" };

export default async function PropertyIntelligencePage() {
  // The gate is here, on the server, before anything is produced.
  //
  // premium is read from the organisation's own row, which the caller can see
  // but cannot write: the update grant on organizations covers the three
  // branding columns only, so an administrator cannot switch this on for
  // itself. There is no hidden button and no client side check to bypass,
  // because for a tenant without the tier the panel is never rendered and its
  // data is never fetched.
  const { org } = await getPortalContext();

  if (!org.premium) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Property intelligence"
          description="A premium tier feature."
        />
        <Card>
          <EmptyState
            title="Not included in this organisation's plan"
            body="Property intelligence is part of the premium tier. This decision is made on the server from the organisation's own record, so nothing about the panel or its data is sent to this browser."
            action={<ButtonLink href="/">Back to the overview</ButtonLink>}
          />
        </Card>
        <p className="text-xs text-muted text-pretty">
          The tier cannot be changed from inside the portal. The column is readable
          and not writable by any seat, including an administrator, which the
          isolation tests assert.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select(
      "id, org_id, borrower_id, property_address, purchase_price, down_payment, loan_purpose, loan_amount, ltv, credit_band, requested_by_seat, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(6)
    .returns<Scenario[]>();

  const rows = (scenarios ?? []).map((scenario) => ({
    scenario,
    intelligence: propertyIntelligence(scenario.property_address, Number(scenario.purchase_price)),
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Property intelligence"
        description="Valuation context for the properties this organisation has run scenarios against."
        actions={<Chip tone="accent">Premium</Chip>}
      />

      {rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ scenario, intelligence }) => {
            const delta = intelligence.estimatedValue - Number(scenario.purchase_price);
            return (
              <Card key={scenario.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-pretty">{scenario.property_address}</p>
                    <p className="text-xs text-muted">
                      Scenario at {money(scenario.loan_amount)}, {percent(scenario.ltv)} of price
                    </p>
                  </div>
                  <Chip tone={delta >= 0 ? "ok" : "warn"}>
                    {delta >= 0 ? "Above" : "Below"} the asking price
                  </Chip>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4">
                  <Detail label="Estimated value">
                    <span className="font-mono text-lg tabular-nums">
                      {money(intelligence.estimatedValue)}
                    </span>
                  </Detail>
                  <Detail label="Confidence">
                    <span className="font-mono text-lg tabular-nums">
                      {intelligence.confidence}%
                    </span>
                  </Detail>
                  <Detail label="Rental estimate">
                    <span className="font-mono tabular-nums">
                      {money(intelligence.monthlyRent)} a month
                    </span>
                  </Detail>
                  <Detail label="Days on market, area">
                    <span className="font-mono tabular-nums">{intelligence.daysOnMarket}</span>
                  </Detail>
                </dl>

                <p className="mt-4 border-t border-line pt-3 text-sm text-muted text-pretty">
                  {intelligence.note}
                </p>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Nothing to value yet"
            body="Run a financing scenario and the property behind it appears here with its valuation context."
            action={<ButtonLink href="/scenarios/new" variant="primary">New scenario</ButtonLink>}
          />
        </Card>
      )}

      <p className="text-xs text-muted text-pretty">
        Figures come from the property intelligence stub inside this application. It is
        deterministic and calls nothing. It is the point where a real property data
        engine plugs in, behind the same function.
      </p>
    </div>
  );
}

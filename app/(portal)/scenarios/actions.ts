"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import { getMatchingService } from "@/lib/matching";
import type { CreditBand, LoanPurpose } from "@/lib/matching";
import { CREDIT_BANDS, LOAN_PURPOSES } from "@/lib/scenarios";

export interface ScenarioFormState {
  error: string | null;
}

const toNumber = (value: FormDataEntryValue | null) =>
  Number(String(value ?? "").replace(/[^0-9.]/g, ""));

/**
 * Build a scenario, ask the matching service, and keep both.
 *
 * The tenant comes from the verified claims, never from the form, and the
 * database checks it again through the insert policy. The borrower id does
 * come from the form, which is exactly why it is read back through a policy
 * scoped query first: a borrower id belonging to another organisation
 * resolves to nothing and the action stops.
 */
export async function createScenario(
  _previous: ScenarioFormState,
  formData: FormData
): Promise<ScenarioFormState> {
  const claims = await requireClaims();
  const supabase = await createClient();

  const borrowerId = String(formData.get("borrower_id") ?? "");
  const propertyAddress = String(formData.get("property_address") ?? "").trim();
  const purchasePrice = toNumber(formData.get("purchase_price"));
  const downPayment = toNumber(formData.get("down_payment"));
  const creditBand = String(formData.get("credit_band") ?? "") as CreditBand;
  const loanPurpose = String(formData.get("loan_purpose") ?? "") as LoanPurpose;

  if (!borrowerId) return { error: "Choose a borrower." };
  if (!propertyAddress) return { error: "Enter the property address." };
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    return { error: "Enter the purchase price." };
  }
  if (!Number.isFinite(downPayment) || downPayment < 0) {
    return { error: "Enter the deposit, or zero." };
  }
  if (downPayment >= purchasePrice) {
    return { error: "The deposit has to be less than the purchase price." };
  }
  if (!CREDIT_BANDS.includes(creditBand)) return { error: "Choose a credit band." };
  if (!LOAN_PURPOSES.some((p) => p.value === loanPurpose)) {
    return { error: "Choose what the loan is for." };
  }

  // The borrower must be one this seat can already see. The policies decide
  // that, not this code: an id from another tenant simply returns nothing.
  const { data: borrower } = await supabase
    .from("borrowers")
    .select("id")
    .eq("id", borrowerId)
    .maybeSingle<{ id: string }>();

  if (!borrower) return { error: "That borrower is not on this organisation's book." };

  const service = getMatchingService();
  const matched = await service.match({
    propertyAddress,
    purchasePrice,
    downPayment,
    creditBand,
    loanPurpose,
  });

  const { data: scenario, error } = await supabase
    .from("scenarios")
    .insert({
      org_id: claims.orgId,
      borrower_id: borrower.id,
      property_address: propertyAddress,
      purchase_price: purchasePrice,
      down_payment: downPayment,
      loan_purpose: loanPurpose,
      loan_amount: matched.loanAmount,
      ltv: matched.ltv,
      credit_band: creditBand,
      requested_by_seat: claims.seatId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !scenario) {
    return { error: error?.message ?? "The scenario could not be saved." };
  }

  if (matched.results.length) {
    // Only the ranges and the alias are kept. The lender's identity never
    // reaches this database, whichever implementation produced the quote.
    const { error: resultsError } = await supabase.from("scenario_results").insert(
      matched.results.map((result) => ({
        org_id: claims.orgId,
        scenario_id: scenario.id,
        lender_alias: result.lenderAlias,
        rate_low: result.rateLow,
        rate_high: result.rateHigh,
        ltv_max: result.ltvMax,
        term_months: result.termMonths,
        fee_range_low: result.feeRangeLow,
        fee_range_high: result.feeRangeHigh,
      }))
    );
    if (resultsError) return { error: resultsError.message };
  }

  revalidatePath("/scenarios");
  redirect(`/scenarios/${scenario.id}`);
}

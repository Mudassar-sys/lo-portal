import type { CreditBand, LoanPurpose } from "@/lib/matching";

export interface Scenario {
  id: string;
  org_id: string;
  borrower_id: string;
  property_address: string;
  purchase_price: string;
  down_payment: string;
  loan_purpose: LoanPurpose;
  loan_amount: string;
  ltv: string;
  credit_band: CreditBand;
  requested_by_seat: string | null;
  created_at: string;
}

export interface ScenarioResultRow {
  id: string;
  org_id: string;
  scenario_id: string;
  lender_alias: string;
  rate_low: string;
  rate_high: string;
  ltv_max: string;
  term_months: number;
  fee_range_low: string;
  fee_range_high: string;
  created_at: string;
}

export const CREDIT_BANDS: CreditBand[] = [
  "740+",
  "700-739",
  "660-699",
  "620-659",
  "below-620",
];

export const LOAN_PURPOSES: Array<{ value: LoanPurpose; label: string }> = [
  { value: "purchase", label: "Purchase" },
  { value: "refinance", label: "Refinance" },
  { value: "cash_out_refinance", label: "Cash out refinance" },
  { value: "construction", label: "Construction" },
];

export const PURPOSE_LABELS: Record<LoanPurpose, string> = {
  purchase: "Purchase",
  refinance: "Refinance",
  cash_out_refinance: "Cash out refinance",
  construction: "Construction",
};

export const money = (value: number | string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));

export const percent = (value: number | string) => `${Number(value).toFixed(2)}%`;

export const rate = (value: number | string) => `${Number(value).toFixed(3)}%`;

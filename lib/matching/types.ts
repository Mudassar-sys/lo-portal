/**
 * The matching boundary.
 *
 * This file is the contract. Everything the portal knows about lender
 * matching is in these types, and the portal imports nothing else from the
 * matching folder except getMatchingService().
 *
 * There is exactly one implementation in this repository and it is a mock:
 * lib/matching/mock.ts. It invents nothing at run time, it calls nothing, and
 * it reaches no network. Replacing it with a real integration means writing a
 * second implementation of MatchingService and returning it from
 * lib/matching/index.ts. No screen, no action and no table changes.
 *
 * What the portal deliberately never receives, whichever implementation is in
 * place: a lender's identity. A result carries an alias and ranges. That is
 * the product rule, so it is expressed in the type rather than in a comment
 * on a screen.
 */

export type CreditBand = "740+" | "700-739" | "660-699" | "620-659" | "below-620";

export type LoanPurpose = "purchase" | "refinance" | "cash_out_refinance" | "construction";

export interface MatchingRequest {
  propertyAddress: string;
  purchasePrice: number;
  downPayment: number;
  creditBand: CreditBand;
  loanPurpose: LoanPurpose;
}

/** What one lender is willing to say, without saying who it is. */
export interface MatchingResult {
  lenderAlias: string;
  rateLow: number;
  rateHigh: number;
  ltvMax: number;
  termMonths: number;
  feeRangeLow: number;
  feeRangeHigh: number;
  /** Why this product matched, in the words a loan officer would use. */
  reasons: string[];
}

/** A lender that did not match, and the one thing that would change it. */
export interface MatchingMiss {
  lenderAlias: string;
  reason: string;
  wouldChangeIt: string;
}

export interface MatchingResponse {
  loanAmount: number;
  ltv: number;
  results: MatchingResult[];
  misses: MatchingMiss[];
}

export interface MatchingService {
  readonly kind: "mock" | "live";
  match(request: MatchingRequest): Promise<MatchingResponse>;
}

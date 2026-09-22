// ===========================================================================
// MOCK. This file is not a lending integration and must never become one.
// ===========================================================================
//
// It exists so the portal can be built, demonstrated and reviewed end to end
// without any external system. It:
//   calls nothing, reaches no network, and names no external host;
//   is deterministic, so the same scenario always produces the same quotes
//     and a screenshot taken today matches the one taken next week;
//   returns ranges and aliases only, never a lender identity.
//
// The product rules it encodes (which lender bands exist, what each will
// lend against, how a credit band moves a rate) are placeholders chosen to
// look plausible on screen. They are not anybody's real pricing.
//
// When a real integration arrives it goes in a sibling file implementing the
// same MatchingService interface, and lib/matching/index.ts returns that
// instead. Nothing else in the portal changes.
// ===========================================================================

import type {
  CreditBand,
  LoanPurpose,
  MatchingRequest,
  MatchingResponse,
  MatchingResult,
  MatchingMiss,
  MatchingService,
} from "./types";

/** Base rate by credit band, before any adjustment. Placeholder pricing. */
const BASE_RATE: Record<CreditBand, number> = {
  "740+": 6.125,
  "700-739": 6.375,
  "660-699": 6.75,
  "620-659": 7.25,
  "below-620": 7.875,
};

/** What each purpose adds to the rate. Placeholder pricing. */
const PURPOSE_ADJUSTMENT: Record<LoanPurpose, number> = {
  purchase: 0,
  refinance: 0.125,
  cash_out_refinance: 0.375,
  construction: 0.625,
};

interface Product {
  alias: string;
  rateOffset: number;
  ltvMax: number;
  termMonths: number;
  minLoan: number;
  maxLoan: number;
  minBand: CreditBand;
  purposes: LoanPurpose[];
  feeLowPct: number;
  feeHighPct: number;
  character: string;
}

const BAND_ORDER: CreditBand[] = ["below-620", "620-659", "660-699", "700-739", "740+"];
const bandAtLeast = (band: CreditBand, floor: CreditBand) =>
  BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(floor);

const CATALOGUE: Product[] = [
  {
    alias: "Lender A",
    rateOffset: 0,
    ltvMax: 80,
    termMonths: 360,
    minLoan: 150_000,
    maxLoan: 1_500_000,
    minBand: "700-739",
    purposes: ["purchase", "refinance"],
    feeLowPct: 0.75,
    feeHighPct: 1.1,
    character: "the sharpest rate of the panel, and the tightest on deposit and credit",
  },
  {
    alias: "Lender B",
    rateOffset: 0.125,
    ltvMax: 90,
    termMonths: 360,
    minLoan: 100_000,
    maxLoan: 1_250_000,
    minBand: "660-699",
    purposes: ["purchase", "refinance", "cash_out_refinance"],
    feeLowPct: 0.9,
    feeHighPct: 1.35,
    character: "takes a smaller deposit for a little more on the rate",
  },
  {
    alias: "Lender C",
    rateOffset: 0.25,
    ltvMax: 97,
    termMonths: 240,
    minLoan: 75_000,
    maxLoan: 750_000,
    minBand: "620-659",
    purposes: ["purchase"],
    feeLowPct: 0.6,
    feeHighPct: 0.95,
    character: "the high deposit-light option, on a shorter term",
  },
  {
    alias: "Lender D",
    rateOffset: 0.5,
    ltvMax: 75,
    termMonths: 360,
    minLoan: 400_000,
    maxLoan: 3_000_000,
    minBand: "660-699",
    purposes: ["purchase", "refinance", "cash_out_refinance", "construction"],
    feeLowPct: 0.5,
    feeHighPct: 0.85,
    character: "the one that will look at larger and more unusual files",
  },
];

const PURPOSE_WORDS: Record<LoanPurpose, string> = {
  purchase: "a purchase",
  refinance: "a refinance",
  cash_out_refinance: "a cash out refinance",
  construction: "construction",
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

export class MockMatchingService implements MatchingService {
  readonly kind = "mock" as const;

  async match(request: MatchingRequest): Promise<MatchingResponse> {
    const loanAmount = round2(request.purchasePrice - request.downPayment);
    const ltv = request.purchasePrice > 0 ? round2((loanAmount / request.purchasePrice) * 100) : 0;

    const results: MatchingResult[] = [];
    const misses: MatchingMiss[] = [];

    for (const product of CATALOGUE) {
      const reasonsAgainst: MatchingMiss[] = [];

      if (!product.purposes.includes(request.loanPurpose)) {
        reasonsAgainst.push({
          lenderAlias: product.alias,
          reason: `does not lend on ${PURPOSE_WORDS[request.loanPurpose]}`,
          wouldChangeIt: "Nothing on this file. This lender does not write that purpose at all.",
        });
      }
      if (!bandAtLeast(request.creditBand, product.minBand)) {
        reasonsAgainst.push({
          lenderAlias: product.alias,
          reason: `wants ${product.minBand} or better, this file is ${request.creditBand}`,
          wouldChangeIt: `Moving the borrower to ${product.minBand} brings this one in.`,
        });
      }
      if (ltv > product.ltvMax) {
        const neededDeposit = round2(request.purchasePrice * (1 - product.ltvMax / 100));
        reasonsAgainst.push({
          lenderAlias: product.alias,
          reason: `lends to ${product.ltvMax}% of value, this file asks for ${ltv}%`,
          wouldChangeIt: `A deposit of ${money(neededDeposit)}, which is ${money(
            neededDeposit - request.downPayment
          )} more, brings this one in.`,
        });
      }
      if (loanAmount < product.minLoan) {
        reasonsAgainst.push({
          lenderAlias: product.alias,
          reason: `does not write loans under ${money(product.minLoan)}`,
          wouldChangeIt: `A loan of ${money(product.minLoan)} or more would qualify.`,
        });
      }
      if (loanAmount > product.maxLoan) {
        reasonsAgainst.push({
          lenderAlias: product.alias,
          reason: `stops at ${money(product.maxLoan)}, this file asks for ${money(loanAmount)}`,
          wouldChangeIt: `A larger deposit, bringing the loan under ${money(product.maxLoan)}.`,
        });
      }

      if (reasonsAgainst.length) {
        // One miss per lender, the first reason, so the screen stays readable.
        misses.push(reasonsAgainst[0]!);
        continue;
      }

      const rateLow = round3(
        BASE_RATE[request.creditBand] + product.rateOffset + PURPOSE_ADJUSTMENT[request.loanPurpose]
      );

      const reasons = [
        `Lends to ${product.ltvMax}% of value and this file is at ${ltv}%.`,
        `Writes ${PURPOSE_WORDS[request.loanPurpose]} at ${request.creditBand}.`,
        `${money(loanAmount)} sits inside its ${money(product.minLoan)} to ${money(
          product.maxLoan
        )} range.`,
        `In short, ${product.character}.`,
      ];

      results.push({
        lenderAlias: product.alias,
        rateLow,
        rateHigh: round3(rateLow + 0.5),
        ltvMax: product.ltvMax,
        termMonths: product.termMonths,
        feeRangeLow: round2((loanAmount * product.feeLowPct) / 100),
        feeRangeHigh: round2((loanAmount * product.feeHighPct) / 100),
        reasons,
      });
    }

    // Cheapest first, then the smaller fee, then the alias. Stable, so the
    // same scenario always ranks the same way.
    results.sort(
      (a, b) =>
        a.rateLow - b.rateLow ||
        a.feeRangeLow - b.feeRangeLow ||
        a.lenderAlias.localeCompare(b.lenderAlias)
    );

    return { loanAmount, ltv, results, misses };
  }
}

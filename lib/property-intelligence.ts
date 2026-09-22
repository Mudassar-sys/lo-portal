// ===========================================================================
// STUB. Not a property data integration, and it must never become one.
// ===========================================================================
//
// It produces deterministic valuation context from the address and the price
// so the premium panel has something honest to show. It reaches no network,
// names no data provider, and invents nothing at run time: the same address
// and price always produce the same figures.
//
// This is where a real property intelligence engine would be called, behind
// this same function signature.
// ===========================================================================

export interface PropertyIntelligence {
  estimatedValue: number;
  confidence: number;
  monthlyRent: number;
  daysOnMarket: number;
  note: string;
}

/** A small stable hash, so the same address always lands on the same numbers. */
function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

export function propertyIntelligence(address: string, price: number): PropertyIntelligence {
  const seed = hash(address.toLowerCase());

  // Value lands within about eight per cent either side of the price.
  const swing = ((seed % 161) - 80) / 1000;
  const estimatedValue = Math.round((price * (1 + swing)) / 500) * 500;

  const confidence = 72 + (seed % 24);
  const monthlyRent = Math.round((estimatedValue * (0.0045 + ((seed >> 3) % 20) / 10000)) / 25) * 25;
  const daysOnMarket = 12 + ((seed >> 5) % 48);

  const delta = estimatedValue - price;
  const direction =
    delta >= 0
      ? `The estimate sits above the agreed price, which usually helps the loan to value stand up on survey.`
      : `The estimate sits below the agreed price, so expect the lender to lend against the lower of the two.`;

  return {
    estimatedValue,
    confidence,
    monthlyRent,
    daysOnMarket,
    note: `${direction} Comparable stock in this area is taking about ${daysOnMarket} days to sell.`,
  };
}

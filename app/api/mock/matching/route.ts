import { NextResponse, type NextRequest } from "next/server";
import { getPortalClaims } from "@/lib/auth";
import { getMatchingService } from "@/lib/matching";
import { CREDIT_BANDS, LOAN_PURPOSES } from "@/lib/scenarios";
import type { CreditBand, LoanPurpose } from "@/lib/matching";

/**
 * The matching endpoint, in the shape the portal would call a real one.
 *
 * It is here because the integration plan is written against an HTTP
 * boundary, and a reviewer should be able to see the request and the response
 * without reading the screens. The portal's own scenario builder calls the
 * service directly rather than looping back through HTTP.
 *
 * It is served by the mock. It calls nothing and reaches no network.
 */
export async function POST(request: NextRequest) {
  const claims = await getPortalClaims();
  if (!claims) {
    return NextResponse.json({ error: "No seat on this network." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const purchasePrice = Number(body.purchasePrice);
  const downPayment = Number(body.downPayment);
  const creditBand = String(body.creditBand);
  const loanPurpose = String(body.loanPurpose);
  const propertyAddress = String(body.propertyAddress ?? "");

  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    return NextResponse.json({ error: "purchasePrice must be a positive number." }, { status: 400 });
  }
  if (!Number.isFinite(downPayment) || downPayment < 0 || downPayment >= purchasePrice) {
    return NextResponse.json(
      { error: "downPayment must be zero or more, and less than purchasePrice." },
      { status: 400 }
    );
  }
  if (!CREDIT_BANDS.includes(creditBand as CreditBand)) {
    return NextResponse.json({ error: "creditBand is not one of the known bands." }, { status: 400 });
  }
  if (!LOAN_PURPOSES.some((p) => p.value === loanPurpose)) {
    return NextResponse.json({ error: "loanPurpose is not one of the known purposes." }, { status: 400 });
  }

  const service = getMatchingService();
  const response = await service.match({
    propertyAddress,
    purchasePrice,
    downPayment,
    creditBand: creditBand as CreditBand,
    loanPurpose: loanPurpose as LoanPurpose,
  });

  return NextResponse.json({ source: service.kind, ...response });
}

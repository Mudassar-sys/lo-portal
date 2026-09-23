import { RecordNotFound } from "@/components/not-found";

/**
 * Reached when the borrower id in the address resolves to no row for this
 * seat, which is what row level security returns for another lender's record.
 * It renders inside the portal layout, so the tenant's own header, navigation
 * and accent are still on screen: a dead end, not a different application.
 */
export default function BorrowerNotFound() {
  return <RecordNotFound backHref="/borrowers" backLabel="Back to borrowers" />;
}

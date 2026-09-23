import { RecordNotFound } from "@/components/not-found";

/**
 * The same dead end for a scenario id that belongs to another lender. The
 * panel is shared with the borrower route deliberately: two surfaces with two
 * wordings is how one of them ends up saying more than it should.
 */
export default function ScenarioNotFound() {
  return <RecordNotFound backHref="/scenarios" backLabel="Back to scenarios" />;
}

import { MockMatchingService } from "./mock";
import type { MatchingService } from "./types";

export type {
  CreditBand,
  LoanPurpose,
  MatchingRequest,
  MatchingResponse,
  MatchingResult,
  MatchingMiss,
  MatchingService,
} from "./types";

/**
 * The one place the matching implementation is chosen.
 *
 * Today it returns the mock, which calls nothing and invents nothing at run
 * time. A real integration is a second class implementing MatchingService and
 * one changed line here. Everything upstream of this function is written
 * against the interface, so the swap does not reach a screen, an action or a
 * table.
 *
 * The service reports its own kind, and the results screen prints it, so a
 * reviewer can never mistake mock output for live output.
 */
export function getMatchingService(): MatchingService {
  return new MockMatchingService();
}

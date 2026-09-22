/**
 * The submission status machine.
 *
 * It lives here, not beside the server actions, because a module marked
 * "use server" may export only async functions. This is the third time that
 * rule has bitten in this build: a constant exported from an actions file can
 * compile cleanly and then arrive in the browser as a server function stub,
 * so `NEXT_STATUS[status]` returns undefined, every button disappears, and
 * every row silently reads as finished.
 */
export const NEXT_STATUS: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["in_review"],
  in_review: ["approved", "declined"],
  approved: [],
  declined: [],
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  declined: "Declined",
};

/** What the button that moves a submission to this status should say. */
export const ACTION_LABEL: Record<string, string> = {
  submitted: "Submit",
  in_review: "Take into review",
  approved: "Approve",
  declined: "Decline",
};

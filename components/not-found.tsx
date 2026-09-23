import type { ComponentProps } from "react";
import type Link from "next/link";
import { Card, ButtonLink } from "@/components/ui";

/**
 * The dead end a reference reaches when it is not this organisation's.
 *
 * The wording is the point. It does not say forbidden, because forbidden is an
 * answer: it tells the asker that the record is real and belongs to someone
 * else. Row level security does not return a filtered row, it returns no row,
 * and the screen says exactly that and nothing more. The same panel is used
 * for a borrower, a scenario and an unmatched route, so no one surface can
 * become the informative one by accident.
 */
export const NOT_FOUND_HEADING = "Nothing here for this organisation";

export const NOT_FOUND_BODY =
  "The reference in this address does not belong to a record this organisation holds. " +
  "Records from other lenders are not hidden, they do not exist for your seat.";

export function RecordNotFound({
  backHref,
  backLabel,
}: {
  backHref: ComponentProps<typeof Link>["href"];
  backLabel: string;
}) {
  return (
    <Card className="mx-auto max-w-xl">
      <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div
          aria-hidden
          className="flex size-11 items-center justify-center rounded-full border border-dashed border-line"
        >
          <span className="size-2 rounded-full bg-muted/60" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-balance">
            {NOT_FOUND_HEADING}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted text-pretty">
            {NOT_FOUND_BODY}
          </p>
        </div>
        <ButtonLink href={backHref} variant="primary">
          {backLabel}
        </ButtonLink>
      </div>
    </Card>
  );
}

/**
 * The same dead end for a public enquiry link.
 *
 * The wording differs from the record panel for one reason: the visitor has no
 * seat and no organisation, so a sentence about "this organisation" would be
 * addressed to someone who does not have one. It lives in this file beside the
 * other message so the two cannot drift apart unnoticed, and it reveals just
 * as little: a link that was never issued and a link that was retired read
 * exactly the same.
 */
export function LinkNotFound() {
  return (
    <Card className="mx-auto max-w-xl">
      <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div
          aria-hidden
          className="flex size-11 items-center justify-center rounded-full border border-dashed border-line"
        >
          <span className="size-2 rounded-full bg-muted/60" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-balance">
            Nothing here for this link
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted text-pretty">
            This enquiry link is not live. It may have been retired by the lender who
            issued it, or it may never have existed. Ask whoever sent it to you for a
            current one.
          </p>
        </div>
      </div>
    </Card>
  );
}

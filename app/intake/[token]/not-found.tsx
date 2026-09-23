import type { Metadata } from "next";
import { LinkNotFound } from "@/components/not-found";

export const metadata: Metadata = { title: "Enquiry" };

/**
 * Reached when the token in the address resolves to no live intake link.
 *
 * It renders the network's own shell rather than a lender's, because the
 * token is what names the lender and there is no token here to name one.
 * Nothing on this page distinguishes a retired link from one that never
 * existed, so the page cannot be used to find out which lenders are on the
 * network.
 */
export default function IntakeNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="size-8 rounded-md bg-(--accent)" />
        <span className="font-semibold tracking-tight">Fieldstone Lending Network</span>
      </div>
      <LinkNotFound />
    </div>
  );
}

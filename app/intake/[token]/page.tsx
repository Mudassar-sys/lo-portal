import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IntakeForm } from "./intake-form";

export const metadata: Metadata = { title: "Enquiry" };

interface Branding {
  display_name: string;
  accent_color: string;
  logo_url: string | null;
}

/**
 * The branded borrower intake, one per organisation.
 *
 * It is the only page in the portal that a person without a seat can open,
 * and the whole page is derived from the link token. The visitor's role holds
 * no table privileges at all: the branding comes from one security definer
 * function that answers only for a live token, and the submission goes
 * through another that resolves the organisation itself. Neither takes an
 * organisation from the caller, so a borrower's details cannot be steered
 * into a tenant that did not hand out the link.
 */
export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // The function returns a set, so this is a list of at most one row: a live
  // token gives one, an unknown or retired token gives none.
  const { data } = await supabase.rpc("intake_branding", { p_token: token });
  const branding = (data as Branding[] | null)?.[0];
  if (!branding) notFound();

  return (
    <div
      style={{ "--accent": branding.accent_color } as React.CSSProperties}
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-12"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="size-8 rounded-md bg-(--accent)" />
          <span className="font-semibold tracking-tight">{branding.display_name}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Tell us how to reach you
        </h1>
        <p className="text-sm text-muted text-pretty">
          A few details and a loan officer at {branding.display_name} will pick this up.
          Nothing here is a credit application and no check is run.
        </p>
      </header>

      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <IntakeForm token={token} orgName={branding.display_name} />
      </div>

      <p className="text-center text-xs text-muted">
        {branding.display_name} on Fieldstone Lending Network
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal";
import { ROLE_LABELS } from "@/lib/auth";
import { Card, Chip, Detail, PageHeader } from "@/components/ui";
import { BrandingForm } from "./branding-form";

export const metadata: Metadata = { title: "Organisation" };

export default async function SettingsPage() {
  const { org, claims } = await getPortalContext();
  const supabase = await createClient();

  const { data: link } = await supabase
    .from("intake_links")
    .select("token, active")
    .eq("active", true)
    .limit(1)
    .maybeSingle<{ token: string; active: boolean }>();

  // The public link has to carry the host the visitor will actually use, and
  // the request knows it, so it is not kept in configuration.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const scheme = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const intakeUrl = link ? `${scheme}://${host}/intake/${link.token}` : null;

  const isAdmin = claims.orgRole === "org_admin";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Organisation"
        description="How this lender appears to its own people and to the borrowers it sends a link to."
        actions={org.premium ? <Chip tone="accent">Premium</Chip> : <Chip>Standard</Chip>}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-medium">White labelling</h2>
          <p className="mt-1 text-sm text-muted text-pretty">
            The accent is applied on the server from this record, so it is right on the
            first paint rather than after a fetch.
          </p>
          <div className="mt-4">
            <BrandingForm
              displayName={org.display_name}
              accentColor={org.accent_color}
              logoUrl={org.logo_url}
              canEdit={isAdmin}
            />
          </div>
          {!isAdmin ? (
            <p className="mt-3 text-xs text-muted text-pretty">
              Your seat is {ROLE_LABELS[claims.orgRole].toLowerCase()}, so these fields are
              read only. An administrator can change them, and even an administrator cannot
              change the tier: the update grant covers three columns and `premium` is not
              one of them.
            </p>
          ) : null}
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="font-medium">Public intake link</h2>
            <p className="mt-1 text-sm text-muted text-pretty">
              Hand this to a borrower. The page carries the name and colour of this
              organisation, and anything submitted through it lands here and nowhere
              else, because the token decides the tenant rather than the form.
            </p>
            {intakeUrl ? (
              <a
                href={intakeUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block rounded-lg border border-line bg-raised px-3 py-2 font-mono text-xs break-all hover:border-(--accent)"
              >
                {intakeUrl}
              </a>
            ) : (
              <p className="mt-3 text-sm text-muted">No active link.</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-medium">This tenant</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label="Tier">{org.premium ? "Premium" : "Standard"}</Detail>
              <Detail label="Slug">
                <span className="font-mono text-xs">{org.slug}</span>
              </Detail>
              <Detail label="Your seat">{ROLE_LABELS[claims.orgRole]}</Detail>
              <Detail label="Tenant id">
                <span className="font-mono text-xs break-all">{claims.orgId}</span>
              </Detail>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

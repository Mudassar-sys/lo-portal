import { createClient } from "@/lib/supabase/server";
import { requireClaims, type PortalClaims, type OrgRole } from "@/lib/auth";

export interface Organization {
  id: string;
  slug: string;
  display_name: string;
  logo_url: string | null;
  accent_color: string;
  premium: boolean;
}

export interface Seat {
  id: string;
  org_id: string;
  label: string;
  role: OrgRole;
  login_email: string | null;
  user_id: string | null;
  active_session_id: string | null;
  is_demo_admin: boolean;
  created_at: string;
}

export interface PortalContext {
  claims: PortalClaims;
  org: Organization;
  seat: Seat;
}

/**
 * Who is asking, which tenant they belong to, and how that tenant is branded.
 *
 * Note what is not happening here: the organisation is not looked up by an id
 * taken from the URL or from a form. The query asks for the caller's own
 * organisation and the policies return exactly one row, the caller's. If the
 * claims named another tenant the query would return nothing at all.
 */
export async function getPortalContext(): Promise<PortalContext> {
  const claims = await requireClaims();
  const supabase = await createClient();

  const [{ data: org }, { data: seat }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, slug, display_name, logo_url, accent_color, premium")
      .eq("id", claims.orgId)
      .single<Organization>(),
    supabase
      .from("seats")
      .select("id, org_id, label, role, login_email, user_id, active_session_id, is_demo_admin, created_at")
      .eq("id", claims.seatId)
      .single<Seat>(),
  ]);

  if (!org || !seat) {
    throw new Error(
      "The signed in seat resolved to no tenant. Check that the access token hook is enabled on the project."
    );
  }

  return { claims, org, seat };
}

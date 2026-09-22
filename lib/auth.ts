import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgRole = "org_admin" | "manager" | "loan_officer";

/**
 * The verified identity of the current request.
 *
 * Every field here comes out of a token whose signature has been checked, and
 * every one of them is written by the access token hook in
 * supabase/schema.sql. Nothing in this object can be set by the caller, which
 * is why server actions read the tenant from here and never from form data.
 */
export interface PortalClaims {
  userId: string;
  sessionId: string | null;
  orgId: string;
  orgRole: OrgRole;
  seatId: string;
  isDemoAdmin: boolean;
  email: string | null;
}

const ROLES: readonly OrgRole[] = ["org_admin", "manager", "loan_officer"];

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Read and verify the claims of the current request, or null when there is no
 * valid session.
 *
 * getClaims verifies the token signature rather than trusting the cookie. A
 * forged or edited cookie fails here. A token that is missing the tenant
 * claims is treated as no session at all, because the only way a token lacks
 * them is that the access token hook is not enabled on the project, and in
 * that state every policy would see a null tenant.
 */
export async function getPortalClaims(): Promise<PortalClaims | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const claims = data.claims as Record<string, unknown>;

  const orgId = asString(claims.org_id);
  const seatId = asString(claims.seat_id);
  const orgRole = asString(claims.org_role);
  const userId = asString(claims.sub);

  if (!orgId || !seatId || !userId) return null;
  if (!orgRole || !ROLES.includes(orgRole as OrgRole)) return null;

  return {
    userId,
    sessionId: asString(claims.session_id),
    orgId,
    orgRole: orgRole as OrgRole,
    seatId,
    isDemoAdmin: claims.is_demo_admin === true,
    email: asString(claims.email),
  };
}

/**
 * The same thing, for code that cannot run without an identity.
 *
 * The proxy already redirects a signed out visitor, but a matcher change or a
 * refactor can silently remove that cover, and the framework's own guidance is
 * to verify inside each server function rather than to rely on the proxy
 * alone. So every action and every protected screen calls this.
 */
export async function requireClaims(): Promise<PortalClaims> {
  const claims = await getPortalClaims();
  if (!claims) redirect("/login");
  return claims;
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  org_admin: "Administrator",
  manager: "Manager",
  loan_officer: "Loan officer",
};

export function canManage(role: OrgRole): boolean {
  return role === "org_admin" || role === "manager";
}
